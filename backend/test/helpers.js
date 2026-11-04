export async function authenticatedFetch(store, base, email = 'admin@example.test') {
  await store.team.bootstrap({ name: 'Admin', email, password: 'test-password-2026' });
  const response = await globalThis.fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Taskboard-Request': '1' }, body: JSON.stringify({ email, password: 'test-password-2026' }) });
  if (!response.ok) throw new Error('Test login failed: ' + await response.text());
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return (url, options = {}) => globalThis.fetch(url, { ...options, headers: { ...options.headers, Cookie: cookie, 'X-Taskboard-Request': '1' } });
}
