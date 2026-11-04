import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createPostgresStore } from './postgres-store.js';
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: true });
let store;
try {
  const name = await rl.question('Tên quản trị viên: ');
  const email = await rl.question('Email: ');
  process.stdout.write('Mật khẩu (12–128 ký tự, không hiển thị): '); muted = true;
  const password = await rl.question(''); muted = false; process.stdout.write('\n');
  store = process.env.DB_DRIVER === 'postgres' ? await createPostgresStore() : createStore(process.env.DB_PATH || fileURLToPath(new URL('../data/tasks.db', import.meta.url)));
  await store.team.bootstrap({ name, email, password });
  console.log('Đã tạo quản trị viên. Có thể đăng nhập ứng dụng.');
} catch (error) { muted = false; console.error('\n' + error.message); process.exitCode = 1; }
finally { rl.close(); if (store) await store.close(); }
