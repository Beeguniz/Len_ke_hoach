import { authenticatedFetch } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPostgresStore } from '../src/postgres-store.js';
import { createApp } from '../src/app.js';

test('two API replicas share PostgreSQL data and survive reconnect', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const stores = [], servers = [];
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE TABLE ${schema}.tasks (id UUID PRIMARY KEY, title VARCHAR(200) NOT NULL, completed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const legacyId = randomUUID();
    await admin.query(`INSERT INTO ${schema}.tasks (id, title, completed) VALUES ($1, $2, TRUE)`, [legacyId, 'Legacy task']);
    const config = { connectionString, options: `-c search_path=${schema}` };
    for (let i = 0; i < 2; i++) {
      const store = await createPostgresStore(config);
      stores.push(store);
      const server = createApp(store).listen(0, '127.0.0.1');
      servers.push(server);
      await once(server, 'listening');
    }
    const legacy = (await stores[0].list())[0];
    assert.equal(legacy.id, legacyId);
    assert.equal(legacy.completed, true);
    assert.equal(legacy.priority, 'medium');
    assert.equal(legacy.dueDate, null);
    await stores[0].remove(legacyId);
    const urls = servers.map(s => `http://127.0.0.1:${s.address().port}`);
    const fetch = await authenticatedFetch(stores[0], urls[0]);
    const added = await fetch(urls[0] + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Shared task' }) });
    assert.equal(added.status, 201);
    const task = await added.json();
    assert.equal((await (await fetch(urls[1] + '/api/tasks')).json())[0].id, task.id);
    const updated = await fetch(urls[1] + '/api/tasks/' + task.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: true, priority: 'high', dueDate: '2028-02-29', title: 'Edited shared task' }) });
    assert.equal(updated.status, 200);
    const edited = await updated.json();
    assert.equal(edited.dueDate, '2028-02-29');
    assert.equal(edited.priority, 'high');
    assert.equal(edited.title, 'Edited shared task');
    assert.equal((await (await fetch(urls[0] + '/api/tasks')).json())[0].completed, true);
    const invalid = await fetch(urls[0] + '/api/tasks/missing', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"completed":true}' });
    assert.equal(invalid.status, 404);
    const reopened = await createPostgresStore(config);
    try {
      assert.equal((await reopened.list())[0].completed, true);
      assert.equal((await reopened.list())[0].dueDate, '2028-02-29');
      assert.equal((await fetch(urls[1] + '/api/tasks/' + task.id, { method: 'DELETE' })).status, 204);
      assert.equal((await reopened.list()).length, 0);
    } finally { await reopened.close(); }
  } finally {
    await Promise.all(servers.map(s => new Promise(resolve => s.close(resolve))));
    await Promise.all(stores.map(s => s.close()));
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
