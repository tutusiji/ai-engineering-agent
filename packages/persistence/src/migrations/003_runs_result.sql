-- 003_runs_result.sql — runs 表补 result 列
-- 修复存量回归：e89881c JSON→PostgreSQL 迁移时遗漏。
-- workflows 路由执行完成后将 executionResult.nodeResults 写入 result
-- （见 routes/workflows.ts 的 runStore.update 调用），但 update() 白名单
-- 与本表均无此列，节点结果（大纲 JSON、fitting 警告等）被静默丢弃，
-- GET /api/runs/:id 永远不返回 result。
ALTER TABLE runs ADD COLUMN IF NOT EXISTS result JSONB;
