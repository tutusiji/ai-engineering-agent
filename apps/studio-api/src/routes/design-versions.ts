/**
 * design-versions — 会话设计版本路由
 */

import { Router } from 'express';
import { SessionStore } from '@ai-engineering-agent/persistence';
import { validateBody, validateParams } from '../middleware/validate-request.js';
import { SessionIdParamSchema, ActiveDesignSchema, SaveDesignSchema } from '../lib/validate.js';
import { generateId } from '../lib/skill-context.js';

import type { ArtifactStore as ArtifactStoreType } from '@ai-engineering-agent/persistence';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';

export function createDesignVersionsRouter(
  sessionStore: SessionStore,
  artifactStore: ArtifactStoreType,
  llmConfig: LlmConfig,
) {
  const router = Router({ mergeParams: true });

  router.get('/', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const doc = (session.document ?? {}) as Record<string, unknown>;
      const versions = (doc._designVersions as Array<Record<string, unknown>>) ?? [];
      const activeId = doc._activeDesignId as string | undefined;
      res.json({ versions, activeId: activeId ?? versions[versions.length - 1]?.id ?? null });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/active', validateParams(SessionIdParamSchema), validateBody(ActiveDesignSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { designId } = req.body;
      const doc = (session.document ?? {}) as Record<string, unknown>;
      const versions = (doc._designVersions as Array<Record<string, unknown>>) ?? [];
      if (!versions.some(v => v.id === designId)) {
        return res.status(400).json({ error: `Version ${designId} not found` });
      }
      await sessionStore.update(req.params.id, {
        ...session,
        document: { ...doc, _activeDesignId: designId },
      });
      res.json({ ok: true, activeDesignId: designId });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/save', validateParams(SessionIdParamSchema), validateBody(SaveDesignSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { design, htmlContent, model } = req.body;
      const doc = (session.document ?? {}) as Record<string, unknown>;
      const designVersions = (doc._designVersions as Array<Record<string, unknown>>) ?? [];
      const versionId = `design-v${designVersions.length + 1}`;
      const now = Date.now();
      const usedModel = model ?? llmConfig.model;

      const version = {
        id: versionId,
        design,
        htmlContent,
        model: usedModel,
        createdAt: now,
        label: `${usedModel} · ${new Date(now).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
      };

      designVersions.push(version);
      await sessionStore.update(req.params.id, {
        ...session,
        document: { ...doc, _designVersions: designVersions, _activeDesignId: versionId },
      });

      const runId = `design-${generateId()}`;
      artifactStore.save(runId, 'artifacts/design-preview.html', htmlContent);
      artifactStore.save(runId, 'artifacts/design-schema.json', JSON.stringify(design, null, 2));
      await sessionStore.addArtifactRun(req.params.id, {
        runId,
        type: 'design',
        createdAt: now,
        label: 'UI 预览设计',
      });

      res.json({ ok: true, versionId, version });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
