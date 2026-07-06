#!/usr/bin/env tsx
/**
 * migrate — 手动执行数据库迁移
 *
 * 用法: pnpm tsx scripts/migrate.ts
 *
 * 读取 packages/persistence/src/migrations/ 下的 SQL 文件，
 * 按编号顺序执行未应用的迁移，记录到 schema_migrations 表。
 * 每个 migration 在独立事务中执行，失败时回滚。
 */

import { initPool, closePool, runMigrations } from '@ai-engineering-agent/persistence';

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Database Migration Runner              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  await initPool();

  try {
    const applied = await runMigrations();
    if (applied.length > 0) {
      console.log(`\n✅ 迁移完成，共应用 ${applied.length} 个迁移:`);
      for (const f of applied) {
        console.log(`   - ${f}`);
      }
    } else {
      console.log('\n✅ 无需迁移');
    }
  } finally {
    await closePool();
    console.log('\n数据库连接已关闭');
  }
}

main().catch((err) => {
  console.error('\n❌ 迁移失败:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
