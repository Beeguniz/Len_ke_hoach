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
    const config = { connectionString, options: `-c search_path=${schema}` };
    for (let i = 0; i < 2; i++) {
      const store = await createPostgresStore(config);
      stores.push(store);
      const server = createApp(store).listen(0, '127.0.0.1');
      servers.push(server);
      await once(server, 'listening');
    }
    const urls = servers.map(s => `http://127.0.0.1:${s.address().port}`);
    const added = await fetch(urls[0] + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Shared task' }) });
    assert.equal(added.status, 201);
    const task = await added.json();
    assert.equal((await (await fetch(urls[1] + '/api/tasks')).json())[0].id, task.id);
    const updated = await fetch(urls[1] + '/api/tasks/' + task.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: true }) });
    assert.equal(updated.status, 200);
    assert.equal((await (await fetch(urls[0] + '/api/tasks')).json())[0].completed, true);
    const invalid = await fetch(urls[0] + '/api/tasks/missing', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"completed":true}' });
    assert.equal(invalid.status, 404);
    const reopened = await createPostgresStore(config);
    try { assert.equal((await reopened.list())[0].completed, true); } finally { await reopened.close(); }
  } finally {
    await Promise.all(servers.map(s => new Promise(resolve => s.close(resolve))));
    await Promise.all(stores.map(s => s.close()));
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
