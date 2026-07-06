import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { SessionStore, RunStore, ArtifactStore } from '@ai-engineering-agent/persistence';
import { createSessionsRouter } from '../routes/sessions.js';
import { createWorkflowsRouter } from '../routes/workflows.js';
import { createRunsRouter } from '../routes/runs.js';
import { requireAuth, getJwtSecret } from '../middleware/auth.js';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';

const JWT_SECRET = getJwtSecret();

function testToken() {
  return jwt.sign({ id: 'user-test', username: 'test' }, JWT_SECRET, { expiresIn: '1h' });
}

describe('routing validation', () => {
  let app: express.Express;
  const llmConfig: LlmConfig = { model: 'test', baseUrl: 'http://localhost', apiKey: 'key' };

  beforeAll(() => {
    const sessionStore = new SessionStore();
    const runStore = new RunStore();
    const artifactStore = new ArtifactStore();
    app = express();
    app.use(express.json());
    // Apply auth middleware like server.ts does
    app.use('/api', requireAuth);
    app.use('/api/sessions', createSessionsRouter(sessionStore));
    app.use('/api/workflows', createWorkflowsRouter(llmConfig, sessionStore, runStore, artifactStore));
    app.use('/api/runs', createRunsRouter(runStore, artifactStore));
  });

  it('validates create session body', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${testToken()}`)
      .send({ name: 123 });
    expect(res.status).toBe(400);
  });

  it('validates workflow run body', async () => {
    const res = await request(app)
      .post('/api/workflows/idea/run')
      .set('Authorization', `Bearer ${testToken()}`)
      .send({ profileId: 123 });
    expect(res.status).toBe(400);
  });

  it('validates run approval body', async () => {
    const res = await request(app)
      .post('/api/runs/run-1/approve')
      .set('Authorization', `Bearer ${testToken()}`)
      .send({ by: 123 });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(401);
  });
});
