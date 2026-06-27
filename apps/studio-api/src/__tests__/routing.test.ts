import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { SessionStore, RunStore, ArtifactStore } from '@ai-engineering-agent/persistence';
import { createSessionsRouter } from '../routes/sessions.js';
import { createWorkflowsRouter } from '../routes/workflows.js';
import { createRunsRouter } from '../routes/runs.js';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';

describe('routing validation', () => {
  let app: express.Express;
  const llmConfig: LlmConfig = { model: 'test', baseUrl: 'http://localhost', apiKey: 'key' };

  beforeAll(() => {
    const sessionStore = new SessionStore();
    const runStore = new RunStore();
    const artifactStore = new ArtifactStore();
    app = express();
    app.use(express.json());
    app.use('/api/sessions', createSessionsRouter(sessionStore));
    app.use('/api/workflows', createWorkflowsRouter(llmConfig, sessionStore, runStore, artifactStore));
    app.use('/api/runs', createRunsRouter(runStore, artifactStore));
  });

  it('validates create session body', async () => {
    const res = await request(app).post('/api/sessions').send({ name: 123 });
    expect(res.status).toBe(400);
  });

  it('validates workflow run body', async () => {
    const res = await request(app).post('/api/workflows/idea/run').send({ profileId: 123 });
    expect(res.status).toBe(400);
  });

  it('validates run approval body', async () => {
    const res = await request(app).post('/api/runs/run-1/approve').send({ by: 123 });
    expect(res.status).toBe(400);
  });
});
