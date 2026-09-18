import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_PPT_TEMPLATE_IDS } from '@ai-engineering-agent/persistence';
import { PPT_SEED_ASSET_DIR, SEED_PPT_TEMPLATES } from '../lib/ppt-seed-templates.js';
import { seedBuiltinPptTemplates } from '../lib/ppt-seed.js';

/** 六槽位十六进制色值（不带 # 前缀） */
const HEX_RE = /^[0-9A-Fa-f]{6}$/;

describe('ppt seed manifest', () => {
  it('ids 唯一且全部登记进内置白名单', () => {
    const ids = SEED_PPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(BUILTIN_PPT_TEMPLATE_IDS.has(id)).toBe(true);
    }
  });

  it('theme 结构完整：六槽位十六进制色、字体、16:9、无 assetBasePath', () => {
    for (const { theme } of SEED_PPT_TEMPLATES) {
      expect(theme.mode).toBe('preset');
      expect(theme.slideSize).toBe('16:9');
      expect(theme.fonts.title).toBeTruthy();
      expect(theme.fonts.body).toBeTruthy();
      expect('assetBasePath' in theme ? theme.assetBasePath : undefined).toBeUndefined();
      for (const v of Object.values(theme.colors)) {
        expect(v).toMatch(HEX_RE);
      }
      expect(Object.keys(theme.colors).sort()).toEqual([
        'accent',
        'background',
        'primary',
        'secondary',
        'surface',
        'text',
      ]);
      expect(theme.assets?.backgroundPath).toBeTruthy();
    }
  });

  it('资产源文件真实存在于仓库', () => {
    const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
    for (const t of SEED_PPT_TEMPLATES) {
      for (const rel of Object.values(t.assetFiles)) {
        expect(existsSync(path.resolve(repoRoot, rel)), `缺失资产: ${rel}`).toBe(true);
      }
    }
  });

  it('种子例程幂等：首跑入库+落盘，再跑仅补资产', async () => {
    const tmpRepo = mkdtempSync(path.join(tmpdir(), 'aiea-seed-'));
    try {
      const assetDir = path.join(tmpRepo, PPT_SEED_ASSET_DIR);
      mkdirSync(assetDir, { recursive: true });
      for (const t of SEED_PPT_TEMPLATES) {
        for (const rel of Object.values(t.assetFiles)) {
          writeFileSync(path.join(tmpRepo, rel), 'fake-asset');
        }
      }
      const existing = new Set<string>();
      const saved: string[] = [];
      const created: string[] = [];
      const deps = {
        repoRoot: tmpRepo,
        artifactStore: {
          saveBinary: (runId: string, filePath: string, _content: Buffer): void => {
            saved.push(`${runId}/${filePath}`);
          },
        },
        templateStore: {
          get: async (id: string): Promise<{ id: string } | undefined> => (existing.has(id) ? { id } : undefined),
          create: async (input: { id?: string }): Promise<unknown> => {
            created.push(input.id ?? '');
            if (input.id) existing.add(input.id);
            return {};
          },
        },
      };
      // 首跑：全部入库 + 每主题一张背景落盘
      const first = await seedBuiltinPptTemplates(deps);
      expect(first.length).toBe(SEED_PPT_TEMPLATES.length);
      expect(created.length).toBe(SEED_PPT_TEMPLATES.length);
      expect(saved.length).toBe(SEED_PPT_TEMPLATES.length);
      // 第二跑：行已存在 → 不再入库，仅覆盖落盘资产（自修复语义）
      const second = await seedBuiltinPptTemplates(deps);
      expect(second.length).toBe(0);
      expect(created.length).toBe(SEED_PPT_TEMPLATES.length);
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });
});
