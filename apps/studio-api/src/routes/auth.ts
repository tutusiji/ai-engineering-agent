/**
 * auth — 用户认证路由（注册、登录、登出、当前用户、换头像）
 */

import { Router, type Request, type Response } from 'express';
import { UserStore, SessionStore } from '@ai-engineering-agent/persistence';
import { requireAuth, signToken, optionalAuth } from '../middleware/auth.js';
import { buildUserAvatarUrl, buildRandomAvatarSeed } from '../lib/avatar.js';

/**
 * 响应组装：user 附带头像字段
 * @param user store 读出的用户行（avatarSeed 可为 null）
 * @returns 含 avatarSeed 与 avatarUrl 的响应形态（URL 由后端按配置现拼，前端不参与协议）
 */
function toPublicUser(user: { id: string; username: string; avatarSeed: string | null }) {
  const avatarSeed = user.avatarSeed ?? null;
  return { ...user, avatarSeed, avatarUrl: buildUserAvatarUrl({ ...user, avatarSeed }) };
}

export function createAuthRouter(userStore: UserStore, sessionStore: SessionStore) {
  const router = Router();

  /** POST /api/auth/register — 注册新用户 */
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      if (username.length < 2 || username.length > 32) {
        return res.status(400).json({ error: 'Username must be 2-32 characters' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      if (await userStore.exists(username)) {
        return res.status(409).json({ error: 'Username already taken' });
      }

      const id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const user = await userStore.create(id, username, password);
      const token = signToken(user);

      // Set httpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.json({ user: toPublicUser(user), token });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  /** POST /api/auth/login — 用户登录 */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const user = await userStore.verifyPassword(username, password);
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = signToken(user);

      // Set httpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({ user: toPublicUser(user), token });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  /** POST /api/auth/logout — 登出 */
  router.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie('token');
    return res.json({ ok: true });
  });

  /** GET /api/auth/me — 获取当前登录用户 */
  router.get('/me', optionalAuth, async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const user = await userStore.getById(req.user.id);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      return res.json({ user: toPublicUser(user) });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  /**
   * PATCH /api/auth/me/avatar — 换一个头像
   *
   * 无参数、恒作用于会话用户：目标不可指定（无跨用户路径）、seed 由服务端生成
   * （不可指定 URL，无任意头像地址注入面），与 gemini-skillhub 的同名端点同约定。
   */
  router.patch('/me/avatar', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await userStore.getById(req.user.id);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      const nextSeed = buildRandomAvatarSeed(user, user.avatarSeed);
      const updated = await userStore.updateAvatarSeed(user.id, nextSeed);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({ user: toPublicUser(updated) });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
