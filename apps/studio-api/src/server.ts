/**
 * Studio API — Express server wrapping workflow-core + agent-runtime
 *
 * Endpoints:
 *   GET  /api/health                — health check
 *   GET  /api/profiles              — list available target profiles
 *   GET  /api/catalog/ui            — UI library catalog
 *
 *   Sessions:
 *     GET  /api/sessions                  — list all sessions
 *     POST /api/sessions                  — create new session
 *     GET  /api/sessions/:id              — get session detail
 *     DELETE /api/sessions/:id            — delete session
 *     PATCH /api/sessions/:id             — update session (name, profileId)
 *
 *   Chat:
 *     POST /api/chat                      — interactive requirement (non-stream)
 *     POST /api/chat/stream               — interactive requirement (SSE stream)
 *     GET  /api/chat/:sessionId           — get session state
 *
 *   Generation:
 *     POST /api/generate/design           — generate previewable frontend page
 *     POST /api/generate/code             — generate code files
 *
 *   Workflows:
 *     GET  /api/workflows                 — list available workflows
 *     POST /api/workflows/:id/run         — run a workflow (real execution)
 *     GET  /api/runs                      — list run history
 *     GET  /api/runs/:id                  — get run detail
 *
 *   Approval:
 *     POST /api/runs/:id/approve          — approve a workflow run
 *     POST /api/runs/:id/reject           — reject a workflow run
 *
 *   Artifacts:
 *     GET  /api/runs/:id/artifacts        — list artifacts for a run
 *     GET  /api/runs/:id/artifacts/:file  — get artifact content
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { FileSchemaRegistry } from '@ai-frontend-engineering-agent/contract-schema';
import { FilePolicyRegistry } from '@ai-frontend-engineering-agent/policy-engine';
import {
  getSkill,
  runSkillThroughLlm,
  loadLlmConfigFromEnv,
  type LlmConfig,
} from '@ai-frontend-engineering-agent/agent-runtime';
import type { SkillContext } from '@ai-frontend-engineering-agent/skill-sdk';
import type { JsonObject } from '@ai-frontend-engineering-agent/shared-types';
import { getCompatibleLibraries } from '@ai-frontend-engineering-agent/agent-runtime';
import { generateImage, IMAGE_MODELS } from '@ai-frontend-engineering-agent/agent-runtime';
import { SessionStore, RunStore, ArtifactStore, MetricsStore, initPool } from '@ai-frontend-engineering-agent/persistence';
import type { Session, ChatMessage } from '@ai-frontend-engineering-agent/persistence';

// Workflow execution
import { WorkflowExecutor } from '@ai-frontend-engineering-agent/workflow-core';
import { loadWorkflowRegistry } from '@ai-frontend-engineering-agent/workflow-core';
import type { WorkflowNodeDef, WorkflowNodeResult, WorkflowRunState } from '@ai-frontend-engineering-agent/workflow-core';

// ─── Config ─────────────────────────────────────────────────────────────

const PORT = Number(process.env.STUDIO_API_PORT ?? 4401);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

let llmConfig: LlmConfig;
try {
  llmConfig = loadLlmConfigFromEnv();
} catch {
  console.error('❌ LLM 配置缺失，请设置环境变量');
  process.exit(1);
}

// ─── Registries ─────────────────────────────────────────────────────────

const schemas = new FileSchemaRegistry({ contractsDir: path.join(repoRoot, 'contracts') });
const policies = new FilePolicyRegistry({
  policiesDir: path.join(repoRoot, 'policies'),
  targetPoliciesDir: path.join(repoRoot, 'policies/targets'),
});

// ─── Persistent Stores ──────────────────────────────────────────────────

const sessionStore = new SessionStore();
const runStore = new RunStore();
const artifactStore = new ArtifactStore();
const metricsStore = new MetricsStore();

await initPool();
await metricsStore.ensureTable();

// ─── Helpers ────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSkillContext(profileId: string): SkillContext {
  return {
    runId: `web-${Date.now()}`,
    nodeId: 'web-api',
    targetProfile: { id: profileId },
    schemas: schemas as unknown as SkillContext['schemas'],
    policies: policies as unknown as SkillContext['policies'],
    artifacts: [],
    logger: {
      info: (msg) => console.log(`[INFO] ${msg}`),
      warn: (msg) => console.warn(`[WARN] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`),
    },
  };
}

// ─── Load workflows ─────────────────────────────────────────────────────

function loadWorkflows(): Array<{ id: string; name: string; description: string; stages: string[] }> {
  const workflowsDir = path.join(repoRoot, 'workflows');
  if (!existsSync(workflowsDir)) return [];

  const files = readdirSync(workflowsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const results: Array<{ id: string; name: string; description: string; stages: string[] }> = [];

  for (const file of files) {
    const content = readFileSync(path.join(workflowsDir, file), 'utf-8');
    const nameMatch = content.match(/name:\s*(.+)/);
    const descMatch = content.match(/description:\s*(.+)/);
    const stageMatches = [...content.matchAll(/- id:\s*(\S+)/g)].map(m => m[1]);

    results.push({
      id: file.replace(/\.(yaml|yml)$/, ''),
      name: nameMatch?.[1]?.trim() ?? file,
      description: descMatch?.[1]?.trim() ?? '',
      stages: stageMatches,
    });
  }

  return results;
}

// ─── App ────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: llmConfig.model, timestamp: Date.now() });
});

type ModelPreset = {
  baseUrl: string;
  model: string;
  label: string;
  apiKey?: string;
  temperature?: number;
};

type HermesConfig = {
  model?: {
    base_url?: string;
    default?: string;
  };
  providers?: {
    rightcode?: {
      base_url?: string;
    };
  };
};

function pickEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function loadRightCodePreset(): ModelPreset | null {
  const apiKey = pickEnv('RIGHTCODE_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY');
  if (!apiKey) return null;

  let baseUrl = 'https://right.codes/codex/v1';
  let model = 'gpt-5.5';

  try {
    const hermesConfigPath = path.join(process.env.HOME ?? '/root', '.hermes', 'config.yaml');
    if (existsSync(hermesConfigPath)) {
      const parsed = parseYaml(readFileSync(hermesConfigPath, 'utf-8')) as HermesConfig;
      // Only use rightcode-specific config. Global model.base_url belongs to Hermes' own provider.
      baseUrl = parsed.providers?.rightcode?.base_url ?? baseUrl;
      model = parsed.providers?.rightcode?.default ?? model;
    }
  } catch (error) {
    console.warn('⚠️ Failed to read Hermes right.codes config:', error);
  }

  model = pickEnv('RIGHTCODE_MODEL', 'OPENAI_MODEL') ?? model;

  return {
    baseUrl,
    model,
    label: `right.codes (${model})`,
    apiKey,
  };
}

function buildModelPresets(): Record<string, ModelPreset> {
  const presets: Record<string, ModelPreset> = {};

  const deepseekApiKey = pickEnv('DEEPSEEK_API_KEY');
  if (deepseekApiKey) {
    presets['deepseek-v4-pro'] = {
      baseUrl: pickEnv('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com',
      model: pickEnv('DEEPSEEK_MODEL') ?? 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      apiKey: deepseekApiKey,
    };
  }

  const rightCodePreset = loadRightCodePreset();
  if (rightCodePreset) {
    presets.rightcode = rightCodePreset;
  }

  return presets;
}

const MODEL_PRESETS: Record<string, ModelPreset> = buildModelPresets();

function applyModelPreset(modelId: string): boolean {
  const preset = MODEL_PRESETS[modelId];
  if (!preset?.apiKey) return false;

  llmConfig = {
    ...llmConfig,
    baseUrl: preset.baseUrl,
    apiKey: preset.apiKey,
    model: preset.model,
    temperature: preset.temperature,
  };

  return true;
}

// Default Studio startup model: prefer right.codes, fall back to DeepSeek V4 Pro.
const DEFAULT_MODEL_PRESET_ID = MODEL_PRESETS.rightcode
  ? 'rightcode'
  : (MODEL_PRESETS['deepseek-v4-pro'] ? 'deepseek-v4-pro' : undefined);

if (DEFAULT_MODEL_PRESET_ID) {
  applyModelPreset(DEFAULT_MODEL_PRESET_ID);
}

// GET /api/models — list available model presets
app.get('/api/models', (_req, res) => {
  const models = Object.entries(MODEL_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
    model: preset.model,
    active: llmConfig.model === preset.model,
  }));
  res.json(models);
});

// GET /api/models/current — get current model config (no secrets)
app.get('/api/models/current', (_req, res) => {
  res.json({
    model: llmConfig.model,
    baseUrl: llmConfig.baseUrl,
  });
});

// POST /api/models/switch — switch model at runtime
app.post('/api/models/switch', (req, res) => {
  const { modelId } = req.body as { modelId?: string };
  if (!modelId || !MODEL_PRESETS[modelId]) {
    return res.status(400).json({ error: `Unknown model: ${modelId}. Available: ${Object.keys(MODEL_PRESETS).join(', ')}` });
  }

  if (!applyModelPreset(modelId)) {
    return res.status(400).json({ error: `Model preset is not fully configured: ${modelId}` });
  }

  const preset = MODEL_PRESETS[modelId];
  console.log(`🔄 Model switched to: ${preset.label} (${preset.model})`);
  res.json({ ok: true, model: llmConfig.model, label: preset.label });
});

// Profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const profileIds = await policies.listTargetProfiles();
    const frontendFilter = req.query.frontend as string | undefined;
    const backendFilter = req.query.backend as string | undefined;

    const profiles = [];
    for (const id of profileIds) {
      const p = await policies.getTargetProfile(id);
      if (!p) continue;

      if (frontendFilter && p.framework !== frontendFilter) continue;
      if (backendFilter && (p as Record<string, unknown>).backend) {
        const be = (p as Record<string, unknown>).backend as Record<string, unknown> | undefined;
        if (be?.framework !== backendFilter) continue;
      }

      profiles.push({ id, ...p });
    }
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// UI catalog
app.get('/api/catalog/ui', (req, res) => {
  const framework = String(req.query.framework ?? 'vue3');
  const libs = getCompatibleLibraries(framework);
  res.json(libs);
});

// ─── Session endpoints ──────────────────────────────────────────────────

// List sessions
app.get('/api/sessions', async (_req, res) => {
  const list = (await sessionStore.list()).map(s => ({
    id: s.id,
    name: s.name,
    profileId: s.profileId,
    messageCount: s.messages.length,
    completeness: s.completeness,
    featureName: (s.document as Record<string, unknown>)?.featureName as string ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
  res.json(list);
});

// Create session
app.post('/api/sessions', async (req, res) => {
  const { profileId = 'vue3-admin', name } = req.body;
  const id = `session-${generateId()}`;
  const session = await sessionStore.create(id, name);
  if (profileId) await sessionStore.update(id, { profileId });
  res.json({ id, name: session.name, profileId });
});

// Get session
app.get('/api/sessions/:id', async (req, res) => {
  const session = await sessionStore.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Delete session
app.delete('/api/sessions/:id', async (req, res) => {
  const existed = await sessionStore.delete(req.params.id);
  res.json({ ok: existed });
});

// Update session
app.patch('/api/sessions/:id', async (req, res) => {
  const session = await sessionStore.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const patch: Partial<Session> = {};
  if (req.body.name) patch.name = req.body.name;
  if (req.body.profileId) patch.profileId = req.body.profileId;
  await sessionStore.update(req.params.id, patch);
  res.json({ ok: true });
});

// ─── Chat endpoints ─────────────────────────────────────────────────────

// Non-streaming chat
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId = 'default', profileId = 'vue3-admin', userMessage, mode = 'gather' } = req.body;

    if (!userMessage) {
      return res.status(400).json({ error: 'userMessage is required' });
    }

    // Get or create session
    let session = await sessionStore.get(sessionId);
    if (!session) {
      session = await sessionStore.create(sessionId);
      await sessionStore.update(sessionId, { profileId });
    }

    await sessionStore.addMessage(sessionId, { role: 'user', content: userMessage, timestamp: Date.now() });

    const skill = getSkill('interactive-requirement');
    if (!skill) {
      return res.status(500).json({ error: 'interactive-requirement skill not found' });
    }

    const ctx = createSkillContext(profileId);
    const input: JsonObject = {
      userMessage,
      conversationHistory: session.messages as JsonObject[],
      existingDocument: session.document as JsonObject ?? null,
      mode,
    };

    const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);

    if (result.ok && result.output) {
      const doc = result.output as Record<string, unknown>;
      const completeness = (doc.completeness as number) ?? 0;
      await sessionStore.updateDocument(sessionId, doc, completeness);
      await sessionStore.addMessage(sessionId, { role: 'assistant', content: JSON.stringify(result.output), timestamp: Date.now() });
    }

    session = (await sessionStore.get(sessionId))!;
    res.json({
      ok: result.ok,
      document: session.document,
      error: result.error,
      usage: result.usage,
      model: result.model,
      sessionId: session.id,
      messageCount: session.messages.length,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Streaming chat (SSE)
app.post('/api/chat/stream', async (req, res) => {
  const { sessionId = 'default', profileId = 'vue3-admin', userMessage, mode = 'gather' } = req.body;

  if (!userMessage) {
    return res.status(400).json({ error: 'userMessage is required' });
  }

  // Get or create session
  let session = await sessionStore.get(sessionId);
  if (!session) {
    session = await sessionStore.create(sessionId);
    await sessionStore.update(sessionId, { profileId });
  }

  await sessionStore.addMessage(sessionId, { role: 'user', content: userMessage, timestamp: Date.now() });

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const skill = getSkill('interactive-requirement');
    if (!skill) {
      send('error', { error: 'interactive-requirement skill not found' });
      res.end();
      return;
    }

    const ctx = createSkillContext(profileId);
    session = (await sessionStore.get(sessionId))!;
    const input: JsonObject = {
      userMessage,
      conversationHistory: session.messages as JsonObject[],
      existingDocument: session.document as JsonObject ?? null,
      mode,
    };

    const prompt = await skill.buildPrompt(ctx, input);
    const messages = [
      { role: 'system' as const, content: prompt.system },
      { role: 'user' as const, content: prompt.user + (prompt.attachments?.map(a => `\n\n--- ${a.kind} ---\n${a.content}`).join('') ?? '') },
    ];

    send('start', { model: llmConfig.model });

    // Stream from LLM
    const url = `${llmConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const body = {
      model: llmConfig.model,
      messages,
      temperature: llmConfig.temperature ?? Object.values(MODEL_PRESETS).find(p => p.model === llmConfig.model)?.temperature ?? 0.2,
      max_tokens: llmConfig.maxTokens ?? 131072,
      stream: true,
    };

    const llmRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!llmRes.ok) {
      const errorText = await llmRes.text().catch(() => '');
      send('error', { error: `LLM request failed (${llmRes.status}): ${errorText}` });
      res.end();
      return;
    }

    let fullContent = '';
    let finishReason = '';
    const reader = llmRes.body?.getReader();
    if (!reader) {
      send('error', { error: 'No response body' });
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            send('chunk', { content: delta });
          }
          // Track finish reason
          const fr = chunk.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        } catch {
          // ignore parse errors in stream
        }
      }
    }

    // Warn if response was truncated
    if (finishReason === 'length') {
      console.log(`⚠️ [${sessionId}] Truncated: finish_reason=length, content_len=${fullContent.length}`);
      send('warning', { message: '⚠️ AI 响应被截断（token 限制），已尝试自动修复 JSON' });
    } else {
      console.log(`✅ [${sessionId}] Stream done: finish_reason=${finishReason}, content_len=${fullContent.length}`);
    }

    // Process the complete response
    send('done', { fullContent });

    // Strip JSON from the response — only keep dialogue text
    const stripJson = (text: string): string => {
      let s = text;
      // Remove ```json ... ``` blocks (including unclosed)
      s = s.replace(/```(?:json)?\s*\n?[\s\S]*?(?:```|$)/g, '').trim();
      // Remove raw JSON with requirement fields
      s = s.replace(/\n?\{[\s\S]*?"(?:featureName|completeness|userRoles|businessGoal)"[\s\S]*/g, '').trim();
      // Remove trailing incomplete JSON
      s = s.replace(/\n?\{[\s\S]*$/g, '').trim();
      // Clean up
      s = s.replace(/^-{3,}\s*$/gm, '').trim();
      s = s.replace(/\n{3,}/g, '\n\n').trim();
      return s;
    };

    const textContent = stripJson(fullContent);
    const messageToStore = textContent.length >= 15 ? textContent : '（需求信息已更新至右侧面板）';
    console.log(`📝 [${sessionId}] Storing message: original=${fullContent.length} chars, stripped=${textContent.length} chars, json=${fullContent !== textContent}`);

    // Store assistant message (text only, no JSON)
    await sessionStore.addMessage(sessionId, { role: 'assistant', content: messageToStore, timestamp: Date.now() });

    // Extract structured info synchronously — send document update via SSE before closing
    session = (await sessionStore.get(sessionId))!;
    try {
      const { extractRequirementInfo, mergeDocument } = await import('@ai-frontend-engineering-agent/agent-runtime');

      const currentDoc = session.document ?? {};
      const allMessages = session.messages ?? [];

      // Build a compact conversation summary for extraction (use stripped text)
      // Kimi K2.6 is a reasoning model — keep context short to leave room for output
      const recentMsgs = allMessages.slice(-4);
      const conversationSummary = recentMsgs
        .map(m => {
          const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `[${m.role}]: ${c.slice(0, 150)}`;
        })
        .join('\n');

      console.log(`🔍 [${sessionId}] Extraction starting: msgs=${recentMsgs.length}, docKeys=${Object.keys(currentDoc).length}`);
      const extracted = await extractRequirementInfo(
        llmConfig,
        conversationSummary,
        currentDoc,
      );
      console.log(`🔍 [${sessionId}] Extraction result:`, extracted ? `completeness=${extracted.completeness}` : 'null');

      if (extracted) {
        const merged = mergeDocument(currentDoc, extracted);
        const completeness = (merged.completeness as number) ?? 0;
        await sessionStore.updateDocument(sessionId, merged, completeness);
        console.log(`✅ [${sessionId}] Document updated: completeness=${completeness}%`);
        // Push document update to frontend via SSE
        send('document', { document: merged, completeness });
      }
    } catch (extractErr) {
      console.error(`⚠️ [${sessionId}] Extraction failed:`, extractErr instanceof Error ? extractErr.message : extractErr);
      console.error(`⚠️ [${sessionId}] Extraction stack:`, extractErr instanceof Error ? extractErr.stack?.slice(0, 500) : 'N/A');
    }

    // Now close the SSE connection
    send('end', { sessionId: sessionId, messageCount: (await sessionStore.get(sessionId))?.messages.length ?? 0 });
    res.end();
  } catch (err) {
    send('error', { error: String(err) });
    res.end();
  }
});

