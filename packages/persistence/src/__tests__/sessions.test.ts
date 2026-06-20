import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionStore, initPool, closePool } from '../index.js';

describe('SessionStore.addArtifactRun', () => {
  beforeAll(async () => {
    initPool();
  });

  afterAll(async () => {
    await closePool();
  });

  it('records an artifact run in session document', async () => {
    const store = new SessionStore();
    const sessionId = `test-session-add-run-${Date.now()}`;
    const session = await store.create(sessionId);
    await store.addArtifactRun(session.id, {
      runId: 'design-123',
      type: 'design',
      createdAt: Date.now(),
    });

    const updated = await store.get(session.id);
    const runs = (updated?.document?._artifactRuns ?? []) as Array<{ runId: string; type: string }>;
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe('design-123');
    expect(runs[0].type).toBe('design');
  });
});
