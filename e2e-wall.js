const BASE = 'http://localhost:3000';
async function api(path, opts) {
  const r = await fetch(BASE + path, opts);
  const txt = await r.text();
  try { return { status: r.status, data: JSON.parse(txt) }; } catch { return { status: r.status, data: txt }; }
}
(async () => {
  const uname = 'wall_' + Date.now().toString(36).slice(-5);
  const reg = await api('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: uname, password: 'pass1234', fp: 'f', clientSessionId: 'cw1' }) });
  console.log('register:', reg.status, reg.data.success);
  const tok = reg.data.token;
  const H = { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' };

  const post = await api('/api/posts', { method: 'POST', headers: H, body: JSON.stringify({ msg: 'مرحبا هذا اختبار الحائط', mediaUrl: null, mediaType: null }) });
  console.log('POST /api/posts:', post.status, JSON.stringify(post.data).slice(0, 220));

  const list = await api('/api/posts');
  console.log('GET /api/posts:', list.status, 'count=', Array.isArray(list.data) ? list.data.length : '?', 'first.msg=', list.data[0] && list.data[0].msg);

  const like = await api('/api/posts/' + post.data.id + '/like', { method: 'POST', headers: H });
  console.log('like:', like.status, JSON.stringify(like.data));

  const comment = await api('/api/posts/' + post.data.id + '/comments', { method: 'POST', headers: H, body: JSON.stringify({ msg: 'تعليق تجريبي' }) });
  console.log('comment:', comment.status, JSON.stringify(comment.data).slice(0, 120));

  // settings save with avatar-ish fields
  const sett = await api('/api/users/settings', { method: 'POST', headers: H, body: JSON.stringify({ msg: 'وضعي الجديد', profileCountry: 'sa', allowPrivate: true }) });
  console.log('settings:', sett.status, 'msg=', sett.data.user && sett.data.user.msg, 'co=', sett.data.user && sett.data.user.co);

  // multipart upload
  const fd = new FormData();
  fd.append('file', new Blob(['fake-image-bytes'], { type: 'image/png' }), 'test.png');
  const up = await fetch(BASE + '/api/upload/avatar', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok }, body: fd });
  const upj = await up.json();
  console.log('upload/avatar:', up.status, JSON.stringify(upj));
})().catch(e => { console.error('FATAL', e); process.exit(1); });