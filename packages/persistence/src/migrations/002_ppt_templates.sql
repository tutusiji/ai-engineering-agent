-- 002_ppt_templates.sql — PPT 模板表 + 内置主题种子
-- 所有时间戳用 BIGINT（与 001_init.sql 约定一致）；theme 整存 JSONB。
CREATE TABLE IF NOT EXISTS ppt_templates (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('builtin', 'uploaded')),
  theme JSONB NOT NULL,
  asset_paths JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ppt_templates_owner ON ppt_templates (owner_id);

-- 内置主题种子（幂等：重复执行跳过）；colors 无 # 前缀（与 pptx-core 预算表/测试一致）
INSERT INTO ppt_templates (id, owner_id, name, source, theme, asset_paths, created_at) VALUES
  ('theme-business-blue', NULL, '商务深蓝', 'builtin',
   $${
     "name": "商务深蓝", "mode": "preset",
     "colors": { "primary": "1D4ED8", "secondary": "3B82F6", "background": "FFFFFF", "surface": "EFF6FF", "text": "0F172A", "accent": "F59E0B" },
     "fonts": { "title": "Microsoft YaHei", "body": "Microsoft YaHei" },
     "slideSize": "16:9", "layoutDensity": "standard"
   }$$::jsonb, '{}'::jsonb, 0),
  ('theme-tech-dark', NULL, '科技暗黑', 'builtin',
   $${
     "name": "科技暗黑", "mode": "preset",
     "colors": { "primary": "22D3EE", "secondary": "818CF8", "background": "0B1120", "surface": "1E293B", "text": "E2E8F0", "accent": "34D399" },
     "fonts": { "title": "Microsoft YaHei", "body": "Microsoft YaHei" },
     "slideSize": "16:9", "layoutDensity": "standard"
   }$$::jsonb, '{}'::jsonb, 0),
  ('theme-minimal-light', NULL, '简约浅色', 'builtin',
   $${
     "name": "简约浅色", "mode": "preset",
     "colors": { "primary": "0F766E", "secondary": "14B8A6", "background": "FAFAF9", "surface": "F0FDFA", "text": "1C1917", "accent": "F97316" },
     "fonts": { "title": "Microsoft YaHei", "body": "Microsoft YaHei" },
     "slideSize": "16:9", "layoutDensity": "standard"
   }$$::jsonb, '{}'::jsonb, 0)
ON CONFLICT (id) DO NOTHING;
