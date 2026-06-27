/**
 * architecture-versions — 会话架构版本路由
 */

import { Router } from 'express';
import { SessionStore } from '@ai-engineering-agent/persistence';
import { buildArchitectureMarkdown } from '../lib/architecture-markdown.js';
import { validateBody, validateParams } from '../middleware/validate-request.js';
import { SessionIdParamSchema, ActiveArchitectureSchema, SaveArchitectureSchema } from '../lib/validate.js';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { ArtifactStore as ArtifactStoreType } from '@ai-engineering-agent/persistence';
import { generateId } from '../lib/skill-context.js';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';

export function createArchitectureVersionsRouter(
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
      const archVersions = (doc._architectureVersions as Array<Record<string, unknown>>) ?? [];
      const versions = archVersions.map(v => ({
        id: v.id,
        label: v.label,
        model: v.model,
        createdAt: v.createdAt,
        markdown: (v.markdown as string) ?? buildArchitectureMarkdown((v.architecture ?? {}) as Record<string, unknown>),
        architecture: v.architecture,
      }));
      const activeId = doc._activeArchitectureId as string | undefined;
      const active = versions.find(v => v.id === activeId);
      res.json({
        versions: versions.map(v => ({ id: v.id, label: v.label, model: v.model, createdAt: v.createdAt })),
        activeId: activeId ?? versions[versions.length - 1]?.id ?? null,
        activeMarkdown: active?.markdown ?? versions[versions.length - 1]?.markdown ?? null,
        activeArchitecture: active?.architecture ?? versions[versions.length - 1]?.architecture ?? null,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/active', validateParams(SessionIdParamSchema), validateBody(ActiveArchitectureSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { architectureId } = req.body;
      const doc = (session.document ?? {}) as Record<string, unknown>;
      const archVersions = (doc._architectureVersions as Array<Record<string, unknown>>) ?? [];
      if (!archVersions.some(v => v.id === architectureId)) {
        return res.status(400).json({ error: `Architecture version ${architectureId} not found` });
      }
      const active = archVersions.find(v => v.id === architectureId);
      await sessionStore.update(req.params.id, {
        ...session,
        document: { ...doc, _activeArchitectureId: architectureId },
      });
      res.json({
        ok: true,
        activeArchitectureId: architectureId,
        markdown: (active?.markdown as string) ?? buildArchitectureMarkdown((active?.architecture ?? {}) as Record<string, unknown>),
        architecture: active?.architecture,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/save', validateParams(SessionIdParamSchema), validateBody(SaveArchitectureSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { architecture, markdown, model } = req.body;
      const doc = (session.document ?? {}) as Record<string, unknown>;
      const archVersions = (doc._architectureVersions as Array<Record<string, unknown>>) ?? [];
      const versionId = `arch-v${archVersions.length + 1}`;
      const now = Date.now();
      const usedModel = model ?? llmConfig.model;

      const version = {
        id: versionId,
        architecture,
        markdown,
        model: usedModel,
        createdAt: now,
        label: `${usedModel} · ${new Date(now).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
      };

      archVersions.push(version);
      await sessionStore.update(req.params.id, {
        ...session,
        document: { ...doc, _architectureVersions: archVersions, _activeArchitectureId: versionId },
      });

      const runId = `arch-${generateId()}`;
      artifactStore.save(runId, 'artifacts/architecture-design.json', JSON.stringify(architecture, null, 2));
      artifactStore.save(runId, 'artifacts/architecture-design.md', markdown);
      await sessionStore.addArtifactRun(req.params.id, {
        runId,
        type: 'design',
        createdAt: now,
        label: '架构设计方案',
      });

      res.json({ ok: true, versionId, version });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