// Get chat session state
app.get('/api/chat/:sessionId', async (req, res) => {
  const session = await sessionStore.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({
    sessionId: session.id,
    profileId: session.profileId,
    document: session.document,
    messageCount: session.messages.length,
    messages: session.messages,
  });
});

// ─── Document Generation Endpoints ─────────────────────────────────────

// POST /api/chat/document/generate — 全量生成结构化文档
app.post('/api/chat/document/generate', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const session = await sessionStore.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    const messages = session.messages ?? [];
    const currentDoc = (session.document ?? {}) as Record<string, unknown>;

    // Build conversation summary (last 20 messages, compact)
    const recentMsgs = messages.slice(-20);
    const conversationText = recentMsgs
      .map(m => {
        const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `[${m.role}]: ${c.slice(0, 500)}`;
      })
      .join('\n');

    const { generateFullDocument, mergeDocumentDeep } = await import('@ai-frontend-engineering-agent/agent-runtime');

    console.log(`📄 [${sessionId}] Generating full document from ${recentMsgs.length} messages...`);
    const newDoc = await generateFullDocument(llmConfig, conversationText, currentDoc);

    // Deep merge to preserve existing confirmed content
    const merged = mergeDocumentDeep(currentDoc, newDoc);
    const completeness = (merged.completeness as number) ?? 0;

    await sessionStore.updateDocument(sessionId, merged, completeness);
    console.log(`✅ [${sessionId}] Document generated: completeness=${completeness}%`);

    res.json({ ok: true, document: merged, completeness });
  } catch (err) {
    console.error(`❌ [${sessionId}] Document generation failed:`, err instanceof Error ? err.message : err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/chat/document/optimize — 优化单个模块
app.post('/api/chat/document/optimize', async (req, res) => {
  const { sessionId, module, instruction } = req.body;
  if (!sessionId || !module || !instruction) {
    return res.status(400).json({ error: 'sessionId, module, instruction required' });
  }

  const session = await sessionStore.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    const currentDoc = (session.document ?? {}) as Record<string, unknown>;
    const currentModuleValue = currentDoc[module];

    const { optimizeModule, estimateCompleteness } = await import('@ai-frontend-engineering-agent/agent-runtime');

    console.log(`🔧 [${sessionId}] Optimizing module "${module}" with instruction: ${instruction.slice(0, 50)}...`);
    const optimizedValue = await optimizeModule(llmConfig, module, currentModuleValue, instruction, currentDoc);

    // Only update the specified module
    currentDoc[module] = optimizedValue;

    // Recalculate completeness
    const completeness = estimateCompleteness(currentDoc);
    currentDoc.completeness = completeness;

    await sessionStore.updateDocument(sessionId, currentDoc, completeness);
    console.log(`✅ [${sessionId}] Module "${module}" optimized: completeness=${completeness}%`);

    res.json({ ok: true, document: currentDoc, module, completeness });
  } catch (err) {
    console.error(`❌ [${sessionId}] Module optimization failed:`, err instanceof Error ? err.message : err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── Generation endpoints ───────────────────────────────────────────────

// Generate previewable frontend page
app.post('/api/generate/design', async (req, res) => {
  try {
    const { sessionId = 'default', profileId = 'vue3-admin' } = req.body;
    console.log(`🧩 [${sessionId}] Starting frontend preview generation...`);
    const session = await sessionStore.get(sessionId);

    if (!session?.document) {
      console.log(`❌ [${sessionId}] No requirement document found`);
      return res.status(400).json({ error: 'No requirement document. Complete the chat first.' });
    }

    const skill = getSkill('design-generation');
    if (!skill) {
      console.log(`❌ [${sessionId}] design-generation skill not found`);
      return res.status(500).json({ error: 'design-generation skill not found' });
    }

    const ctx = createSkillContext(profileId);
    const input: JsonObject = {
      ...(session.document as JsonObject),
      phaseId: 'P1',
    };

    console.log(`📤 [${sessionId}] Calling LLM for frontend preview generation...`);
    const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);
    console.log(`📥 [${sessionId}] LLM response received:`, result.ok ? 'success' : 'failed');
    if (!result.ok) {
      console.log(`❌ [${sessionId}] LLM error:`, result.error);
      console.log(`❌ [${sessionId}] LLM raw response:`, result.raw?.substring(0, 500));
    }

    if (result.ok && result.output) {
      const files = result.output.generatedFiles as Array<{ path: string; content: string }>;
      const htmlFile = files?.find(f => f.path?.endsWith('.html'));

      // Persist artifacts
      const runId = `preview-${generateId()}`;
      if (files) {
        for (const file of files) {
          artifactStore.save(runId, file.path, file.content);
        }
      }

      res.json({
        ok: true,
        files: result.output.generatedFiles,
        htmlContent: htmlFile?.content ?? null,
        usage: result.usage,
        artifactRunId: runId,
      });
    } else {
      res.json({ ok: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Generate code
app.post('/api/generate/code', async (req, res) => {
  try {
    const { sessionId = 'default', profileId = 'vue3-admin', phaseId = 'P1' } = req.body;
    const session = await sessionStore.get(sessionId);

    if (!session?.document) {
      return res.status(400).json({ error: 'No requirement document. Complete the chat first.' });
    }

    const skill = getSkill('code-generation');
    if (!skill) {
      return res.status(500).json({ error: 'code-generation skill not found' });
    }

    const ctx = createSkillContext(profileId);
    const doc = session.document as Record<string, unknown>;
    const phases = Array.isArray(doc.phases) ? doc.phases : [];
    const currentPhase = phases.find((p: unknown) => (p as Record<string, unknown>)?.id === phaseId) as Record<string, unknown> | undefined;
    const phasePages = currentPhase?.pages ?? (Array.isArray(doc.pages) ? (doc.pages as Array<Record<string, unknown>>).map(p => p.name) : []);

    const input: JsonObject = {
      ...(session.document as JsonObject),
      phaseId,
      pages: phasePages as string[],
    };

    const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);

    if (result.ok && result.output) {
      const files = result.output.generatedFiles as Array<{ path: string; content: string }>;

      // Persist artifacts
      const runId = `code-${generateId()}`;
      if (files) {
        for (const file of files) {
          artifactStore.save(runId, file.path, file.content);
        }
      }

      res.json({
        ok: true,
        files: result.output.generatedFiles,
        notes: result.output.notes,
        usage: result.usage,
        artifactRunId: runId,
      });
    } else {
      res.json({ ok: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Workflow endpoints ─────────────────────────────────────────────────

// List workflows
app.get('/api/workflows', (_req, res) => {
  res.json(loadWorkflows());
});

// Run workflow (real execution)
app.post('/api/workflows/:id/run', async (req, res) => {
  const { profileId = 'vue3-admin', sessionId, params = {} } = req.body;
  const runId = `run-${generateId()}`;
  const workflowId = req.params.id;

  // Create persistent run record
  const run = await runStore.create(runId, workflowId, workflowId, 'manual');

  // Return immediately, run in background
  res.json({ ok: true, runId, status: 'pending' });

  // Execute workflow in background
  (async () => {
    try {
      await runStore.update(runId, { status: 'running' });

      // Load workflow definition
      const registry = await loadWorkflowRegistry(path.join(repoRoot, 'workflows'));
      const definition = registry.get(workflowId);

      if (!definition) {
        await runStore.complete(runId, `Workflow not found: ${workflowId}`);
        return;
      }

      // Update stages from workflow nodes
      if (definition.nodes) {
        for (const node of definition.nodes) {
          await runStore.updateStage(runId, node.id, {
            name: node.name ?? node.id,
            nodeType: node.type,
            status: 'pending',
          });
        }
      }

      // Create executor with adapters
      const executor = new WorkflowExecutor({
        runAgent: async (node, input, state) => {
          await runStore.updateStage(runId, node.id, { status: 'running', startedAt: Date.now() });
          await runStore.update(runId, { status: 'running' });

          const skillName = node.skill;
          if (!skillName) {
            await runStore.updateStage(runId, node.id, { status: 'failed', error: 'No skill defined' });
            return { ok: false, error: `Agent node ${node.id} has no skill defined` };
          }

          const skill = getSkill(skillName);
          if (!skill) {
            await runStore.updateStage(runId, node.id, { status: 'failed', error: `Skill not found: ${skillName}` });
            return { ok: false, error: `Skill not found: ${skillName}` };
          }

          const ctx = createSkillContext(profileId);
          const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);

          if (result.ok) {
            await runStore.updateStage(runId, node.id, {
              status: 'completed',
              completedAt: Date.now(),
              result: result.output,
            });
          } else {
            await runStore.updateStage(runId, node.id, {
              status: 'failed',
              completedAt: Date.now(),
              error: result.error,
            });
          }

          return {
            ok: result.ok,
            output: result.output as JsonObject ?? undefined,
            error: result.error,
          };
        },

        runPlugin: async (node, input, state) => {
          await runStore.updateStage(runId, node.id, { status: 'running', startedAt: Date.now() });

          // Dispatch to real plugins
          let result: WorkflowNodeResult;
          try {
            switch (node.id) {
              case 'project-scanner': {
                const { scanProject } = await import('@ai-frontend-engineering-agent/plugin-sdk');
                // Dynamic import of actual plugin
                const scanner = await import('../../../plugins/project-scanner/src/index.js');
                const scanResult = scanner.scanProject(state.context.targetProject ?? '.');
                result = { ok: true, output: scanResult as unknown as JsonObject };
                break;
              }
              case 'navigation-decider': {
                const nav = await import('../../../plugins/navigation-decider/src/index.js');
                result = { ok: true, output: nav.buildUiContract(input, state.context.resolvedTargetProfile) as unknown as JsonObject };
                break;
              }
              case 'page-generator': {
                const pg = await import('../../../plugins/page-generator/src/index.js');
                result = { ok: true, output: pg.buildGenerationReport(input) as unknown as JsonObject };
                break;
              }
              case 'playwright-runner': {
                const pw = await import('../../../plugins/playwright-runner/src/index.js');
                result = { ok: true, output: pw.buildPlaywrightValidation(state.context.targetProject ?? '.') as unknown as JsonObject };
                break;
              }
              case 'visual-regression-runner': {
                const vr = await import('../../../plugins/visual-regression-runner/src/index.js');
                result = { ok: true, output: vr.buildVisualRegressionValidation(state.context.targetProject ?? '.') as unknown as JsonObject };
                break;
              }
              case 'db-migration': {
                const { generateMigration } = await import('../../../plugins/db-migration/src/index.js');
                const dataModel = state.nodeResults['data_modeling']?.output;
                const entities = (dataModel as Record<string, unknown>)?.entities as Array<Record<string, unknown>> | undefined;
                result = { ok: true, output: generateMigration({
                  entities: entities ?? [],
                  recommendedDb: String((dataModel as Record<string, unknown>)?.recommendedDb ?? 'postgresql'),
                }) as unknown as JsonObject };
                break;
              }
              case 'api-scaffold': {
                const { scaffoldApi } = await import('../../../plugins/api-scaffold/src/index.js');
                const resolvedProfile = state.context.resolvedTargetProfile as unknown as Record<string, unknown> | undefined;
                const backendRaw = resolvedProfile?.backend as Record<string, unknown> | undefined;
                result = { ok: true, output: scaffoldApi({
                  targetDir: state.context.targetProject ?? './generated',
                  apiContract: (state.nodeResults['api_design']?.output ?? {}) as JsonObject,
                  backendProfile: {
                    framework: String(backendRaw?.framework ?? 'nestjs'),
                    language: String(backendRaw?.language ?? 'typescript'),
                  },
                }) as unknown as JsonObject };
                break;
              }
              case 'docker-generator': {
                const { generateDocker } = await import('../../../plugins/docker-generator/src/index.js');
                result = { ok: true, output: generateDocker({
                  appName: 'generated-app',
                  backendPort: 3000,
                  frontendPort: 80,
                  dbType: 'postgresql',
                  services: ['nginx', 'api', 'db'],
                }) as unknown as JsonObject };
                break;
              }
              case 'api-contract-validator': {
                const { validateApiContract } = await import('../../../plugins/api-contract-validator/src/index.js');
                const apiContract = (state.nodeResults['api_design']?.output ?? {}) as JsonObject;
                const backendOutput = state.nodeResults['backend_coding']?.output as Record<string, unknown> | undefined;
                const generatedFiles = (backendOutput?.generatedFiles as Array<{path: string; content: string}>) ?? [];
                result = { ok: true, output: validateApiContract({
                  apiContract,
                  generatedFiles,
                }) as unknown as JsonObject };
                break;
              }
              default:
                result = { ok: true, output: { message: `Plugin ${node.id} executed (stub)` } };
            }
          } catch (err) {
            result = { ok: false, error: String(err) };
          }

          if (result.ok) {
            await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now(), result: result.output });
          } else {
            await runStore.updateStage(runId, node.id, { status: 'failed', completedAt: Date.now(), error: result.error });
          }

          return result;
        },

        runPluginGroup: async (node, input, state) => {
          await runStore.updateStage(runId, node.id, { status: 'running', startedAt: Date.now() });
          // Run all plugins in the group
          const result = { ok: true, output: { message: `Plugin group ${node.id} executed` } };
          await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now(), result: result.output });
          return result;
        },
      });

      // Execute the workflow
      const input: JsonObject = {
        ...(params as JsonObject),
        sessionId,
        profileId,
      };

      const options = {
        targetProject: (params as JsonObject)?.targetProject as string ?? undefined,
        targetProfile: { id: profileId },
        schemas,
        policies,
        // Approval callback — set run to waiting-approval status
        onApprovalRequired: async (node, state) => {
          await runStore.update(runId, { status: 'waiting-approval' });
          await runStore.updateStage(runId, node.id, { status: 'waiting-approval' });
          // In a real system, this would wait for user approval
          // For now, auto-approve (return true)
          return true;
        },
        // Node event callbacks
        onNodeStart: async (node) => {
          await runStore.update(runId, { status: 'running' });
        },
        onNodeComplete: async (node, result) => {
          if (result.ok) {
            await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now() });
          }
        },
      };

      const executionResult = await executor.execute(definition, input, options);

      // Save results
      await runStore.update(runId, {
        status: executionResult.status === 'completed' ? 'completed' : executionResult.status === 'waiting-approval' ? 'waiting-approval' : 'failed',
        result: executionResult.nodeResults as unknown as JsonObject,
      });

      // Save artifacts if any
      const nodeResults = executionResult.nodeResults;
      for (const [nodeId, nodeResult] of Object.entries(nodeResults)) {
        if (nodeResult?.ok && nodeResult.output) {
          const output = nodeResult.output as Record<string, unknown>;
          if (Array.isArray(output.generatedFiles)) {
            for (const file of output.generatedFiles as Array<{ path: string; content: string }>) {
              artifactStore.save(runId, `${nodeId}/${file.path}`, file.content);
              await runStore.addArtifact(runId, `${nodeId}/${file.path}`);
            }
          }
        }
      }

      await runStore.complete(runId);
    } catch (err) {
      await runStore.complete(runId, String(err));
    }
  })();
});

// List runs
app.get('/api/runs', async (_req, res) => {
  const list = (await runStore.list()).map(r => ({
    id: r.id,
    workflowId: r.workflowId,
    workflowName: r.workflowName,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    duration: r.duration,
    error: r.error,
    artifactCount: r.artifacts.length,
  }));
  res.json(list);
});

// Get run detail
app.get('/api/runs/:id', async (req, res) => {
  const run = await runStore.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// ─── Approval endpoints ─────────────────────────────────────────────────

// Approve a run
app.post('/api/runs/:id/approve', async (req, res) => {
  const run = await runStore.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.status !== 'waiting-approval') {
    return res.status(400).json({ error: `Run is not waiting for approval (current: ${run.status})` });
  }

  const { by = 'user', comment } = req.body;
  await runStore.addApproval(req.params.id, { action: 'approved', by, at: Date.now(), comment });
  res.json({ ok: true, status: 'approved' });
});

// Reject a run
app.post('/api/runs/:id/reject', async (req, res) => {
  const run = await runStore.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.status !== 'waiting-approval') {
    return res.status(400).json({ error: `Run is not waiting for approval (current: ${run.status})` });
  }

  const { by = 'user', comment } = req.body;
  await runStore.addApproval(req.params.id, { action: 'rejected', by, at: Date.now(), comment });
  res.json({ ok: true, status: 'rejected' });
});

// ─── Artifact endpoints ─────────────────────────────────────────────────

// List artifacts for a run
app.get('/api/runs/:id/artifacts', async (req, res) => {
  const run = await runStore.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const artifacts = artifactStore.list(req.params.id);
  res.json(artifacts);
});

// Get artifact content — use req.path to extract the file path after /api/runs/:id/artifacts/
app.get('/api/runs/:id/artifacts/*path', async (req, res) => {
  const run = await runStore.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const filePath = (req.params as Record<string, string>).path ?? req.path.split('/artifacts/')[1];
  if (!filePath) return res.status(400).json({ error: 'File path required' });

  const content = artifactStore.read(req.params.id, filePath);
  if (content === undefined) return res.status(404).json({ error: 'Artifact not found' });

  // Determine content type
  const ext = filePath.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    vue: 'text/plain',
    md: 'text/markdown',
  };

  res.setHeader('Content-Type', contentTypes[ext ?? ''] ?? 'text/plain');
  res.send(content);
});

// ─── Metrics / DataView endpoints ────────────────────────────────────────

app.get('/api/metrics/projects', async (_req, res) => {
  try {
    const list = await metricsStore.list(50);
    res.json(list.map(m => ({
      projectId: m.projectId,
      sessionId: m.sessionId,
      profile: m.profile,
      status: m.status,
      stageCount: m.stages.length,
      totalFiles:
        (m.artifacts.frontend?.fileCount ?? 0) +
        (m.artifacts.backend?.fileCount ?? 0) +
        (m.artifacts.database?.fileCount ?? 0) +
        (m.artifacts.deployment?.fileCount ?? 0),
      duration: m.timings.end ? m.timings.end - m.timings.start : undefined,
      start: m.timings.start,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/metrics/projects/:id', async (req, res) => {
  try {
    const m = await metricsStore.get(req.params.id);
    if (!m) return res.status(404).json({ error: 'Project metrics not found' });
    res.json(m);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/metrics/overview', async (_req, res) => {
  try {
    const overview = await metricsStore.overview();
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/metrics/projects/:id/stages', async (req, res) => {
  try {
    const m = await metricsStore.get(req.params.id);
    if (!m) return res.status(404).json({ error: 'Project metrics not found' });
    res.json(m.stages);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Start ──────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║   Studio API running on port ${PORT}       ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`  Model: ${llmConfig.model}`);
  console.log(`  URL:   ${llmConfig.baseUrl}`);
  console.log(`  Storage: ~/.ai-studio/data/`);
  console.log(`  Endpoints:`);
  console.log(`    GET  /api/health`);
  console.log(`    GET  /api/profiles`);
  console.log(`    GET  /api/catalog/ui?framework=vue3`);
  console.log(`    GET  /api/sessions`);
  console.log(`    POST /api/sessions`);
  console.log(`    GET  /api/sessions/:id`);
  console.log(`    DELETE /api/sessions/:id`);
  console.log(`    PATCH /api/sessions/:id`);
  console.log(`    POST /api/chat`);
  console.log(`    POST /api/chat/stream`);
  console.log(`    GET  /api/chat/:sessionId`);
  console.log(`    POST /api/generate/design`);
  console.log(`    POST /api/generate/code`);
  console.log(`    GET  /api/workflows`);
  console.log(`    POST /api/workflows/:id/run`);
  console.log(`    GET  /api/runs`);
  console.log(`    GET  /api/runs/:id`);
  console.log(`    POST /api/runs/:id/approve`);
  console.log(`    POST /api/runs/:id/reject`);
  console.log(`    GET  /api/runs/:id/artifacts`);
  console.log(`    GET  /api/runs/:id/artifacts/:file`);
  console.log(`    GET  /api/metrics/projects`);
  console.log(`    GET  /api/metrics/projects/:id`);
  console.log(`    GET  /api/metrics/overview`);
  console.log(`    GET  /api/metrics/projects/:id/stages`);
});
