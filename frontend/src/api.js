export async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Taskboard-Request': '1', ...options.headers }
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('session-expired'));
    const error = new Error(data?.error || 'Không thể kết nối máy chủ.'); error.status = response.status; throw error;
  }
  return data;
}
export const json = (method, data) => ({ method, body: JSON.stringify(data) });
export const statuses = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Hoàn thành' };
export const priorities = { high: 'Cao', medium: 'Vừa', low: 'Thấp' };
export function today() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
export const overdue = (task, date) => task.status !== 'done' && task.dueDate && task.dueDate < date;
export const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
export const formatDate = date => date ? date.split('-').reverse().join('/') : 'Chưa đặt hạn';
