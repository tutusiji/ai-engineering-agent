/**
 * auth — JWT authentication middleware
 *
 * Reads the JWT from the Authorization header (Bearer token) or from an
 * httpOnly cookie. Attaches the decoded user info to `req.user`.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret as loadJwtSecret, getJwtExpiresIn } from '../lib/secrets.js';

export interface AuthUser {
  id: string;
  username: string;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** 惰性初始化的 JWT 密钥缓存（首次调用时读取 env 并校验，后续复用） */
let cachedSecret: string | null = null;

function secret(): string {
  if (cachedSecret === null) {
    cachedSecret = loadJwtSecret();
  }
  return cachedSecret;
}

export function getJwtSecret(): string {
  return secret();
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, username: user.username }, secret(), {
    expiresIn: getJwtExpiresIn(),
  });
}

/**
 * requireAuth — Middleware that rejects unauthenticated requests with 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const decoded = jwt.verify(token, secret()) as AuthUser;
    req.user = { id: decoded.id, username: decoded.username };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * optionalAuth — Middleware that attaches user if token is valid, but does not reject.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, secret()) as AuthUser;
      req.user = { id: decoded.id, username: decoded.username };
    } catch {
      // ignore invalid token
    }
  }
  next();
}

function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Check cookie
  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('token='));
    if (match) return match.split('=')[1];
  }
  return null;
}
