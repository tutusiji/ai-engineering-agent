-- 001_init.sql — 初始 schema：创建核心业务表
--
-- 包含: sessions, runs, users, project_metrics
-- 所有表使用 BIGINT 存储时间戳（与代码中 Date.now() 一致），JSONB 存储结构化文档。

-- ─── sessions ──────────────────────────────────────────────
-- 会话表：存储用户对话、需求文档、架构/设计版本等
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  profile_id TEXT,
  ui_library TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  document JSONB,
  completeness INTEGER NOT NULL DEFAULT 0,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  user_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions (updated_at DESC);

-- ─── runs ──────────────────────────────────────────────────
-- 工作流运行记录表：存储执行状态、阶段、审批历史、产物引用
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stages JSONB NOT NULL DEFAULT '[]',
  approval_history JSONB NOT NULL DEFAULT '[]',
  artifacts JSONB NOT NULL DEFAULT '[]',
  error TEXT,
  started_at BIGINT NOT NULL,
  completed_at BIGINT,
  duration BIGINT,
  trigger TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_workflow_id ON runs (workflow_id);

-- ─── users ─────────────────────────────────────────────────
-- 用户表：用户名唯一，密码使用 scrypt + salt 哈希存储
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ─── project_metrics ───────────────────────────────────────
-- 项目指标表：存储生成质量、阶段耗时、产物统计等
CREATE TABLE IF NOT EXISTS project_metrics (
  project_id TEXT PRIMARY KEY,
  session_id TEXT,
  profile JSONB NOT NULL DEFAULT '{}',
  stages JSONB NOT NULL DEFAULT '[]',
  artifacts JSONB NOT NULL DEFAULT '{}',
  quality JSONB NOT NULL DEFAULT '{}',
  timings JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
