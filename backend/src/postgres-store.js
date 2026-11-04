import { createTeam, teamSchema } from './team.js';
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
    await client.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'");
    await client.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE');
    for (const [name, type] of Object.entries({ description: "TEXT NOT NULL DEFAULT ''", status: 'TEXT', assignee_id: 'TEXT', creator_id: 'TEXT', labels: "TEXT NOT NULL DEFAULT '[]'" })) {
      await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    }
    await client.query("UPDATE tasks SET status = CASE WHEN completed THEN 'done' ELSE 'todo' END WHERE status IS NULL");
    for (const sql of teamSchema) await client.query(sql);
    await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) { await pool.end(); throw err; }
  const access = client => {
    const query = (sql, args = []) => { let index = 0; return client.query(sql.replace(/\?/g, () => '$' + (++index)), args); };
    return {
      postgres: true,
      all: async (...args) => (await query(...args)).rows,
      one: async (...args) => (await query(...args)).rows[0],
      run: (...args) => query(...args)
    };
  };
  const adapter = access(pool);
  adapter.transaction = async fn => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(20261028)');
      const result = await fn(access(client));
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
  const map = row => row && ({ id: row.id, title: row.title,
    completed: row.completed, createdAt: row.created_at.toISOString(), priority: row.priority, dueDate: row.due_date_text ?? null });
  return {
    team: createTeam(adapter),
    async list() { return (await pool.query('SELECT *, due_date::text AS due_date_text FROM tasks ORDER BY created_at DESC, id')).rows.map(map); },
    async add(title, { priority = 'medium', dueDate = null } = {}) {
      return map((await pool.query('INSERT INTO tasks (id, title, priority, due_date) VALUES ($1, $2, $3, $4) RETURNING *, due_date::text AS due_date_text', [randomUUID(), title, priority, dueDate])).rows[0]);
    },
    async update(id, changes) {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return undefined;
      const columns = { title: 'title', completed: 'completed', priority: 'priority', dueDate: 'due_date' };
      const keys = Object.keys(changes).filter(key => key in columns);
      return map((await pool.query(`UPDATE tasks SET ${keys.map((key, i) => columns[key] + ' = $' + (i + 1)).join(', ')} WHERE id = $${keys.length + 1} RETURNING *, due_date::text AS due_date_text`, [...keys.map(key => changes[key]), id])).rows[0]);
    },
    async remove(id) {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return false;
      return (await pool.query('DELETE FROM tasks WHERE id = $1', [id])).rowCount > 0;
    },
    ping: () => pool.query('SELECT 1'),
    close: () => pool.end()
  };
}
