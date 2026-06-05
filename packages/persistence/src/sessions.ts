/**
 * Session Store — PostgreSQL-backed persistent session management
 */

import { query, queryOne, queryAll } from './store.js';

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
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class SessionStore {
  async create(id: string, name?: string): Promise<Session> {
    const now = Date.now();
    const sessionName = name ?? `会话 ${new Date(now).toLocaleString('zh-CN')}`;
    await query(
      `INSERT INTO sessions (id, name, messages, completeness, created_at, updated_at)
       VALUES ($1, $2, '[]'::jsonb, 0, $3, $3)`,
      [id, sessionName, now]
    );
    return { id, name: sessionName, messages: [], completeness: 0, createdAt: now, updatedAt: now };
  }

  async get(id: string): Promise<Session | undefined> {
    const row = await queryOne('SELECT * FROM sessions WHERE id = $1', [id]);
    return row ? rowToSession(row) : undefined;
  }

  async list(): Promise<Session[]> {
    const rows = await queryAll('SELECT * FROM sessions ORDER BY updated_at DESC');
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
}
