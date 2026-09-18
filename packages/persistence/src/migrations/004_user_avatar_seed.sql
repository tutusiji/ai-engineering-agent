-- 004_user_avatar_seed.sql — users 表补 avatar_seed 列（DiceBear 头像系统）
-- seed 是用户的头像意志字段（「换一个头像」持久化的就是它）；
-- 头像地址由后端按 {AVATAR_BASE_URL}/{AVATAR_STYLE}/svg?seed= 协议运行时派生，
-- 不入库（切内网自建服务只需改环境变量，无需数据迁移）。
-- 存量行 avatar_seed 为 NULL，seed 解析回退到 username（同一个人头像恒定）。
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_seed TEXT;
