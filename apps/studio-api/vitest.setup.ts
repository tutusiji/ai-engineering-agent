import { initPool, closePool } from '@ai-engineering-agent/persistence';
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  initPool();
});

afterAll(async () => {
  await closePool();
});
