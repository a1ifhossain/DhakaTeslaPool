export default async function api(url, opts = {}) {
  const token = sessionStorage.getItem('token');
  const r = await fetch('/api' + url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(data.error || 'Request failed.');
  return data;
}
