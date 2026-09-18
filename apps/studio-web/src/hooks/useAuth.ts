/**
 * useAuth — 用户认证状态管理 hook
 */

import { useState, useEffect, useCallback } from 'react';

const API = '/api';

export interface AuthUser {
  id: string;
  username: string;
  /** 头像 seed（用户「换一个头像」后持久化的意志字段；null=按 username 派生默认脸） */
  avatarSeed: string | null;
  /** 头像地址（后端按 DiceBear 协议现拼下发；前端不参与协议拼接） */
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setError(null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return true;
      }
      const data = await res.json();
      setError(data.error || 'Login failed');
      return false;
    } catch (err) {
      setError('Network error');
      return false;
    }
  }, []);

  const register = useCallback(async (username: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return true;
      }
      const data = await res.json();
      setError(data.error || 'Registration failed');
      return false;
    } catch (err) {
      setError('Network error');
      return false;
    }
  }, []);

  /**
   * shuffleAvatar — 换一个头像（PATCH /api/auth/me/avatar）
   *
   * 无参调用：目标恒为会话用户、seed 服务端生成；成功后直接用响应里的新 user
   * 覆盖本地状态（seed/URL 以后端为准，前端零协议参与）。
   */
  const shuffleAvatar = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API}/auth/me/avatar`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  return { user, loading, error, login, register, logout, shuffleAvatar };
}
