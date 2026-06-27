/**
 * runs — 运行历史、审批、产物路由
 */

import { Router } from 'express';
import path from 'node:path';
import { RunStore, ArtifactStore } from '@ai-engineering-agent/persistence';
import { validateBody, validateParams } from '../middleware/validate-request.js';
import { RunApprovalSchema, SessionIdParamSchema } from '../lib/validate.js';

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  vue: 'text/plain',
  md: 'text/markdown',
};

export function createRunsRouter(runStore: RunStore, artifactStore: ArtifactStore) {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
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
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/:id', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const run = await runStore.get(req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      res.json(run);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/:id/approve', validateParams(SessionIdParamSchema), validateBody(RunApprovalSchema), async (req, res) => {
    try {
      const run = await runStore.get(req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      if (run.status !== 'waiting-approval') {
        return res.status(400).json({ error: `Run is not waiting for approval (current: ${run.status})` });
      }
      const { by = 'user', comment } = req.body;
      await runStore.addApproval(req.params.id, { action: 'approved', by, at: Date.now(), comment });
      res.json({ ok: true, status: 'approved' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/:id/reject', validateParams(SessionIdParamSchema), validateBody(RunApprovalSchema), async (req, res) => {
    try {
      const run = await runStore.get(req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      if (run.status !== 'waiting-approval') {
        return res.status(400).json({ error: `Run is not waiting for approval (current: ${run.status})` });
      }
      const { by = 'user', comment } = req.body;
      await runStore.addApproval(req.params.id, { action: 'rejected', by, at: Date.now(), comment });
      res.json({ ok: true, status: 'rejected' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/:id/artifacts', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const run = await runStore.get(req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      const artifacts = artifactStore.list(req.params.id);
      res.json(artifacts);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/:id/artifacts/*path', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const run = await runStore.get(req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found' });

      const filePath = req.params[0] ?? '';
      if (!filePath) return res.status(400).json({ error: 'File path required' });

      const normalized = path.normalize(filePath);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      const content = artifactStore.read(req.params.id, filePath);
      if (content === undefined) return res.status(404).json({ error: 'Artifact not found' });

      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'text/plain');
      res.send(content);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
