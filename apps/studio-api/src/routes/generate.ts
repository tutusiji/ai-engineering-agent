/**
 * generate — 架构/设计/代码生成路由
 */

import { Router } from 'express';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';
import { SessionStore, ArtifactStore } from '@ai-engineering-agent/persistence';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { getSkill, runSkillThroughLlm, extractJson } from '@ai-engineering-agent/agent-runtime';
import { createSseSender, streamLlm, extractFilePaths } from '../lib/stream-llm.js';
import { GenerateSchema, CodeRefineSchema } from '../lib/validate.js';
import { validateBody } from '../middleware/validate-request.js';
import { createSkillContext, getActiveArchitecture, generateId } from '../lib/skill-context.js';
import { buildArchitectureMarkdown } from '../lib/architecture-markdown.js';
import { MODEL_PRESETS } from '../lib/models.js';

export function createGenerateRouter(llmConfig: LlmConfig, sessionStore: SessionStore, artifactStore: ArtifactStore) {
  const router = Router();

  router.post('/architecture', validateBody(GenerateSchema), async (req, res) => {
    try {
      const { sessionId, profileId } = req.body;
      console.log(`🏗️ [${sessionId}] Starting architecture design generation...`);
      const session = await sessionStore.get(sessionId);
      if (!session?.document) {
        return res.status(400).json({ error: 'No requirement document. Complete the chat first.' });
      }

      const skill = getSkill('architecture-planning');
      if (!skill) return res.status(500).json({ error: 'architecture-planning skill not found' });

      const ctx = createSkillContext(profileId);
      const input: JsonObject = { ...(session.document as JsonObject) };
      console.log(`📤 [${sessionId}] Calling LLM for architecture design...`);
      const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);
      console.log(`📥 [${sessionId}] LLM response received:`, result.ok ? 'success' : 'failed');

      if (result.ok && result.output) {
        const archDoc = result.output as Record<string, unknown>;
        const runId = `arch-${generateId()}`;
        const archMd = buildArchitectureMarkdown(archDoc);
        artifactStore.save(runId, 'artifacts/architecture-design.json', JSON.stringify(archDoc, null, 2));
        artifactStore.save(runId, 'artifacts/architecture-design.md', archMd);
        await sessionStore.addArtifactRun(sessionId, { runId, type: 'design', createdAt: Date.now(), label: '架构设计方案' });

        return res.json({ ok: true, architecture: archDoc, markdown: archMd, model: llmConfig.model, usage: result.usage, artifactRunId: runId });
      }

      res.json({ ok: false, error: result.error });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/design', validateBody(GenerateSchema), async (req, res) => {
    try {
      const { sessionId, profileId } = req.body;
      console.log(`🧩 [${sessionId}] Starting fullstack preview generation...`);
      const session = await sessionStore.get(sessionId);
      if (!session?.document) {
        return res.status(400).json({ error: 'No requirement document. Complete the chat first.' });
      }

      const skill = getSkill('design-generation');
      if (!skill) return res.status(500).json({ error: 'design-generation skill not found' });

      const archData = getActiveArchitecture(session);
      const ctx = createSkillContext(profileId, archData);
      const input: JsonObject = { ...(session.document as JsonObject), phaseId: 'P1' };
      const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);

      if (result.ok && result.output) {
        const files = result.output.generatedFiles as Array<{ path: string; content: string }>;
        const htmlFile = files?.find(f => f.path?.endsWith('.html'));
        const runId = `design-${generateId()}`;
        if (files) for (const file of files) artifactStore.save(runId, file.path, file.content);

        if (htmlFile?.content && session) {
          const doc = (session.document ?? {}) as Record<string, unknown>;
          const versions = (doc._designVersions as Array<Record<string, unknown>>) ?? [];
          const versionId = `v${versions.length + 1}`;
          const now = Date.now();
          const version = {
            id: versionId,
            html: htmlFile.content,
            model: llmConfig.model,
            createdAt: now,
            label: `${llmConfig.model} · ${new Date(now).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
          };
          versions.push(version);
          await sessionStore.update(sessionId, {
            ...session,
            document: { ...doc, _designVersions: versions, _activeDesignId: versionId, _activeDesignHtml: htmlFile.content },
          });
          console.log(`💾 [${sessionId}] Design version ${versionId} saved to session`);
        }

        await sessionStore.addArtifactRun(sessionId, { runId, type: 'design', createdAt: Date.now() });
        return res.json({ ok: true, design: result.output, files: result.output.generatedFiles, htmlContent: htmlFile?.content ?? null, usage: result.usage, artifactRunId: runId });
      }

      console.log(`❌ [${sessionId}] LLM error:`, result.error);
      res.json({ ok: false, error: result.error });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/code', validateBody(GenerateSchema), async (req, res) => {
    try {
      const { sessionId, profileId, phaseId = 'P1' } = req.body;
      const session = await sessionStore.get(sessionId);
      if (!session?.document) {
        return res.status(400).json({ error: 'No requirement document. Complete the chat first.' });
      }

      const skill = getSkill('code-generation');
      if (!skill) return res.status(500).json({ error: 'code-generation skill not found' });

      const archData = getActiveArchitecture(session);
      const ctx = createSkillContext(profileId, archData);
      const doc = session.document as Record<string, unknown>;
      const phases = Array.isArray(doc.phases) ? doc.phases : [];
      const currentPhase = phases.find((p: unknown) => (p as Record<string, unknown>)?.id === phaseId) as Record<string, unknown> | undefined;
      const phasePages = currentPhase?.pages ?? (Array.isArray(doc.pages) ? (doc.pages as Array<Record<string, unknown>>).map(p => p.name) : []);
      const input: JsonObject = { ...(session.document as JsonObject), phaseId, pages: phasePages as string[] };

      const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);
      if (result.ok && result.output) {
        const files = result.output.generatedFiles as Array<{ path: string; content: string }>;
        const runId = `code-${generateId()}`;
        if (files) for (const file of files) artifactStore.save(runId, file.path, file.content);
        await sessionStore.addArtifactRun(sessionId, { runId, type: 'code', createdAt: Date.now() });
        return res.json({ ok: true, files: result.output.generatedFiles, notes: result.output.notes, usage: result.usage, artifactRunId: runId });
      }
      res.json({ ok: false, error: result.error });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── SSE 流式代码生成 ──────────────────────────────────────
  router.post('/code/stream', validateBody(GenerateSchema), async (req, res) => {
    const { sessionId, profileId, phaseId = 'P1' } = req.body;

    // 客户端断开时取消上游请求,避免继续消耗 token
    // 注意:监听 res('close') 而非 req('close')——req 在请求体读完时就触发,会误判断连
    let clientGone = false;
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        clientGone = true;
        controller.abort();
      }
    });

    const rawSend = createSseSender(res);
    const send = (event: string, data: unknown) => {
      if (clientGone || res.writableEnded) return;
      rawSend(event, data);
    };

    try {
      const session = await sessionStore.get(sessionId);
      if (!session?.document) {
        send('error', { error: 'No requirement document. Complete the chat first.' });
        res.end();
        return;
      }

      const skill = getSkill('code-generation');
      if (!skill) {
        send('error', { error: 'code-generation skill not found' });
        res.end();
        return;
      }

      const archData = getActiveArchitecture(session);
      const ctx = createSkillContext(profileId, archData);
      const doc = session.document as Record<string, unknown>;
      const phases = Array.isArray(doc.phases) ? doc.phases : [];
      const currentPhase = phases.find((p: unknown) => (p as Record<string, unknown>)?.id === phaseId) as Record<string, unknown> | undefined;
      const phasePages = currentPhase?.pages ?? (Array.isArray(doc.pages) ? (doc.pages as Array<Record<string, unknown>>).map(p => p.name) : []);
      const input: JsonObject = { ...(session.document as JsonObject), phaseId, pages: phasePages as string[] };

      const prompt = await skill.buildPrompt(ctx, input);
      const messages = [
        { role: 'system' as const, content: prompt.system },
        { role: 'user' as const, content: prompt.user + (prompt.attachments?.map(a => `\n\n--- ${a.kind} ---\n${a.content}`).join('') ?? '') },
      ];

      const mergedConfig: LlmConfig = {
        ...llmConfig,
        ...(skill.defaultModel?.temperature != null && { temperature: skill.defaultModel.temperature }),
        ...(skill.defaultModel?.maxTokens != null && { maxTokens: skill.defaultModel.maxTokens }),
        ...(skill.defaultModel?.model && skill.defaultModel.model !== 'auto' && { model: skill.defaultModel.model }),
        ...(skill.defaultModel?.thinking && { thinking: skill.defaultModel.thinking }),
      };

      send('start', { model: mergedConfig.model, phase: phaseId });

      // 进度:每出现一个新文件路径就发 progress 事件(仅作指示,最终以 files 事件为准)
      let lastPathCount = 0;
      const { fullContent, finishReason } = await streamLlm({
        llmConfig: mergedConfig,
        messages,
        signal: controller.signal,
        onChunk: (_delta, full) => {
          send('chunk', { content: _delta });
          const paths = extractFilePaths(full);
          if (paths.length !== lastPathCount) {
            lastPathCount = paths.length;
            send('progress', { files: paths, current: paths[paths.length - 1] ?? null });
          }
        },
      });

      console.log(`💻 [${sessionId}] Code generation stream done: finish_reason=${finishReason}, content_len=${fullContent.length}`);

      if (finishReason === 'length') {
        send('warning', { message: '⚠️ 响应被截断（达到 token 上限），部分代码可能不完整' });
      }

      send('done', { contentLen: fullContent.length });

      // 权威解析完整 JSON 并保存产物
      const parsed = extractJson(fullContent);
      if (parsed && parsed.generatedFiles) {
        const files = parsed.generatedFiles as Array<{ path: string; kind?: string; content: string }>;
        const runId = `code-${generateId()}`;
        for (const file of files) {
          if (file.content) artifactStore.save(runId, file.path, file.content);
        }
        await sessionStore.addArtifactRun(sessionId, { runId, type: 'code', createdAt: Date.now() });

        const output = {
          pageName: parsed.pageName ?? '未命名',
          generatedFiles: files.map(f => ({ path: f.path, kind: f.kind ?? 'page', content: f.content })),
          notes: parsed.notes ?? [],
        };

        send('files', { files: output.generatedFiles, notes: output.notes, runId, artifactRunId: runId });
      } else {
        send('error', { error: 'LLM response did not contain valid JSON', rawSnippet: fullContent.slice(0, 300) });
      }

      send('end', {});
      res.end();
    } catch (err) {
      // 客户端已离开时不发送错误(避免写已断开的 socket)
      if (!clientGone && !res.writableEnded) {
        send('error', { error: String(err) });
        res.end();
      }
    }
  });

  // ── SSE 流式代码精炼 ──────────────────────────────────────
  router.post('/code/refine', validateBody(CodeRefineSchema), async (req, res) => {
    const { sessionId, currentFiles, feedback } = req.body;

    // 客户端断开时取消上游请求
    let clientGone = false;
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        clientGone = true;
        controller.abort();
      }
    });

    const rawSend = createSseSender(res);
    const send = (event: string, data: unknown) => {
      if (clientGone || res.writableEnded) return;
      rawSend(event, data);
    };

    try {
      const filesSummary = currentFiles
        .map((f: { path: string; content: string }) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
        .join('\n\n');

      const systemPrompt = `你是一个资深全栈工程师。用户会提供当前代码文件和建议，你需要根据反馈修改代码。

## 输出格式

请以 JSON 格式返回修改结果：

{
  "pageName": "修改后的代码",
  "generatedFiles": [
    { "path": "src/xxx/index.vue", "kind": "view", "status": "generated", "content": "完整代码..." }
  ],
  "patches": [{ "target": "文件路径", "action": "create|update|delete", "summary": "修改说明" }],
  "notes": ["修改说明1", "修改说明2"]
}

**重要：只返回被修改或新增的文件。未改动的文件不需要返回。每个文件的 content 必须是完整的代码。**`;

      const userPrompt = `## 当前代码文件\n\n${filesSummary}\n\n## 修改建议\n\n${feedback}\n\n请根据修改建议调整代码，返回修改后的文件。`;

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt },
      ];

      send('start', { model: llmConfig.model, fileCount: currentFiles.length });

      // 精炼同样输出完整代码,复用流式助手与进度事件
      let lastPathCount = 0;
      const { fullContent } = await streamLlm({
        llmConfig: { ...llmConfig, temperature: 0.2, maxTokens: 65536 },
        messages,
        signal: controller.signal,
        onChunk: (_delta, full) => {
          send('chunk', { content: _delta });
          const paths = extractFilePaths(full);
          if (paths.length !== lastPathCount) {
            lastPathCount = paths.length;
            send('progress', { files: paths, current: paths[paths.length - 1] ?? null });
          }
        },
      });

      console.log(`🔧 [${sessionId}] Code refinement done, content_len=${fullContent.length}`);
      send('done', { contentLen: fullContent.length });

      const parsed = extractJson(fullContent);
      if (parsed && parsed.generatedFiles) {
        const files = parsed.generatedFiles as Array<{ path: string; kind?: string; content: string }>;
        const runId = `code-refine-${generateId()}`;
        for (const file of files) {
          if (file.content) artifactStore.save(runId, file.path, file.content);
        }
        await sessionStore.addArtifactRun(sessionId, { runId, type: 'code', createdAt: Date.now(), label: `代码精炼: ${feedback.slice(0, 30)}` });

        send('files', {
          files: files.map(f => ({ path: f.path, kind: f.kind ?? 'page', content: f.content })),
          notes: parsed.notes ?? [],
          patches: parsed.patches ?? [],
        });
      } else {
        send('error', { error: 'LLM response did not contain valid JSON', rawSnippet: fullContent.slice(0, 300) });
      }

      send('end', {});
      res.end();
    } catch (err) {
      if (!clientGone && !res.writableEnded) {
        send('error', { error: String(err) });
        res.end();
      }
    }
  });

  return router;
}