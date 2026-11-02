import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
test('database outage fails readiness while process stays live', async () => {
  const server = createApp({ async ping() { throw new Error('Database unavailable'); } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url + '/health')).status, 503);
    assert.equal((await fetch(url + '/live')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
