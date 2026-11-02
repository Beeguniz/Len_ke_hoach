import express from 'express';
import { hostname } from 'node:os';

export function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/live', (req, res) => res.json({ status: 'ok' }));
  app.get(['/health', '/api/health'], async (req, res) => {
    try { await store.ping(); }
    catch { return res.status(503).json({ status: 'unavailable' }); }
    res.json({ status: 'ok', version: process.env.APP_VERSION || 'v1', hostname: hostname() });
  });
  app.get('/api/tasks', async (req, res) => res.json(await store.list()));
  app.post('/api/tasks', async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 200) return res.status(400).json({ error: 'Tên công việc phải có từ 1 đến 200 ký tự.' });
    res.status(201).json(await store.add(title));
  });
  app.patch('/api/tasks/:id', async (req, res) => {
    if (typeof req.body?.completed !== 'boolean') return res.status(400).json({ error: 'completed phải là boolean.' });
    const task = await store.update(req.params.id, req.body.completed);
    if (!task) return res.status(404).json({ error: 'Không tìm thấy công việc.' });
    res.json(task);
  });
  app.use((req, res) => res.status(404).json({ error: 'Endpoint không tồn tại.' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu gửi quá lớn.' });
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
  });
  return app;
}
