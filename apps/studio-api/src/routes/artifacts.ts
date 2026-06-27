/**
 * artifacts — 会话产物下载路由
 */

import { Router } from 'express';
import { SessionStore, ArtifactStore } from '@ai-engineering-agent/persistence';
import { validateQuery } from '../middleware/validate-request.js';
import { ArtifactDownloadSchema } from '../lib/validate.js';
import { buildSessionArtifacts, buildArtifactZip, sendArtifactResponse } from '../artifact-service.js';

export function createArtifactsRouter(sessionStore: SessionStore, artifactStore: ArtifactStore) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const doc = (session.document ?? {}) as Record<string, unknown>;
      const designHtml = (doc._activeDesignHtml as string | null) ?? null;
      const artifacts = buildSessionArtifacts(session, req.params.id, artifactStore, designHtml);
      res.json({ artifacts });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/download', validateQuery(ArtifactDownloadSchema), async (req, res) => {
    try {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { id, ids } = req.query as { id?: string; ids?: string };
      const requestedIds = ids ? ids.split(',').filter(Boolean) : id ? [id] : [];
      if (requestedIds.length === 0) {
        return res.status(400).json({ error: 'id or ids required' });
      }

      const doc = (session.document ?? {}) as Record<string, unknown>;
      const designHtml = (doc._activeDesignHtml as string | null) ?? null;

      if (requestedIds.length === 1) {
        await sendArtifactResponse(res, session, artifactStore, designHtml, requestedIds[0]);
        return;
      }

      const buffer = await buildArtifactZip(session, artifactStore, designHtml, requestedIds);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="session-${req.params.id}-artifacts.zip"`);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
