/**
 * sessions — 会话管理路由（已绑定用户认证）
 */

import { Router } from 'express';
import { SessionStore, type Session } from '@ai-engineering-agent/persistence';
import { requireAuth } from '../middleware/auth.js';
import { generateId } from '../lib/skill-context.js';
import { validateBody, validateParams } from '../middleware/validate-request.js';
import { CreateSessionSchema, UpdateSessionSchema, SessionIdParamSchema } from '../lib/validate.js';

export function createSessionsRouter(sessionStore: SessionStore) {
  const router = Router();

  // All session routes require authentication
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    try {
      const list = (await sessionStore.list(req.user!.id)).map(s => ({
        id: s.id,
        name: s.name,
        profileId: s.profileId,
        messageCount: s.messages.length,
        completeness: s.completeness,
        pinned: s.pinned,
        featureName: (s.document as Record<string, unknown>)?.featureName as string ?? null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/', validateBody(CreateSessionSchema), async (req, res) => {
    try {
      const { profileId, name } = req.body;
      const id = `session-${generateId()}`;
      const session = await sessionStore.create(id, name, req.user!.id);
      if (profileId) await sessionStore.update(id, { profileId });
      res.json({ id, name: session.name, profileId: profileId ?? null });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/:id', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      // Ensure session belongs to the user
      if (session.userId && session.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.delete('/:id', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.userId && session.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const existed = await sessionStore.delete(req.params.id);
      res.json({ ok: existed });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.patch('/:id', validateParams(SessionIdParamSchema), validateBody(UpdateSessionSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.userId && session.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const patch: Partial<Session> = {};
      if (req.body.name !== undefined) patch.name = req.body.name;
      if (req.body.profileId) patch.profileId = req.body.profileId;
      if (req.body.featureName !== undefined) {
        const doc = (session.document ?? {}) as Record<string, unknown>;
        doc.featureName = req.body.featureName;
        patch.document = doc;
      }
      await sessionStore.update(req.params.id, patch);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/:id/pin', validateParams(SessionIdParamSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.userId && session.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const pinned = !session.pinned;
      await sessionStore.update(req.params.id, { pinned });
      res.json({ ok: true, pinned });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
