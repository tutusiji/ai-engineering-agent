/**
 * avatar — DiceBear 头像地址生成（与 gemini-skillhub 同一协议）
 *
 * 形态：{AVATAR_BASE_URL}/{AVATAR_STYLE}/svg?seed={seed}
 *   官方公共服务（默认）：https://api.dicebear.com/10.x/adventurer/svg?seed=xxx
 *   内网自建（切换只改环境变量）：http://<host>:<port>/9.x/adventurer/svg?seed=xxx
 *
 * 关键设计：host 与版本号只存在于配置，不写死业务代码——内网自建服务 pinned 的
 * DiceBear 大版本与官方不同，base 里自带版本段，切换时改 AVATAR_BASE_URL 即可。
 */

/** 官方公共服务，未配置时的缺省值 */
export const DEFAULT_AVATAR_BASE_URL = 'https://api.dicebear.com/10.x';

/** 缺省头像风格 */
export const DEFAULT_AVATAR_STYLE = 'adventurer';

/** 读取头像服务 base（去尾部斜杠，便于拼接） */
export function resolveAvatarBaseUrl(): string {
  const raw = (process.env.AVATAR_BASE_URL || '').trim();
  return (raw || DEFAULT_AVATAR_BASE_URL).replace(/\/+$/, '');
}

/** 读取头像风格 */
export function resolveAvatarStyle(): string {
  const raw = (process.env.AVATAR_STYLE || '').trim();
  return raw || DEFAULT_AVATAR_STYLE;
}

/**
 * 按 seed 生成头像 URL
 * @param seed 稳定标识（同一个人必须始终得到同一个 seed，否则头像会变脸）
 */
export function buildAvatarUrl(seed: string): string {
  const safeSeed = encodeURIComponent((seed || 'anonymous').trim() || 'anonymous');
  return `${resolveAvatarBaseUrl()}/${resolveAvatarStyle()}/svg?seed=${safeSeed}`;
}

/** 头像 seed 的来源身份 */
export interface AvatarIdentity {
  /** 用户手动换头像后持久化的 seed，存在时优先级最高 */
  avatarSeed?: string | null;
  /** 登录名（本系统唯一稳定标识，仅次于自选 seed） */
  username?: string | null;
  id?: string | null;
}

/**
 * 从用户身份挑选稳定 seed
 *
 * 优先级：自选 seed → 登录名 → 用户 id → 'anonymous'（固定兜底而非随机，保证幂等）。
 */
export function resolveAvatarSeed(identity: AvatarIdentity): string {
  return identity.avatarSeed?.trim() || identity.username?.trim() || identity.id?.trim() || 'anonymous';
}

/** 按用户身份直接生成头像 URL */
export function buildUserAvatarUrl(identity: AvatarIdentity): string {
  return buildAvatarUrl(resolveAvatarSeed(identity));
}

/**
 * 生成「换一个头像」用的新 seed
 *
 * 形态 `{username}-{4位base36}`：基础部分不含自选 seed（否则连续切换会滚成
 * `id-a1b2-c3d4-...` 越来越长），随机后缀提供变化；强制与当前 seed 不同，
 * 避免点了按钮头像却没变。
 * @param identity 用户身份
 * @param current 当前 seed，用于确保新值一定不同
 */
export function buildRandomAvatarSeed(identity: AvatarIdentity, current?: string | null): string {
  const base = resolveAvatarSeed({ ...identity, avatarSeed: null });
  let next: string;
  do {
    next = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  } while (next === (current || '').trim());
  return next;
}
