/**
 * migrate — 轻量级版本化数据库迁移 runner
 *
 * 设计：
 * - 迁移文件为 SQL，放在 src/migrations/ 下，按编号命名（001_init.sql, 002_xxx.sql）
 * - 执行记录存入 schema_migrations 表，已应用的迁移不会重复执行
 * - 每个迁移在独立事务中执行（PostgreSQL DDL 支持事务）
 * - server.ts 启动时调用 runMigrations() 自动执行未应用的迁移
 *
 * 用法：
 *   import { runMigrations } from '@ai-engineering-agent/persistence';
 *   await runMigrations();  // 启动时调用
 *
 * 手动执行：
 *   pnpm tsx scripts/migrate.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, getPool } from './store.js';

/** 迁移记录 */
export interface MigrationRecord {
  filename: string;
  appliedAt: number;
}

/** schema_migrations 表 DDL */
const MIGRATIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at BIGINT NOT NULL
  )
`;

/** 从 migrations 目录读取所有 .sql 文件（按文件名排序） */
function listMigrationFiles(migrationsDir: string): string[] {
  try {
    return readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }
}

/** 获取已应用的迁移列表 */
async function getAppliedMigrations(): Promise<Set<string>> {
  await query(MIGRATIONS_TABLE_DDL);
  const rows = await query('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set(rows.rows.map((r) => r.filename as string));
}

/**
 * 执行所有未应用的迁移。
 *
 * - 返回已应用的迁移文件名列表
 * - 某个迁移失败时立即抛出异常（事务回滚，不影响已应用的迁移）
 */
export async function runMigrations(migrationsDir?: string): Promise<string[]> {
  // 解析 migrations 目录（默认为当前模块同级 migrations/）
  const defaultDir = migrationsDir ?? (() => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, 'migrations');
  })();

  const files = listMigrationFiles(defaultDir);
  if (files.length === 0) {
    console.log('[migrate] 无迁移文件，跳过');
    return [];
  }

  const applied = await getAppliedMigrations();
  const newlyApplied: string[] = [];

  for (const filename of files) {
    if (applied.has(filename)) continue;

    const filePath = join(defaultDir, filename);
    const sql = readFileSync(filePath, 'utf-8');
    const now = Date.now();

    console.log(`[migrate] 应用迁移: ${filename}`);

    // 每个迁移在独立事务中执行（DDL 也支持事务回滚）
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      // 执行迁移 SQL（可能包含多条语句）
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, $2)',
        [filename, now],
      );
      await client.query('COMMIT');
      newlyApplied.push(filename);
      console.log(`[migrate] ✅ ${filename} 完成`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ❌ ${filename} 失败，已回滚`);
      throw err;
    } finally {
      client.release();
    }
  }

  if (newlyApplied.length === 0) {
    console.log('[migrate] 所有迁移已应用，无需操作');
  } else {
    console.log(`[migrate] 完成，共应用 ${newlyApplied.length} 个迁移`);
  }

  return newlyApplied;
}
