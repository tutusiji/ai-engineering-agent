// packages/workflow-core/src/__tests__/plugin-runner.test.ts
// 闸 A + themeId 形态钳制的最小单测 — resolveThemeForBuild 为纯函数，不触盘不触网
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { resolveThemeForBuild } from '../plugin-runner.js';

/** 仓库根下的相对基目录（测试不触盘，路径仅参与 resolve 与前缀比较） */
const BASE = resolve('artifacts-test-root');

/** 合法 UUID 形态的 themeId（对齐 randomUUID 产物） */
const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('resolveThemeForBuild（闸 A：客户端 assetBasePath 剥离 + themeId 形态钳制）', () => {
  it('无 themeId：客户端 assetBasePath 一律剥离，theme 其余键保留', () => {
    const out = resolveThemeForBuild({ colors: { primary: '1D4ED8' }, assetBasePath: '/etc' }, undefined, BASE);
    expect(out.assetBasePath).toBeUndefined();
    expect(out.colors).toEqual({ primary: '1D4ED8' });
  });

  it('UUID themeId 注入成功：写入服务端派生的 assetBasePath（客户端值不残留）', () => {
    const out = resolveThemeForBuild({ assetBasePath: '/etc/passwd' }, UUID, BASE);
    expect(out.assetBasePath).toBe(resolve(BASE, 'templates', UUID, 'assets'));
  });

  it('内置主题 themeId 注入成功（与迁移 002 种子白名单一致）', () => {
    const out = resolveThemeForBuild({}, 'theme-business-blue', BASE);
    expect(out.assetBasePath).toBe(resolve(BASE, 'templates', 'theme-business-blue', 'assets'));
  });

  it('路径折叠形态 themeId（x/../../templates/y）视为注入失败，客户端 assetBasePath 仍被剥离', () => {
    const out = resolveThemeForBuild({ assetBasePath: '/etc/passwd' }, 'x/../../templates/y', BASE);
    expect(out.assetBasePath).toBeUndefined();
  });

  it('非字符串 / 空串 themeId 不注入', () => {
    expect(resolveThemeForBuild({}, 123, BASE).assetBasePath).toBeUndefined();
    expect(resolveThemeForBuild({}, '', BASE).assetBasePath).toBeUndefined();
  });
});
