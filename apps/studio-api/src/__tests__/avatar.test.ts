/**
 * avatar util 纯函数测试 — seed 解析优先级 / URL 拼接 / 随机 seed 生成
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_AVATAR_BASE_URL,
  DEFAULT_AVATAR_STYLE,
  buildAvatarUrl,
  resolveAvatarSeed,
  buildRandomAvatarSeed,
} from '../lib/avatar.js';

/** 保存/恢复环境变量，避免测试互相污染 */
const ENV_KEYS = ['AVATAR_BASE_URL', 'AVATAR_STYLE'] as const;
const savedEnv: Record<string, string | undefined> = {};
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
    delete savedEnv[k];
  }
});

/** 临时设置环境变量并记录原值 */
function setEnv(key: (typeof ENV_KEYS)[number], value: string): void {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  process.env[key] = value;
}

describe('resolveAvatarSeed', () => {
  it('优先级：avatarSeed > username > id > anonymous', () => {
    expect(resolveAvatarSeed({ avatarSeed: 'u-9x2k', username: 'alice', id: 'user-1' })).toBe('u-9x2k');
    expect(resolveAvatarSeed({ username: 'alice', id: 'user-1' })).toBe('alice');
    expect(resolveAvatarSeed({ id: 'user-1' })).toBe('user-1');
    expect(resolveAvatarSeed({})).toBe('anonymous');
    expect(resolveAvatarSeed({ avatarSeed: '  ', username: 'alice' })).toBe('alice');
  });
});

describe('buildAvatarUrl', () => {
  it('默认官方 base + adventurer 风格，seed 做 URL 编码', () => {
    expect(buildAvatarUrl('alice')).toBe(
      `${DEFAULT_AVATAR_BASE_URL}/${DEFAULT_AVATAR_STYLE}/svg?seed=alice`
    );
    expect(buildAvatarUrl('张 三')).toContain('seed=%E5%BC%A0%20%E4%B8%89');
  });

  it('空 seed 回退 anonymous；空白被 trim', () => {
    expect(buildAvatarUrl('')).toContain('seed=anonymous');
    expect(buildAvatarUrl('  ')).toContain('seed=anonymous');
    expect(buildAvatarUrl(' alice ')).toContain('seed=alice');
  });

  it('环境变量覆盖 base 与 style（切内网自建服务场景）', () => {
    setEnv('AVATAR_BASE_URL', 'http://10.9.43.61:4987/9.x');
    setEnv('AVATAR_STYLE', 'bottts');
    const url = buildAvatarUrl('alice');
    expect(url).toBe('http://10.9.43.61:4987/9.x/bottts/svg?seed=alice');
  });

  it('base 尾部多余斜杠被规范化', () => {
    setEnv('AVATAR_BASE_URL', 'http://10.9.43.61:4987/9.x///');
    expect(buildAvatarUrl('alice')).toContain('/9.x/adventurer/svg?seed=alice');
  });
});

describe('buildRandomAvatarSeed', () => {
  const identity = { username: 'alice' };

  it('新 seed 形如 {username}-{4位base36} 且与当前不同', () => {
    const next = buildRandomAvatarSeed(identity, 'alice');
    expect(next).toMatch(/^alice-[0-9a-z]{4}$/);
    expect(next).not.toBe('alice');
    const next2 = buildRandomAvatarSeed(identity, next);
    expect(next2).not.toBe(next);
  });

  it('基础部分不含旧 avatarSeed——连续切换不滚雪球', () => {
    let seed = buildRandomAvatarSeed(identity, 'alice');
    for (let i = 0; i < 20; i++) {
      seed = buildRandomAvatarSeed(identity, seed);
    }
    expect(seed).toMatch(/^alice-[0-9a-z]{4}$/);
    expect(seed.length).toBeLessThanOrEqual('alice-'.length + 4);
  });
});
