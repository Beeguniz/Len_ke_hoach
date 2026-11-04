import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { createPostgresStore } from '../src/postgres-store.js';

for (const driver of ['sqlite', 'postgres']) test(`${driver}: authentication, permissions, collaboration and session revocation`, { skip: driver === 'postgres' && !process.env.TEST_DATABASE_URL }, async () => {
  let adminDb, schema, store, server;
  try {
    if (driver === 'postgres') {
      adminDb = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await adminDb.connect();
      schema = 'team_' + randomUUID().replaceAll('-', ''); await adminDb.query(`CREATE SCHEMA ${schema}`);
      store = await createPostgresStore({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    } else store = createStore(':memory:');
    const admin = await store.team.bootstrap({ name: 'Admin', email: 'ADMIN@example.test', password: 'Admin-password-2026' });
    await assert.rejects(store.team.bootstrap({ name: 'Other', email: 'other@example.test', password: 'Other-password-2026' }), error => error.status === 409);
    server = createApp(store).listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = (path, method = 'GET', body, cookie = '', csrf = true) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(csrf ? { 'X-Taskboard-Request': '1' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    async function login(email, password) { const response = await request('/auth/login', 'POST', { email, password }); assert.equal(response.status, 200); const text = response.headers.get('set-cookie'); assert.match(text, /HttpOnly/); assert.match(text, /SameSite=Lax/); assert.ok(!(await response.json()).password_hash); return text.split(';')[0]; }
    assert.equal((await request('/tasks')).status, 401);
    assert.equal((await request('/tasks', 'POST', { title: 'No access' })).status, 401);
    assert.equal((await request('/auth/login', 'POST', { email: 'admin@example.test', password: 'bad' })).status, 401);
    const adminCookie = await login('admin@example.test', 'Admin-password-2026');
    assert.equal((await request('/tasks', 'POST', { title: 'CSRF' }, adminCookie, false)).status, 403);
    async function member(name) { const response = await request('/users', 'POST', { name, email: name + '@example.test', password: 'Member-password-2026', role: 'member' }, adminCookie); assert.equal(response.status, 201); return response.json(); }
    const alice = await member('Alice'), bob = await member('Bob');
    assert.equal((await request('/users', 'POST', { name: 'Again', email: 'alice@example.test', password: 'Member-password-2026', role: 'member' }, adminCookie)).status, 409);
    const aliceCookie = await login('alice@example.test', 'Member-password-2026'), bobCookie = await login('bob@example.test', 'Member-password-2026');
    assert.equal((await request('/users', 'POST', { name: 'Illegal' }, aliceCookie)).status, 403);
    assert.equal((await request('/users/' + bob.id, 'PATCH', { role: 'admin' }, aliceCookie)).status, 403);
    assert.equal((await request('/users/' + admin.id, 'PATCH', { active: false }, adminCookie)).status, 409);
    const created = await request('/tasks', 'POST', { title: 'Group task', description: 'Detailed notes', labels: ['UI', 'Demo'], assigneeId: alice.id, status: 'doing' }, adminCookie);
    assert.equal(created.status, 201); const task = await created.json(); assert.equal(task.creatorId, admin.id); assert.equal(task.completed, false);
    assert.equal((await request('/tasks/' + task.id, 'PATCH', { title: 'Cannot edit' }, bobCookie)).status, 403);
    assert.equal((await request('/tasks/' + task.id, 'DELETE', undefined, aliceCookie)).status, 403);
    const edited = await request('/tasks/' + task.id, 'PATCH', { status: 'done' }, aliceCookie); assert.equal(edited.status, 200); assert.equal((await edited.json()).completed, true);
    assert.equal((await request('/tasks/' + task.id, 'PATCH', { assigneeId: randomUUID() }, adminCookie)).status, 400);
    assert.equal((await request('/tasks/' + task.id, 'PATCH', { status: 'done', completed: false }, adminCookie)).status, 400);
    assert.equal((await request('/tasks/' + task.id, 'PATCH', { labels: ['x'.repeat(31)] }, adminCookie)).status, 400);
    assert.equal((await request('/tasks/' + task.id + '/comments', 'POST', { body: 'Team feedback' }, bobCookie)).status, 201);
    const detail = await (await request('/tasks/' + task.id, 'GET', undefined, aliceCookie)).json();
    assert.equal(detail.comments[0].author, 'Bob'); assert.equal(detail.comments[0].body, 'Team feedback'); assert.equal(detail.activity.length, 3); assert.equal(detail.task.description, 'Detailed notes');
    assert.equal((await request('/users/' + bob.id, 'PATCH', { active: false }, adminCookie)).status, 200);
    assert.equal((await request('/tasks', 'GET', undefined, bobCookie)).status, 401);
    assert.equal((await request('/auth/login', 'POST', { email: 'bob@example.test', password: 'Member-password-2026' })).status, 401);
    assert.equal((await request('/auth/password', 'POST', { currentPassword: 'wrong', password: 'New-password-2026' }, aliceCookie)).status, 400);
    assert.equal((await request('/auth/password', 'POST', { currentPassword: 'Member-password-2026', password: 'New-password-2026' }, aliceCookie)).status, 204);
    assert.equal((await request('/tasks', 'GET', undefined, aliceCookie)).status, 401);
    const newCookie = await login('alice@example.test', 'New-password-2026');
    const own = await (await request('/tasks', 'POST', { title: 'My task' }, newCookie)).json();
    assert.equal((await request('/tasks/' + own.id, 'DELETE', undefined, newCookie)).status, 204);
    assert.equal((await request('/auth/logout', 'POST', undefined, newCookie)).status, 204);
    assert.equal((await request('/auth/me', 'GET', undefined, newCookie)).status, 401);
    assert.equal((await request('/tasks/' + task.id, 'DELETE', undefined, adminCookie)).status, 204);
    assert.equal((await request('/tasks/' + task.id, 'GET', undefined, adminCookie)).status, 404);
    for (let i = 0; i < 10; i++) assert.equal((await request('/auth/login', 'POST', { email: 'nobody@example.test', password: 'bad' })).status, 401);
    assert.equal((await request('/auth/login', 'POST', { email: 'nobody@example.test', password: 'bad' })).status, 429);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (store) await store.close();
    if (adminDb) { if (schema) await adminDb.query(`DROP SCHEMA ${schema} CASCADE`); await adminDb.end(); }
  }
});
