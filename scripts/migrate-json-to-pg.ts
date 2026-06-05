/**
 * Migration script: JSON files → PostgreSQL
 *
 * Reads existing sessions.json and runs.json from ~/.ai-studio/data/
 * and inserts them into the PostgreSQL studio database.
 *
 * Usage: npx tsx scripts/migrate-json-to-pg.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import pg from 'pg';

const { Pool } = pg;

const DATA_DIR = join(homedir(), '.ai-studio', 'data');
const CONN_STRING = 'postgresql://studio:studio2026@localhost:5432/studio';

async function main() {
  const pool = new Pool({ connectionString: CONN_STRING });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL');

    // ─── Migrate Sessions ─────────────────────────────────────────
    const sessionsFile = join(DATA_DIR, 'sessions.json');
    if (existsSync(sessionsFile)) {
      const sessionsData = JSON.parse(readFileSync(sessionsFile, 'utf-8'));
      const sessions = Object.values(sessionsData) as Record<string, unknown>[];
      console.log(`📦 Found ${sessions.length} sessions to migrate`);

      let migrated = 0;
      let skipped = 0;

      for (const s of sessions) {
        try {
          await pool.query(
            `INSERT INTO sessions (id, name, profile_id, ui_library, messages, document, completeness, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
            [
              s.id,
              s.name ?? `Session ${s.id}`,
              s.profileId ?? null,
              s.uiLibrary ?? null,
              JSON.stringify(s.messages ?? []),
              s.document ? JSON.stringify(s.document) : null,
              s.completeness ?? 0,
              s.createdAt ?? Date.now(),
              s.updatedAt ?? Date.now(),
            ]
          );
          migrated++;
        } catch (err: unknown) {
          console.warn(`⚠️  Skipping session ${s.id}: ${(err as Error).message}`);
          skipped++;
        }
      }

      console.log(`✅ Sessions: ${migrated} migrated, ${skipped} skipped`);
    } else {
      console.log('ℹ️  No sessions.json found, skipping');
    }

    // ─── Migrate Runs ─────────────────────────────────────────────
    const runsFile = join(DATA_DIR, 'runs.json');
    if (existsSync(runsFile)) {
      const runsData = JSON.parse(readFileSync(runsFile, 'utf-8'));
      const runs = Object.values(runsData) as Record<string, unknown>[];
      console.log(`📦 Found ${runs.length} runs to migrate`);

      let migrated = 0;
      let skipped = 0;

      for (const r of runs) {
        try {
          await pool.query(
            `INSERT INTO runs (id, workflow_id, workflow_name, status, stages, approval_history, artifacts, error, started_at, completed_at, duration, trigger)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING`,
            [
              r.id,
              r.workflowId ?? 'unknown',
              r.workflowName ?? 'Unknown Workflow',
              r.status ?? 'pending',
              JSON.stringify(r.stages ?? []),
              JSON.stringify(r.approvalHistory ?? []),
              JSON.stringify(r.artifacts ?? []),
              r.error ?? null,
              r.startedAt ?? Date.now(),
              r.completedAt ?? null,
              r.duration ?? null,
              r.trigger ?? 'manual',
            ]
          );
          migrated++;
        } catch (err: unknown) {
          console.warn(`⚠️  Skipping run ${r.id}: ${(err as Error).message}`);
          skipped++;
        }
      }

      console.log(`✅ Runs: ${migrated} migrated, ${skipped} skipped`);
    } else {
      console.log('ℹ️  No runs.json found, skipping');
    }

    // ─── Verify ───────────────────────────────────────────────────
    const sessionCount = await pool.query('SELECT COUNT(*) FROM sessions');
    const runCount = await pool.query('SELECT COUNT(*) FROM runs');
    console.log(`\n📊 Final counts:`);
    console.log(`   Sessions: ${sessionCount.rows[0].count}`);
    console.log(`   Runs: ${runCount.rows[0].count}`);
    console.log('\n🎉 Migration complete!');

  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
