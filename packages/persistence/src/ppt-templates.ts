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

/** 将数据库行映射为 PptTemplateRow。 */
function rowToTemplate(row: Record<string, unknown>): PptTemplateRow {
  const parse = (v: unknown, fallback: unknown) => (typeof v === 'string' ? JSON.parse(v as string) : (v ?? fallback));
  return {
    id: row.id as string,
    ownerId: (row.owner_id as string | null) ?? null,
    name: row.name as string,
    source: row.source as 'builtin' | 'uploaded',
    theme: parse(row.theme, {}),
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

  /** 新建模板（上传解析成功后调用） */
  async create(input: {
    ownerId: string | null;
    name: string;
    source: 'builtin' | 'uploaded';
    theme: unknown;
    assetPaths?: Record<string, string>;
  }): Promise<PptTemplateRow> {
    const id = randomUUID();
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
