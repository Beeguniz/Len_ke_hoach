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
  const map = row => row && ({ id: row.id, title: row.title,
    completed: Boolean(row.completed), createdAt: row.created_at });
  return {
    list: () => db.prepare('SELECT * FROM tasks ORDER BY created_at DESC, id').all().map(map),
    get: id => map(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)),
    add(title) {
      const id = randomUUID();
      db.prepare('INSERT INTO tasks (id, title, created_at) VALUES (?, ?, ?)')
        .run(id, title, new Date().toISOString());
      return this.get(id);
    },
    update(id, completed) {
      db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(Number(completed), id);
      return this.get(id);
    },
    ping: () => db.prepare('SELECT 1').get(),
    close: () => db.close()
  };
}
