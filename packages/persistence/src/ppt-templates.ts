// packages/persistence/src/ppt-templates.ts
import { randomUUID } from 'node:crypto';
import { query, queryOne, queryAll } from './store.js';

/** PPT 模板行（内置预设与上传模板同构，theme 为完整 ppt-theme JSON） */
export interface PptTemplateRow {
  id: string;
  ownerId: string | null;
  name: string;
  source: 'builtin' | 'uploaded';
  theme: unknown;
  assetPaths: Record<string, string>;
  createdAt: number;
}

/** 内置预设模板 id 集合（迁移 002 种子行 + studio-api 启动种子例程注入的六套主题，供 themeId 注入白名单等场景使用） */
export const BUILTIN_PPT_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'theme-business-blue',
  'theme-tech-dark',
  'theme-minimal-light',
  'theme-luxe-indigo',
  'theme-champagne-gold',
  'theme-jade-night',
  'theme-mist-blue',
  'theme-forest-sage',
  'theme-violet-dusk',
]);

/**
 * 剥离 theme JSONB 中的 assetBasePath 键 — a4c11f0 之前的存量行带服务器绝对路径，
 * 读侧统一剥离：服务端构建路径由 plugin-runner 按 themeId 派生注入，该键不下发浏览器/不进 prompt
 * @param theme 数据库读出的 theme JSON 值
 * @returns 去除 assetBasePath 后的 theme（非普通对象时原样返回）
 */
function stripAssetBasePath(theme: unknown): unknown {
  if (theme === null || typeof theme !== 'object' || Array.isArray(theme)) return theme;
  const copy: Record<string, unknown> = { ...(theme as Record<string, unknown>) };
  delete copy.assetBasePath;
  return copy;
}

/** 将数据库行映射为 PptTemplateRow。 */
function rowToTemplate(row: Record<string, unknown>): PptTemplateRow {
  const parse = (v: unknown, fallback: unknown) => (typeof v === 'string' ? JSON.parse(v as string) : (v ?? fallback));
  return {
    id: row.id as string,
    ownerId: (row.owner_id as string | null) ?? null,
    name: row.name as string,
    source: row.source as 'builtin' | 'uploaded',
    theme: stripAssetBasePath(parse(row.theme, {})),
    assetPaths: parse(row.asset_paths, {}) as Record<string, string>,
    createdAt: Number(row.created_at ?? 0),
  };
}

export class PptTemplateStore {
  /** 列出可用模板：builtin 恒可见，uploaded 仅本人 */
  async listByOwner(ownerId: string | null): Promise<PptTemplateRow[]> {
    const rows = await queryAll(
      `SELECT * FROM ppt_templates WHERE source = 'builtin' OR owner_id = $1 ORDER BY created_at ASC, id ASC`,
      [ownerId]
    );
    return rows.map(rowToTemplate);
  }

  /** 按 id 查模板 */
  async get(id: string): Promise<PptTemplateRow | undefined> {
    const row = await queryOne('SELECT * FROM ppt_templates WHERE id = $1', [id]);
    return row ? rowToTemplate(row) : undefined;
  }

  /** 新建模板（上传解析成功后调用；id 缺省自动生成，内置种子例程传固定语义 id） */
  async create(input: {
    id?: string;
    ownerId: string | null;
    name: string;
    source: 'builtin' | 'uploaded';
    theme: unknown;
    assetPaths?: Record<string, string>;
  }): Promise<PptTemplateRow> {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    await query(
      `INSERT INTO ppt_templates (id, owner_id, name, source, theme, asset_paths, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        id,
        input.ownerId,
        input.name,
        input.source,
        JSON.stringify(input.theme),
        JSON.stringify(input.assetPaths ?? {}),
        now,
      ]
    );
    return {
      id,
      ownerId: input.ownerId,
      name: input.name,
      source: input.source,
      theme: input.theme,
      assetPaths: input.assetPaths ?? {},
      createdAt: now,
    };
  }

  /** 删除模板：仅本人 uploaded 可删；builtin 或他人模板返回 false */
  async delete(id: string, ownerId: string): Promise<boolean> {
    const result = await query(`DELETE FROM ppt_templates WHERE id = $1 AND owner_id = $2 AND source = 'uploaded'`, [
      id,
      ownerId,
    ]);
    return result.rowCount === 1;
  }
}
