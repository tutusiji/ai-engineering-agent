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

  it('读侧剥离存量 theme.assetBasePath（a4c11f0 前的存量行不再下发服务器绝对路径）', async () => {
    const store = new PptTemplateStore();
    const created = await store.create({
      ownerId: 'user-a',
      name: '存量路径模板',
      source: 'uploaded',
      theme: {
        name: 'legacy',
        mode: 'extracted',
        colors: {},
        fonts: {},
        slideSize: '16:9',
        layoutDensity: 'standard',
        assetBasePath: '/abs/legacy/artifacts/templates/legacy/assets',
      },
    });
    try {
      const row = await store.get(created.id);
      const theme = row?.theme as Record<string, unknown> | undefined;
      expect(theme).toBeDefined();
      // 读侧剥离：存量行携带的服务器绝对路径不得透出
      expect(theme?.assetBasePath).toBeUndefined();
      // 剥离只针对 assetBasePath，其余键原样保留
      expect(theme?.name).toBe('legacy');
    } finally {
      await store.delete(created.id, 'user-a');
    }
  });
});
