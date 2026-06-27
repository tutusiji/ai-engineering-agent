/**
 * design-versions — 会话设计版本路由
 */

import { Router } from 'express';
import { SessionStore } from '@ai-engineering-agent/persistence';
import { validateBody, validateParams } from '../middleware/validate-request.js';
import { SessionIdParamSchema, ActiveDesignSchema } from '../lib/validate.js';

export function createDesignVersionsRouter(sessionStore: SessionStore) {
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

  return router;
}
