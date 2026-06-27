/**
 * metrics — 数据视图路由
 */

import { Router } from 'express';
import { MetricsStore } from '@ai-engineering-agent/persistence';
import { validateParams } from '../middleware/validate-request.js';
import { SessionIdParamSchema } from '../lib/validate.js';

export function createMetricsRouter(metricsStore: MetricsStore) {
  const router = Router();

  router.get('/projects', async (_req, res) => {
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

  router.get('/projects/:id', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const m = await metricsStore.get(req.params.id);
      if (!m) return res.status(404).json({ error: 'Project metrics not found' });
      res.json(m);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/overview', async (_req, res) => {
    try {
      const overview = await metricsStore.overview();
      res.json(overview);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/projects/:id/stages', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const m = await metricsStore.get(req.params.id);
      if (!m) return res.status(404).json({ error: 'Project metrics not found' });
      res.json(m.stages);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
