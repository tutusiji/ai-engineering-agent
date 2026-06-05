/**
 * Database Store — PostgreSQL connection pool + query helpers
 *
 * Replaces the JSON file store with PostgreSQL for better concurrency,
 * performance, and scalability.
 */

import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
const { Pool } = pg;

const DEFAULT_CONNECTION_STRING = 'postgresql://studio:studio2026@localhost:5432/studio';
const DEFAULT_ARTIFACT_DIR = join(homedir(), '.ai-studio', 'data', 'artifacts');

let pool: pg.Pool | null = null;

export interface StoreOptions {
  connectionString?: string;
}

/** Initialize the connection pool. Call once at startup. */
export function initPool(options: StoreOptions = {}): pg.Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: options.connectionString ?? DEFAULT_CONNECTION_STRING,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => {
    console.error('[PostgresStore] Unexpected pool error:', err.message);
  });
  return pool;
}

/** Get the existing pool. Throws if not initialized. */
export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('[PostgresStore] Pool not initialized. Call initPool() first.');
  }
  return pool;
}

/** Close the pool gracefully. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Execute a query with automatic parameterized binding. */
export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const p = getPool();
  return p.query<T>(text, params);
}

/** Execute a query and return the first row or undefined. */
export async function queryOne<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | undefined> {
  const result = await query<T>(text, params);
  return result.rows[0];
}

/** Execute a query and return all rows. */
export async function queryAll<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Artifact Store — File-based artifact storage
 * Stores generated files (code, designs, reports) organized by runId.
 */
export class ArtifactStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? DEFAULT_ARTIFACT_DIR;
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /** Save an artifact file for a run. */
  save(runId: string, filePath: string, content: string): string {
    const artifactDir = join(this.baseDir, runId);
    if (!existsSync(artifactDir)) {
      mkdirSync(artifactDir, { recursive: true });
    }
    const fullPath = join(artifactDir, filePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  }

  /** Read an artifact file. */
  read(runId: string, filePath: string): string | undefined {
    const fullPath = join(this.baseDir, runId, filePath);
    if (!existsSync(fullPath)) return undefined;
    return readFileSync(fullPath, 'utf-8');
  }

  /** List all artifacts for a run. */
  list(runId: string): Array<{ path: string; size: number; modified: Date }> {
    const artifactDir = join(this.baseDir, runId);
    if (!existsSync(artifactDir)) return [];
    return this.walkDir(artifactDir, artifactDir);
  }

  private walkDir(dir: string, base: string): Array<{ path: string; size: number; modified: Date }> {
    const results: Array<{ path: string; size: number; modified: Date }> = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walkDir(fullPath, base));
      } else {
        const stat = statSync(fullPath);
        results.push({
          path: fullPath.slice(base.length + 1),
          size: stat.size,
          modified: stat.mtime,
        });
      }
    }
    return results;
  }

  /** Delete all artifacts for a run. */
  deleteRun(runId: string): boolean {
    const artifactDir = join(this.baseDir, runId);
    if (!existsSync(artifactDir)) return false;
    rmSync(artifactDir, { recursive: true, force: true });
    return true;
  }

  /** Get the full path for a run's artifact directory. */
  getRunDir(runId: string): string {
    return join(this.baseDir, runId);
  }
}
