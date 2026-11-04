import { fail } from './team.js';
import express from 'express';
import { hostname } from 'node:os';

export function createApp(store, { secureCookies = process.env.SESSION_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/live', (req, res) => res.json({ status: 'ok' }));
  app.get(['/health', '/api/health'], async (req, res) => {
    try { await store.ping(); }
    catch { return res.status(503).json({ status: 'unavailable' }); }
    res.json({ status: 'ok', version: process.env.APP_VERSION || 'v2', hostname: hostname() });
  });
  const cookieOptions = { httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/api' };
  const token = req => (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('taskboard_session='))?.slice('taskboard_session='.length);
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Taskboard-Request') !== '1') return res.status(403).json({ error: 'Yêu cầu không hợp lệ. Hãy tải lại trang.' });
    next();
  });
  app.post('/api/auth/login', async (req, res) => {
    const result = await store.team.login(req.body?.email, req.body?.password, req.ip);
    res.cookie('taskboard_session', result.token, { ...cookieOptions, maxAge: 7 * 86400000 }).json(result.user);
  });
  app.use('/api', async (req, res, next) => {
    req.user = await store.team.session(token(req));
    if (!req.user) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
    next();
  });
  app.get('/api/auth/me', (req, res) => res.json(req.user));
  app.post('/api/auth/logout', async (req, res) => {
    await store.team.logout(token(req)); res.clearCookie('taskboard_session', cookieOptions).status(204).end();
  });
  app.post('/api/auth/password', async (req, res) => {
    await store.team.changePassword(req.user, req.body?.currentPassword, req.body?.password);
    res.clearCookie('taskboard_session', cookieOptions).status(204).end();
  });
  app.get('/api/users', async (req, res) => res.json(await store.team.users()));
  app.post('/api/users', async (req, res) => {
    if (req.user.role !== 'admin') fail(403, 'Chỉ quản trị viên được quản lý tài khoản.');
    res.status(201).json(await store.team.createUser(req.user, req.body || {}));
  });
  app.patch('/api/users/:id', async (req, res) => res.json(await store.team.updateUser(req.user, req.params.id, req.body || {})));
  app.get('/api/tasks', async (req, res) => res.json(await store.team.list()));
  app.get('/api/tasks/:id', async (req, res) => res.json(await store.team.detail(req.params.id)));
  app.post('/api/tasks/:id/comments', async (req, res) => res.status(201).json(await store.team.comment(req.user, req.params.id, req.body?.body)));

  function fields(body, partial = false) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Dữ liệu không hợp lệ.');
    const result = {};
    if (!partial || 'title' in body) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) throw new Error('Tên công việc phải có từ 1 đến 200 ký tự.');
      result.title = body.title.trim();
    }
    if ('completed' in body) {
      if (typeof body.completed !== 'boolean') throw new Error('completed phải là boolean.');
      result.completed = body.completed;
    }
    if ('priority' in body) {
      if (!['low', 'medium', 'high'].includes(body.priority)) throw new Error('Mức ưu tiên không hợp lệ.');
      result.priority = body.priority;
    }
    if ('dueDate' in body) {
      const date = body.dueDate;
      if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01' || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Hạn hoàn thành phải là ngày hợp lệ (YYYY-MM-DD).');
      result.dueDate = date;
    }
    if ('description' in body) {
      if (typeof body.description !== 'string' || body.description.length > 5000) throw new Error('Mô tả tối đa 5000 ký tự.');
      result.description = body.description.trim();
    }
    if ('status' in body) {
      if (!['todo', 'doing', 'done'].includes(body.status)) throw new Error('Trạng thái không hợp lệ.');
      if ('completed' in body && body.completed !== (body.status === 'done')) throw new Error('Trạng thái không khớp completed.');
      result.status = body.status;
    }
    if ('assigneeId' in body) {
      if (body.assigneeId !== null && (typeof body.assigneeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.assigneeId))) throw new Error('Người phụ trách không hợp lệ.');
      result.assigneeId = body.assigneeId;
    }
    if ('labels' in body) {
      if (!Array.isArray(body.labels) || body.labels.length > 5 || body.labels.some(label => typeof label !== 'string' || !label.trim() || label.trim().length > 30)) throw new Error('Tối đa 5 nhãn, mỗi nhãn 1–30 ký tự.');
      result.labels = [...new Set(body.labels.map(label => label.trim()))];
    }
    if (partial && !Object.keys(result).length) throw new Error('Chưa có nội dung cần cập nhật.');
    return result;
  }
  app.post('/api/tasks', async (req, res) => {
    let data;
    try { data = fields(req.body); } catch (err) { return res.status(400).json({ error: err.message }); }
    res.status(201).json(await store.team.save(req.user, null, data));
  });
  app.patch('/api/tasks/:id', async (req, res) => {
    let data;
    try { data = fields(req.body, true); } catch (err) { return res.status(400).json({ error: err.message }); }
    const task = await store.team.save(req.user, req.params.id, data);
    if (!task) return res.status(404).json({ error: 'Không tìm thấy công việc.' });
    res.json(task);
  });
  app.delete('/api/tasks/:id', async (req, res) => {
    await store.team.remove(req.user, req.params.id);
    res.status(204).end();
  });
  app.use((req, res) => res.status(404).json({ error: 'Endpoint không tồn tại.' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu gửi quá lớn.' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
  });
  return app;
}
