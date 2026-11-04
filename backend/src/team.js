import { randomBytes, randomUUID, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const publicUser = row => row && ({ id: row.id, name: row.name, email: row.email, role: row.role, active: Boolean(row.active) });
export function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, 'Mật khẩu cần từ 12 đến 128 ký tự.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function verify(password, hash) {
  const [salt, stored] = hash.split(':');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(Buffer.from(stored, 'hex'), actual);
}
const dummyHash = `00000000000000000000000000000000:${'00'.repeat(64)}`;
export const teamSchema = [
  `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES members(id), expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES members(id), body TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS comments_task ON comments(task_id)`,
  `CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES members(id), detail TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS activity_task ON activity(task_id)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start TEXT NOT NULL)`
];
const validId = id => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export function createTeam(adapter) {
  const taskSelect = adapter.postgres ? 'SELECT *, due_date::text AS date_text FROM tasks' : 'SELECT *, due_date AS date_text FROM tasks';
  const mapTask = row => row && ({ id: row.id, title: row.title, completed: Boolean(row.completed), createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at, priority: row.priority, dueDate: row.date_text, description: row.description, status: row.status, assigneeId: row.assignee_id, creatorId: row.creator_id, labels: JSON.parse(row.labels || '[]') });
  const getTask = async (db, id) => validId(id) ? mapTask(await db.one(`${taskSelect} WHERE id = ?`, [id])) : undefined;
  const log = (db, id, userId, detail) => db.run('INSERT INTO activity (id, task_id, user_id, detail, created_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), id, userId, detail, new Date().toISOString()]);
  async function actor(db, user) { const found = await db.one('SELECT * FROM members WHERE id = ?', [user.id]); if (!found?.active) fail(401, 'Phiên đăng nhập đã hết hạn.'); return found; }
  function editable(user, task) { if (user.role !== 'admin' && task.creatorId !== user.id && task.assigneeId !== user.id) fail(403, 'Chỉ quản trị viên, người tạo hoặc người phụ trách được sửa công việc.'); }
  function userFields(data) {
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 80) fail(400, 'Tên cần từ 1 đến 80 ký tự.');
    if (typeof data.email !== 'string' || data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) fail(400, 'Email không hợp lệ.');
    if (!['admin', 'member'].includes(data.role)) fail(400, 'Vai trò không hợp lệ.');
    return { name: data.name.trim(), email: data.email.trim().toLowerCase(), role: data.role };
  }
  return {
    async bootstrap(data) {
      const input = userFields({ ...data, role: 'admin' }); const hash = await hashPassword(data.password);
      return adapter.transaction(async db => {
        if (await db.one('SELECT id FROM members LIMIT 1')) fail(409, 'Đã có tài khoản. Hãy đăng nhập bằng tài khoản quản trị hiện có.');
        const id = randomUUID();
        await db.run('INSERT INTO members (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [id, input.name, input.email, hash, 'admin']);
        return publicUser(await db.one('SELECT * FROM members WHERE id = ?', [id]));
      });
    },
    async login(email, password, ip) {
      if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) fail(400, 'Thông tin đăng nhập không hợp lệ.');
      email = email.trim().toLowerCase();
      const now = new Date(); const threshold = new Date(now.getTime() - 15 * 60000).toISOString();
      const allowed = await adapter.transaction(async db => {
        await db.run('DELETE FROM login_attempts WHERE window_start < ?', [threshold]);
        await db.run('DELETE FROM sessions WHERE expires_at < ?', [now.toISOString()]);
        for (const [key, limit] of [[digest('email:' + email), 10], [digest('ip:' + ip), 100]]) {
          const record = await db.one('SELECT * FROM login_attempts WHERE key = ?', [key]);
          if (record && record.attempts >= limit) return false;
        }
        for (const key of [digest('email:' + email), digest('ip:' + ip)]) await db.run('INSERT INTO login_attempts (key, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET attempts = login_attempts.attempts + 1', [key, now.toISOString()]);
        return true;
      });
      if (!allowed) fail(429, 'Đã thử đăng nhập quá nhiều. Vui lòng chờ 15 phút.');
      const user = await adapter.one('SELECT * FROM members WHERE email = ?', [email]);
      const correct = await verify(password, user?.password_hash || dummyHash);
      if (!correct || !user?.active) fail(401, 'Email hoặc mật khẩu không đúng.');
      const token = randomBytes(32).toString('hex');
      await adapter.transaction(async db => {
        const current = await db.one('SELECT * FROM members WHERE id = ?', [user.id]);
        if (!current?.active || current.password_hash !== user.password_hash) fail(401, 'Thông tin đăng nhập đã thay đổi.');
        await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [digest(token), user.id, new Date(now.getTime() + 7 * 86400000).toISOString()]);
        await db.run('DELETE FROM login_attempts WHERE key = ?', [digest('email:' + email)]);
      });
      return { token, user: publicUser(user) };
    },
    async session(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      return publicUser(await adapter.one('SELECT m.* FROM members m JOIN sessions s ON s.user_id = m.id WHERE s.token_hash = ? AND s.expires_at > ? AND m.active = 1', [digest(token), new Date().toISOString()]));
    },
    logout: token => adapter.run('DELETE FROM sessions WHERE token_hash = ?', [digest(token || '')]),
    users: async () => (await adapter.all('SELECT * FROM members ORDER BY name, id')).map(publicUser),
    async createUser(user, data) {
      const input = userFields(data); const hash = await hashPassword(data.password);
      return adapter.transaction(async db => {
        if ((await actor(db, user)).role !== 'admin') fail(403, 'Chỉ quản trị viên được quản lý tài khoản.');
        if (await db.one('SELECT id FROM members WHERE email = ?', [input.email])) fail(409, 'Email đã được sử dụng.');
        const id = randomUUID(); await db.run('INSERT INTO members (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [id, input.name, input.email, hash, input.role]);
        return publicUser(await db.one('SELECT * FROM members WHERE id = ?', [id]));
      });
    },
    async updateUser(user, id, data) {
      if (!data || !Object.keys(data).length || Object.keys(data).some(k => !['role', 'active'].includes(k))) fail(400, 'Chỉ cập nhật vai trò hoặc trạng thái tài khoản.');
      if (data.role !== undefined && !['admin', 'member'].includes(data.role)) fail(400, 'Vai trò không hợp lệ.');
      if (data.active !== undefined && typeof data.active !== 'boolean') fail(400, 'Trạng thái không hợp lệ.');
      return adapter.transaction(async db => {
        if ((await actor(db, user)).role !== 'admin') fail(403, 'Chỉ quản trị viên được quản lý tài khoản.');
        const target = await db.one('SELECT * FROM members WHERE id = ?', [id]); if (!target) fail(404, 'Không tìm thấy thành viên.');
        const role = data.role ?? target.role, active = data.active === undefined ? target.active : Number(data.active);
        if (target.role === 'admin' && target.active && (role !== 'admin' || !active)) {
          const admins = await db.all("SELECT id FROM members WHERE role = 'admin' AND active = 1");
          if (admins.length <= 1) fail(409, 'Phải giữ ít nhất một quản trị viên đang hoạt động.');
        }
        await db.run('UPDATE members SET role = ?, active = ? WHERE id = ?', [role, active, id]);
        await db.run('DELETE FROM sessions WHERE user_id = ?', [id]);
        return publicUser(await db.one('SELECT * FROM members WHERE id = ?', [id]));
      });
    },
    async changePassword(user, oldPassword, password) {
      if (typeof oldPassword !== 'string' || oldPassword.length > 128) fail(400, 'Mật khẩu hiện tại không hợp lệ.');
      const hash = await hashPassword(password);
      const current = await adapter.one('SELECT * FROM members WHERE id = ?', [user.id]);
      if (!current || !await verify(oldPassword, current.password_hash)) fail(400, 'Mật khẩu hiện tại không đúng.');
      await adapter.transaction(async db => {
        const fresh = await actor(db, user);
        if (fresh.password_hash !== current.password_hash) fail(409, 'Mật khẩu đã thay đổi. Hãy đăng nhập lại.');
        await db.run('UPDATE members SET password_hash = ? WHERE id = ?', [hash, user.id]);
        await db.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
      });
    },
    list: async () => (await adapter.all(`${taskSelect} ORDER BY created_at DESC, id`)).map(mapTask),
    async save(user, id, data) {
      return adapter.transaction(async db => {
        const current = await actor(db, user);
        const old = id ? await getTask(db, id) : null;
        if (id && !old) fail(404, 'Không tìm thấy công việc.');
        if (old) editable(current, old);
        if ('assigneeId' in data && data.assigneeId && (!old || data.assigneeId !== old.assigneeId)) {
          const assignee = await db.one('SELECT id FROM members WHERE id = ? AND active = 1', [data.assigneeId]);
          if (!assignee) fail(400, 'Người phụ trách không tồn tại hoặc đã bị khóa.');
        }
        const task = { title: '', description: '', priority: 'medium', dueDate: null, status: 'todo', assigneeId: null, labels: [], ...old, ...data };
        if ('completed' in data && !('status' in data)) task.status = data.completed ? 'done' : 'todo';
        const completed = adapter.postgres ? task.status === 'done' : Number(task.status === 'done');
        const args = [task.title, task.description, task.priority, task.dueDate, task.status, completed, task.assigneeId, JSON.stringify(task.labels)];
        if (old) {
          await db.run('UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, status = ?, completed = ?, assignee_id = ?, labels = ? WHERE id = ?', [...args, id]);
          const names = { title: 'tên', description: 'mô tả', priority: 'ưu tiên', dueDate: 'hạn hoàn thành', status: 'trạng thái', completed: 'hoàn thành', assigneeId: 'người phụ trách', labels: 'nhãn' };
          await log(db, id, current.id, 'Cập nhật: ' + Object.keys(data).map(key => names[key]).join(', '));
        } else {
          id = randomUUID();
          await db.run('INSERT INTO tasks (title, description, priority, due_date, status, completed, assignee_id, labels, id, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [...args, id, current.id, new Date().toISOString()]);
          await log(db, id, current.id, 'Tạo công việc');
        }
        return getTask(db, id);
      });
    },
    async remove(user, id) {
      return adapter.transaction(async db => {
        const current = await actor(db, user), task = await getTask(db, id);
        if (!task) fail(404, 'Không tìm thấy công việc.');
        if (current.role !== 'admin' && task.creatorId !== current.id) fail(403, 'Chỉ quản trị viên hoặc người tạo được xóa công việc.');
        await db.run('DELETE FROM comments WHERE task_id = ?', [id]);
        await db.run('DELETE FROM activity WHERE task_id = ?', [id]);
        await db.run('DELETE FROM tasks WHERE id = ?', [id]);
      });
    },
    async detail(id) {
      const task = await getTask(adapter, id); if (!task) fail(404, 'Không tìm thấy công việc.');
      const comments = await adapter.all('SELECT c.*, m.name AS author FROM comments c JOIN members m ON m.id = c.user_id WHERE task_id = ? ORDER BY created_at, c.id', [id]);
      const activity = await adapter.all('SELECT a.*, m.name AS author FROM activity a JOIN members m ON m.id = a.user_id WHERE task_id = ? ORDER BY created_at DESC, a.id DESC LIMIT 100', [id]);
      return { task, comments, activity };
    },
    async comment(user, id, body) {
      if (typeof body !== 'string' || !body.trim() || body.trim().length > 2000) fail(400, 'Bình luận cần từ 1 đến 2000 ký tự.');
      return adapter.transaction(async db => {
        const current = await actor(db, user); if (!await getTask(db, id)) fail(404, 'Không tìm thấy công việc.');
        const commentId = randomUUID();
        await db.run('INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [commentId, id, current.id, body.trim(), new Date().toISOString()]);
        await log(db, id, current.id, 'Thêm bình luận');
        return db.one('SELECT c.*, m.name AS author FROM comments c JOIN members m ON m.id = c.user_id WHERE c.id = ?', [commentId]);
      });
    }
  };
}
