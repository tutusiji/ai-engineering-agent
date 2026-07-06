/**
 * Session Store — PostgreSQL-backed persistent session management
 */

import { query, queryOne, queryAll } from './store.js';
import type { SessionArtifactRun } from '@ai-engineering-agent/shared-types';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  name: string;
  profileId?: string;
  uiLibrary?: string;
  messages: ChatMessage[];
  document?: Record<string, unknown>;
  completeness: number;
  pinned: boolean;
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

/** Map a DB row to Session interface. */
function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    name: row.name as string,
    profileId: row.profile_id as string | undefined,
    uiLibrary: row.ui_library as string | undefined,
    messages: (typeof row.messages === 'string' ? JSON.parse(row.messages as string) : row.messages) as ChatMessage[],
    document: row.document ? (typeof row.document === 'string' ? JSON.parse(row.document as string) : row.document as Record<string, unknown>) : undefined,
    completeness: row.completeness as number,
    pinned: Boolean(row.pinned),
    userId: row.user_id as string | undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class SessionStore {
  async create(id: string, name?: string, userId?: string): Promise<Session> {
    const now = Date.now();
    const sessionName = name ?? `会话 ${new Date(now).toLocaleString('zh-CN')}`;
    await query(
      `INSERT INTO sessions (id, name, messages, completeness, user_id, created_at, updated_at)
       VALUES ($1, $2, '[]'::jsonb, 0, $3, $4, $5)`,
      [id, sessionName, userId ?? null, now, now]
    );
    return { id, name: sessionName, messages: [], completeness: 0, pinned: false, userId, createdAt: now, updatedAt: now };
  }

  async get(id: string): Promise<Session | undefined> {
    const row = await queryOne('SELECT * FROM sessions WHERE id = $1', [id]);
    return row ? rowToSession(row) : undefined;
  }

  async list(userId?: string): Promise<Session[]> {
    if (userId) {
      const rows = await queryAll(
        'SELECT * FROM sessions WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC',
        [userId]
      );
      return rows.map(rowToSession);
    }
    const rows = await queryAll('SELECT * FROM sessions ORDER BY pinned DESC, updated_at DESC');
    return rows.map(rowToSession);
  }

  async update(id: string, patch: Partial<Session>): Promise<Session | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (patch.name !== undefined) {
      sets.push(`name = $${paramIdx++}`);
      values.push(patch.name);
    }
    if (patch.profileId !== undefined) {
      sets.push(`profile_id = $${paramIdx++}`);
      values.push(patch.profileId);
    }
    if (patch.uiLibrary !== undefined) {
      sets.push(`ui_library = $${paramIdx++}`);
      values.push(patch.uiLibrary);
    }
    if (patch.messages !== undefined) {
      sets.push(`messages = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(patch.messages));
    }
    if (patch.document !== undefined) {
      sets.push(`document = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(patch.document));
    }
    if (patch.completeness !== undefined) {
      sets.push(`completeness = $${paramIdx++}`);
      values.push(patch.completeness);
    }
    if (patch.pinned !== undefined) {
      sets.push(`pinned = $${paramIdx++}`);
      values.push(patch.pinned);
    }
    if (patch.userId !== undefined) {
      sets.push(`user_id = $${paramIdx++}`);
      values.push(patch.userId);
    }

    sets.push(`updated_at = $${paramIdx++}`);
    values.push(Date.now());

    values.push(id);
    const sql = `UPDATE sessions SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    const row = await queryOne(sql, values);
    return row ? rowToSession(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM sessions WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async addMessage(id: string, message: ChatMessage): Promise<Session | undefined> {
    const now = Date.now();
    const row = await queryOne(
      `UPDATE sessions
       SET messages = messages || $2::jsonb,
           updated_at = $3
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(message), now]
    );
    return row ? rowToSession(row) : undefined;
  }

  async updateDocument(id: string, document: Record<string, unknown>, completeness: number): Promise<Session | undefined> {
    const now = Date.now();
    const row = await queryOne(
      `UPDATE sessions
       SET document = $2::jsonb,
           completeness = $3,
           updated_at = $4
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(document), completeness, now]
    );
    return row ? rowToSession(row) : undefined;
  }

  async addArtifactRun(id: string, run: SessionArtifactRun): Promise<Session | undefined> {
    const session = await this.get(id);
    if (!session) return undefined;
    const doc = session.document ?? {};
    const runs = (doc._artifactRuns as SessionArtifactRun[] | undefined) ?? [];
    runs.push(run);
    doc._artifactRuns = runs;
    return this.updateDocument(id, doc, session.completeness);
  }

  /** Assign all sessions without a user_id to a specific user. */
  async assignOrphanSessions(userId: string): Promise<number> {
    const result = await query(
      `UPDATE sessions SET user_id = $1 WHERE user_id IS NULL`,
      [userId]
    );
    return result.rowCount ?? 0;
  }
}
