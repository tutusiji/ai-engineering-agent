import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PptTemplateStore, initPool, closePool } from '../index.js';

describe('PptTemplateStore', () => {
  beforeAll(async () => {
    initPool();
  });
  afterAll(async () => {
    await closePool();
  });

  it('内置主题种子可查且 builtin 不可删', async () => {
    const store = new PptTemplateStore();
    const list = await store.listByOwner('user-a');
    expect(list.filter((t) => t.source === 'builtin').length).toBeGreaterThanOrEqual(3);
    expect(await store.delete('theme-business-blue', 'user-a')).toBe(false);
  });

  it('create 后按 ownerId 隔离，删除仅限本人 uploaded', async () => {
    const store = new PptTemplateStore();
    const created = await store.create({
      ownerId: 'user-a',
      name: '我的模板',
      source: 'uploaded',
      theme: { name: '我的模板', mode: 'extracted', colors: {}, fonts: {}, slideSize: '16:9', layoutDensity: 'standard' },
    });
    expect((await store.get(created.id))?.name).toBe('我的模板');
    expect((await store.listByOwner('user-b')).some((t) => t.id === created.id)).toBe(false);
    expect(await store.delete(created.id, 'user-b')).toBe(false);
    expect(await store.delete(created.id, 'user-a')).toBe(true);
  });
});
