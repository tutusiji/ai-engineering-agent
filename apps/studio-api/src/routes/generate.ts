/**
 * generate — 架构/设计/代码生成路由
 */

import { Router } from 'express';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';
import { SessionStore, ArtifactStore } from '@ai-engineering-agent/persistence';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { getSkill, runSkillThroughLlm } from '@ai-engineering-agent/agent-runtime';
import { GenerateSchema } from '../lib/validate.js';
import { validateBody } from '../middleware/validate-request.js';
import { createSkillContext, getActiveArchitecture, generateId } from '../lib/skill-context.js';
import { buildArchitectureMarkdown } from '../lib/architecture-markdown.js';

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
        return res.json({ ok: true, files: result.output.generatedFiles, htmlContent: htmlFile?.content ?? null, usage: result.usage, artifactRunId: runId });
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

  return router;
}
