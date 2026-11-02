import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

async function api(path, options) {
  const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không thể kết nối máy chủ.');
  return data;
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [health, setHealth] = useState(null);
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { const [items, status] = await Promise.all([api('/tasks'), api('/health')]); setTasks(items); setHealth(status); }
    catch { setHealth(null); setError('Không tải được dữ liệu. Kiểm tra backend rồi thử lại.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function add(event) {
    event.preventDefault(); if (!title.trim() || busy) return;
    setBusy(true); setError('');
    try { const task = await api('/tasks', { method: 'POST', body: JSON.stringify({ title }) }); setTasks(items => [task, ...items]); setTitle(''); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function toggle(task) {
    setBusy(true); setError('');
    try { const updated = await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !task.completed }) }); setTasks(items => items.map(item => item.id === task.id ? updated : item)); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const completed = tasks.filter(task => task.completed).length;
  const visible = tasks.filter(task => filter === 'all' || (filter === 'done' ? task.completed : !task.completed));
  return <div className="layout">
    <aside><a className="brand" href="/">◈ <span>taskboard</span></a><div className="workspace">KHÔNG GIAN LÀM VIỆC</div><div className="nav-item">▦ <span>Công việc của nhóm</span></div><div className="aside-bottom"><span className="avatar">05</span><div>Nhóm giữa kỳ<small>CKA · 2026</small></div></div></aside>
    <main><header><span>Workspace / <strong>Công việc</strong></span><span className="version">{import.meta.env.VITE_APP_VERSION || 'v1'}</span></header>
      <section className="intro"><p className="eyebrow">CÙNG NHAU HOÀN THÀNH</p><h1>Việc nhỏ hôm nay.<br />Tiến bộ mỗi ngày.</h1><p>Theo dõi công việc của nhóm, từ ý tưởng đến hoàn thành.</p></section>
      <section className="stats" aria-label="Thống kê"><div><span>Tổng công việc</span><strong>{tasks.length.toString().padStart(2, '0')}</strong></div><div><span>Đang thực hiện</span><strong>{(tasks.length - completed).toString().padStart(2, '0')}</strong></div><div><span>Đã hoàn thành</span><strong className="green">{completed.toString().padStart(2, '0')}</strong></div></section>
      <section className="board"><div className="board-heading"><h2>Danh sách công việc</h2><button className="refresh" onClick={load} disabled={loading || busy}>↻ Làm mới</button></div>
        <form onSubmit={add}><label className="sr-only" htmlFor="task-title">Tên công việc</label><input id="task-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Nhóm mình cần làm gì tiếp theo?" required disabled={loading || busy} /><button className="add" disabled={loading || busy || !title.trim()}>+ Thêm công việc</button></form>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="filters">{[['all','Tất cả'],['active','Đang làm'],['done','Hoàn thành']].map(([id,label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>
        {loading ? <div className="empty" role="status">Đang tải công việc…</div> : visible.length ? <ul>{visible.map(task => <li key={task.id}><input type="checkbox" aria-label={`Hoàn thành: ${task.title}`} checked={task.completed} disabled={busy} onChange={() => toggle(task)} /><div><span className={task.completed ? 'done' : ''}>{task.title}</span><small>{new Date(task.createdAt).toLocaleDateString('vi-VN')}</small></div><span className={`badge ${task.completed ? 'finished' : ''}`}>{task.completed ? 'Hoàn thành' : 'Đang làm'}</span></li>)}</ul> : <div className="empty"><span className="empty-icon">✓</span><h3>{error ? 'Dữ liệu chưa sẵn sàng' : filter === 'all' ? 'Bắt đầu với một công việc nhỏ' : 'Chưa có công việc trong mục này'}</h3><p>{error ? 'Nhấn Làm mới để kết nối lại.' : 'Thêm công việc ở trên và cùng nhóm hoàn thành nhé.'}</p></div>}
      </section><footer><span className={health ? 'connected' : ''}>● {health ? 'Đã kết nối backend' : 'Chưa kết nối backend'}</span><span>CKA 2026 · Project giữa kỳ</span></footer>
    </main></div>;
}

createRoot(document.getElementById('root')).render(<App />);
