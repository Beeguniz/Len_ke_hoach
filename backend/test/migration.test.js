import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';

test('v1 SQLite data survives v2 migration and reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taskboard-migration-'));
  const path = join(dir, 'old.db');
  try {
    const old = new DatabaseSync(path);
    old.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)");
    old.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?)').run('legacy', 'Old task', 1, new Date().toISOString());
    old.close();
    const store = createStore(path);
    try {
      assert.equal(store.get('legacy').completed, true);
      assert.equal(store.get('legacy').priority, 'medium');
      assert.equal(store.get('legacy').dueDate, null);
      store.update('legacy', { priority: 'high', dueDate: '2026-11-19' });
    } finally { store.close(); }
    const reopened = createStore(path);
    try { assert.equal(reopened.get('legacy').dueDate, '2026-11-19'); } finally { reopened.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
