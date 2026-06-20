import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { SessionStore, ArtifactStore, initPool, closePool } from '@ai-frontend-engineering-agent/persistence';
import { buildSessionArtifacts, sendArtifactResponse } from '../artifact-service.js';

describe('session artifact endpoints', () => {
  let app: express.Express;

  beforeAll(() => {
    initPool();
    app = express();
    const sessionStore = new SessionStore();
    const artifactStore = new ArtifactStore();

    app.get('/api/sessions/:id/artifacts', async (req, res) => {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const doc = session.document ?? {};
      const designHtml = (doc._activeDesignHtml as string | null) ?? null;
      res.json({ artifacts: buildSessionArtifacts(session, req.params.id, artifactStore, designHtml) });
    });

    app.get('/api/sessions/:id/artifacts/download', async (req, res) => {
      const session = await sessionStore.get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const id = (req.query.id as string) ?? '';
      const doc = session.document ?? {};
      const designHtml = (doc._activeDesignHtml as string | null) ?? null;
      await sendArtifactResponse(res, session, artifactStore, designHtml, id);
    });
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns empty artifacts for new session', async () => {
    const store = new SessionStore();
    const session = await store.create(`test-empty-artifacts-${Date.now()}`);
    const res = await request(app).get(`/api/sessions/${session.id}/artifacts`);
    expect(res.status).toBe(200);
    expect(res.body.artifacts).toEqual([]);
  });
});
