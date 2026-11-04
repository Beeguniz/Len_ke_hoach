import { authenticatedFetch } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

test('API validates input, creates and updates tasks, and persists after reopening', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'taskboard-'));
  const path = join(dir, 'test.db');
  const store = createStore(path);
  const server = createApp(store).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const fetch = await authenticatedFetch(store, url);
  const request = (route, method, body) => fetch(url + route, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  try {
    assert.equal((await (await fetch(url + '/health')).json()).status, 'ok');
    assert.equal((await request('/api/tasks', 'POST', { title: '   ' })).status, 400);
    assert.equal((await request('/api/tasks', 'POST', { title: 'a'.repeat(201) })).status, 400);
    const response = await request('/api/tasks', 'POST', { title: '  Demo Kubernetes  ' });
    assert.equal(response.status, 201);
    const task = await response.json();
    assert.equal(task.title, 'Demo Kubernetes');
    assert.equal(task.completed, false);
    assert.equal((await request(`/api/tasks/${task.id}`, 'PATCH', { completed: 'true' })).status, 400);
    assert.equal((await request('/api/tasks/missing', 'PATCH', { completed: true })).status, 404);
    assert.equal((await (await request(`/api/tasks/${task.id}`, 'PATCH', { completed: true })).json()).completed, true);
    assert.equal((await (await fetch(url + '/api/tasks')).json()).length, 1);
    for (const invalid of [{ dueDate: '2026-02-30' }, { dueDate: '' }, { priority: 'urgent' }, { title: ' ' }, {}]) {
      assert.equal((await request(`/api/tasks/${task.id}`, 'PATCH', invalid)).status, 400);
    }
    const edited = await (await request(`/api/tasks/${task.id}`, 'PATCH', { title: 'Updated', priority: 'high', dueDate: '2028-02-29' })).json();
    assert.equal(edited.completed, true);
    assert.equal(edited.title, 'Updated');
    assert.equal(edited.priority, 'high');
    assert.equal(edited.dueDate, '2028-02-29');
    assert.equal((await (await request(`/api/tasks/${task.id}`, 'PATCH', { dueDate: null })).json()).dueDate, null);
    const disposable = await (await request('/api/tasks', 'POST', { title: 'Delete me', dueDate: '2026-11-19', priority: 'low' })).json();
    assert.equal(disposable.priority, 'low');
    assert.equal((await request(`/api/tasks/${disposable.id}`, 'DELETE')).status, 204);
    assert.equal((await request(`/api/tasks/${disposable.id}`, 'DELETE')).status, 404);

    await new Promise(resolve => server.close(resolve));
    store.close();
    const reopened = createStore(path);
    try { assert.equal(reopened.get(task.id).completed, true); } finally { reopened.close(); }
  } finally {
    if (server.listening) { await new Promise(resolve => server.close(resolve)); store.close(); }
    rmSync(dir, { recursive: true, force: true });
  }
});
