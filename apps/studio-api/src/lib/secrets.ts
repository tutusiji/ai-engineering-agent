/**
 * secrets — 敏感配置的安全加载与启动校验
 *
 * 设计原则：
 * - 生产环境（NODE_ENV=production）缺少必填密钥时立即 fail-fast，拒绝启动
 * - 开发环境允许使用显式标记的弱默认值，但打印警告
 * - 所有密钥只在调用时读取（非模块级常量），确保 env 变量热更新可生效
 */

/** 开发环境专用的弱默认密钥（仅用于本地调试，绝不可用于生产） */
const DEV_FALLBACK_SECRET = 'dev-only-secret-not-for-production';

/**
 * 获取 JWT 签名密钥。
 *
 * - 生产环境未设置 JWT_SECRET → process.exit(1)，拒绝启动
 * - 开发环境未设置 → 返回弱默认值并打印警告
 * - 已设置 → 返回实际值
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.length >= 16) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET 未设置或长度不足 16 字符，生产环境拒绝启动。');
    console.error('       请在环境变量中配置一个强随机密钥（建议 >= 32 字符）。');
    process.exit(1);
  }

  // 开发环境：允许弱默认值，但每次调用都警告（避免遗忘）
  if (!secret) {
    console.warn('⚠️  JWT_SECRET 未设置，使用开发默认值（绝不可用于生产）。');
  } else {
    console.warn(`⚠️  JWT_SECRET 长度仅 ${secret.length} 字符，建议 >= 32 字符。`);
  }
  return secret || DEV_FALLBACK_SECRET;
}

/**
 * JWT 过期时间（支持环境变量覆盖）。
 * 默认 7 天，与 cookie maxAge 保持一致。
 */
export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN ?? '7d';
}
