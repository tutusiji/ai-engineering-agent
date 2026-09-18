// PPT 合约 schema 测试：验证 4 个按文件名约定加载的 schema 的必填字段与校验行为
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { FileSchemaRegistry } from '../index.js';

// 合约目录指向仓库根 contracts/
const CONTRACTS_DIR = path.resolve(__dirname, '../../../../contracts');
const registry = new FileSchemaRegistry({ contractsDir: CONTRACTS_DIR });

describe('PPT 合约 schema', () => {
  it('ppt-source：要求 sourceType/markdown 必填，并通过 validate', async () => {
    const schema = await registry.get({ name: 'ppt-source' } as never);
    expect(schema).toBeDefined();
    expect((schema as Record<string, unknown>).required).toEqual(['sourceType', 'markdown']);
    const ok = await registry.validate({ name: 'ppt-source' } as never, {
      sourceType: 'paste',
      markdown: '# 内容',
      meta: { wordCount: 3 },
    });
    expect(ok.valid).toBe(true);
  });

  it('ppt-outline：要求 deckTitle/totalPages/slides 必填', async () => {
    const schema = await registry.get({ name: 'ppt-outline' } as never);
    expect((schema as Record<string, unknown>).required).toEqual(['deckTitle', 'totalPages', 'slides']);
  });

  it('ppt-theme：要求 name/mode/colors/fonts/slideSize/layoutDensity 必填', async () => {
    const schema = await registry.get({ name: 'ppt-theme' } as never);
    expect((schema as Record<string, unknown>).required).toEqual([
      'name',
      'mode',
      'colors',
      'fonts',
      'slideSize',
      'layoutDensity',
    ]);
  });

  it('ppt-content：要求 deckTitle/slides 必填', async () => {
    const schema = await registry.get({ name: 'ppt-content' } as never);
    expect((schema as Record<string, unknown>).required).toEqual(['deckTitle', 'slides']);
  });
});
