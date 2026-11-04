import { createTeam, teamSchema } from './team.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  )`);
  const columns = db.prepare('PRAGMA table_info(tasks)').all().map(row => row.name);
  if (!columns.includes('priority')) db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
  if (!columns.includes('due_date')) db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
  for (const [name, type] of Object.entries({ description: "TEXT NOT NULL DEFAULT ''", status: 'TEXT', assignee_id: 'TEXT', creator_id: 'TEXT', labels: "TEXT NOT NULL DEFAULT '[]'" })) {
    if (!columns.includes(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`);
  }
  db.exec("UPDATE tasks SET status = CASE WHEN completed = 1 THEN 'done' ELSE 'todo' END WHERE status IS NULL");
  for (const sql of teamSchema) db.exec(sql);
  const raw = {
    all: async (sql, args = []) => db.prepare(sql).all(...args),
    one: async (sql, args = []) => db.prepare(sql).get(...args),
    run: async (sql, args = []) => db.prepare(sql).run(...args)
  };
  let pending = Promise.resolve();
  const serial = fn => { const result = pending.then(fn); pending = result.catch(() => {}); return result; };
  const adapter = Object.fromEntries(Object.keys(raw).map(key => [key, (...args) => serial(() => raw[key](...args))]));
  adapter.transaction = fn => serial(async () => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = await fn(raw); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  const map = row => row && ({ id: row.id, title: row.title,
    completed: Boolean(row.completed), createdAt: row.created_at, priority: row.priority, dueDate: row.due_date });
  return {
    team: createTeam(adapter),
    list: () => db.prepare('SELECT * FROM tasks ORDER BY created_at DESC, id').all().map(map),
    get: id => map(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)),
    add(title, { priority = 'medium', dueDate = null } = {}) {
      const id = randomUUID();
      db.prepare('INSERT INTO tasks (id, title, created_at, priority, due_date) VALUES (?, ?, ?, ?, ?)')
        .run(id, title, new Date().toISOString(), priority, dueDate);
      return this.get(id);
    },
    update(id, changes) {
      const columns = { title: 'title', completed: 'completed', priority: 'priority', dueDate: 'due_date' };
      const keys = Object.keys(changes).filter(key => key in columns);
      if (keys.length) db.prepare(`UPDATE tasks SET ${keys.map(key => columns[key] + ' = ?').join(', ')} WHERE id = ?`)
        .run(...keys.map(key => key === 'completed' ? Number(changes[key]) : changes[key]), id);
      return this.get(id);
    },
    remove: id => db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0,
    ping: () => db.prepare('SELECT 1').get(),
    close: () => db.close()
  };
}
