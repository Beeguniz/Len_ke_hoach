import pg from 'pg';
import { randomUUID } from 'node:crypto';

export async function createPostgresStore(config) {
  const pool = new pg.Pool({ ...config, max: 5, connectionTimeoutMillis: 5000 });
  pool.on('error', err => console.error('PostgreSQL connection error:', err.message));
  try {
    const client = await pool.connect();
    try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(20261028)');
    await client.query(`CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY, title VARCHAR(200) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) { await pool.end(); throw err; }
  const map = row => row && ({ id: row.id, title: row.title,
    completed: row.completed, createdAt: row.created_at.toISOString() });
  return {
    async list() { return (await pool.query('SELECT * FROM tasks ORDER BY created_at DESC, id')).rows.map(map); },
    async add(title) {
      return map((await pool.query('INSERT INTO tasks (id, title) VALUES ($1, $2) RETURNING *', [randomUUID(), title])).rows[0]);
    },
    async update(id, completed) {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return undefined;
      return map((await pool.query('UPDATE tasks SET completed = $1 WHERE id = $2 RETURNING *', [completed, id])).rows[0]);
    },
    ping: () => pool.query('SELECT 1'),
    close: () => pool.end()
  };
}
