import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { createPostgresStore } from './postgres-store.js';

const usePostgres = process.env.DB_DRIVER === 'postgres';
if (process.env.NODE_ENV === 'production' && !usePostgres) throw new Error('Production requires DB_DRIVER=postgres');
const store = usePostgres ? await createPostgresStore() : createStore(process.env.DB_PATH || fileURLToPath(new URL('../data/tasks.db', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = createApp(store).listen(port, host, () => console.log(`API: http://${host}:${port} (${usePostgres ? 'postgres' : 'sqlite'})`));
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(async () => { await store.close(); clearTimeout(timeout); process.exit(0); });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
