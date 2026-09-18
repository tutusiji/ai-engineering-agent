/**
 * User Store — PostgreSQL-backed user management with scrypt password hashing
 */

import crypto from 'node:crypto';
import { query, queryOne, queryAll } from './store.js';

export interface User {
  id: string;
  username: string;
  /** 头像 seed（DiceBear）：用户「换一个头像」后持久化的意志字段；NULL 时由调用方回退 username 派生 */
  avatarSeed: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (!stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    username: row.username as string,
    avatarSeed: (row.avatar_seed as string | null) ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToUserWithPassword(row: Record<string, unknown>): UserWithPassword {
  return {
    ...rowToUser(row),
    passwordHash: row.password_hash as string,
  };
}

export class UserStore {
  /** Ensure the users table exists. */
  async ensureTable(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
  }

  /** Create a new user with a hashed password. */
  async create(id: string, username: string, password: string): Promise<User> {
    const now = Date.now();
    const passwordHash = hashPassword(password);
    await query(
      `INSERT INTO users (id, username, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, username, passwordHash, now, now]
    );
    return { id, username, avatarSeed: null, createdAt: now, updatedAt: now };
  }

  /** Get a user by ID (without password hash). */
  async getById(id: string): Promise<User | undefined> {
    const row = await queryOne('SELECT * FROM users WHERE id = $1', [id]);
    return row ? rowToUser(row) : undefined;
  }

  /** Get a user by username with password hash (for authentication). */
  async getByUsernameWithPassword(username: string): Promise<UserWithPassword | undefined> {
    const row = await queryOne('SELECT * FROM users WHERE username = $1', [username]);
    return row ? rowToUserWithPassword(row) : undefined;
  }

  /** Verify a password against a user's hash. */
  async verifyPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getByUsernameWithPassword(username);
    if (!user) return null;
    const valid = verifyPassword(password, user.passwordHash);
    if (!valid) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  /** List all users (without password hashes). */
  async list(): Promise<User[]> {
    const rows = await queryAll('SELECT * FROM users ORDER BY created_at ASC');
    return rows.map(rowToUser);
  }

  /** Check if a user exists by username. */
  async exists(username: string): Promise<boolean> {
    const row = await queryOne('SELECT 1 FROM users WHERE username = $1', [username]);
    return !!row;
  }

  /** 更新头像 seed（「换一个头像」），返回更新后的用户（不含密码哈希）。 */
  async updateAvatarSeed(id: string, seed: string): Promise<User | undefined> {
    const result = await query(
      `UPDATE users SET avatar_seed = $2, updated_at = $3 WHERE id = $1
       RETURNING id, username, avatar_seed, created_at, updated_at`,
      [id, seed, Date.now()]
    );
    const row = result.rows[0];
    return row ? rowToUser(row) : undefined;
  }
}
