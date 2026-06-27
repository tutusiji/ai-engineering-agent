import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { SessionStore, initPool, closePool } from '@ai-engineering-agent/persistence';
import { createSessionsRouter } from '../routes/sessions.js';

describe('sessions routes', () => {
  let app: express.Express;
  let sessionStore: SessionStore;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      initPool();
      sessionStore = new SessionStore();
      // 测试数据库是否可用
      await sessionStore.list();
      dbAvailable = true;
    } catch (err) {
      console.warn('PostgreSQL 不可用，跳过 sessions 路由集成测试:', err instanceof Error ? err.message : err);
      return;
    }
    app = express();
    app.use(express.json());
    app.use('/api/sessions', createSessionsRouter(sessionStore));
  });

  afterAll(async () => {
    if (dbAvailable) {
      await closePool();
    }
  });

  it('creates and lists a session', async () => {
    if (!dbAvailable) return;
    const createRes = await request(app!).post('/api/sessions').send({ name: 'Test Session' });
    expect(createRes.status).toBe(200);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.name).toBe('Test Session');

    const listRes = await request(app!).get('/api/sessions');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((s: { id: string }) => s.id === createRes.body.id)).toBe(true);
  });

  it('returns 404 for unknown session', async () => {
    if (!dbAvailable) return;
    const res = await request(app!).get('/api/sessions/unknown-session-id');
    expect(res.status).toBe(404);
  });

  it('validates create session body', async () => {
    if (!dbAvailable) return;
    const res = await request(app!).post('/api/sessions').send({ name: 123 });
    expect(res.status).toBe(400);
  });
});
