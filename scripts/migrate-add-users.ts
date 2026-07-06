/**
 * Migration: Add users table + user_id column to sessions
 *
 * 1. Creates `users` table if not exists
 * 2. Adds `user_id` column to `sessions` table if not exists
 * 3. Creates the default admin user (admin / @huangkun123)
 * 4. Assigns all orphan sessions (user_id IS NULL) to admin
 *
 * Usage: npx tsx scripts/migrate-add-users.ts
 */

import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const CONN_STRING = process.env.DATABASE_URL ?? 'postgresql://studio:studio2026@localhost:5432/studio';

/** Simple bcrypt-like password hashing using Node's scrypt. */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  const pool = new Pool({ connectionString: CONN_STRING });

  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL');

    // 1. Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    console.log('✅ users table ensured');

    // 2. Add user_id column to sessions
    const colCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'sessions' AND column_name = 'user_id'`
    );
    if (colCheck.rowCount === 0) {
      await pool.query(`ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id)`);
      console.log('✅ Added user_id column to sessions');
    } else {
      console.log('ℹ️  user_id column already exists on sessions');
    }

    // 3. Create admin user
    const adminExists = await pool.query(`SELECT 1 FROM users WHERE username = 'admin'`);
    if (adminExists.rowCount === 0) {
      const adminId = 'user-admin';
      const now = Date.now();
      const passwordHash = hashPassword('@huangkun123');
      await pool.query(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [adminId, 'admin', passwordHash, now, now]
      );
      console.log('✅ Created admin user (admin / @huangkun123)');

      // 4. Assign orphan sessions to admin
      const result = await pool.query(
        `UPDATE sessions SET user_id = $1 WHERE user_id IS NULL`,
        [adminId]
      );
      console.log(`✅ Assigned ${result.rowCount ?? 0} orphan sessions to admin`);
    } else {
      console.log('ℹ️  Admin user already exists');
      const adminRow = await pool.query(`SELECT id FROM users WHERE username = 'admin'`);
      const adminId = adminRow.rows[0]?.id;
      if (adminId) {
        const result = await pool.query(
          `UPDATE sessions SET user_id = $1 WHERE user_id IS NULL`,
          [adminId]
        );
        if ((result.rowCount ?? 0) > 0) {
          console.log(`✅ Assigned ${result.rowCount} new orphan sessions to admin`);
        }
      }
    }

    // Verify
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const sessionCount = await pool.query('SELECT COUNT(*) FROM sessions');
    const orphanCount = await pool.query('SELECT COUNT(*) FROM sessions WHERE user_id IS NULL');
    console.log(`\n📊 Final counts:`);
    console.log(`   Users: ${userCount.rows[0].count}`);
    console.log(`   Sessions: ${sessionCount.rows[0].count}`);
    console.log(`   Orphan sessions: ${orphanCount.rows[0].count}`);
    console.log('\n🎉 Migration complete!');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
