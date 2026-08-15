/* ══════════════════════════════════════════════════════════════
   PUBLIC ONLINE USERS — restored from deobfuscated_source/
   public-online-users.js.deobfuscated.js (legacy feature).
   Polls the (formerly missing) public REST endpoint so the landing
   page shows who is online BEFORE the visitor logs in.
   ══════════════════════════════════════════════════════════════ */
const POLL_MS = 12000;

let pollTimer = null;
let isFetching = false;
let isStopped = false;

function currentUserSession() {
  return sessionStorage.getItem('token') || (window.state && window.state.currentUser);
}

function render(users) {
  var listEl = document.getElementById('landing-users-list');
  var countEl = document.getElementById('landing-users-count');
  if (!listEl) return;
  if (!Array.isArray(users)) users = [];
  if (countEl) countEl.innerHTML = '<i class="fas fa-user-friends"></i> ' + users.length;
  if (users.length === 0) {
    listEl.innerHTML = '<div class="text-center text-muted p-4 small" id="empty-public-users-msg">لا يوجد متواجدون حالياً</div>';
    return;
  }
  listEl.innerHTML = '';
  users.forEach(function (user) {
    var pic = user.pic && user.pic !== 'pic.png' ? user.pic : (window.domainConfig && window.domainConfig.defaultAvatarUrl) || '/uploads/site/defaultAvatar-1783610496476-957604529.jpeg';
    var div = document.createElement('div');
    div.className = 'list-group-item list-group-item-action py-1 px-2 d-flex align-items-center gap-2 ' + (user.isGhost ? 'ghost-user' : '');
    div.setAttribute('data-username', user.topic || user.username || '');
    div.setAttribute('data-user-id', user.id || '');
    var avatar = document.createElement('img');
    avatar.src = pic;
    avatar.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0;';
    avatar.setAttribute('referrerPolicy', 'origin-when-cross-origin');
    var wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;flex-direction:column;line-height:1.2;';
    var name = document.createElement('span');
    name.className = 'fw-bold small';
    name.style.color = user.ucol || '#000000';
    name.textContent = user.topic || user.username || 'مستخدم';
    wrap.appendChild(name);
    var status = document.createElement('small');
    status.className = 'text-muted';
    status.textContent = user.msg || (user.isGhost ? 'مختفي' : 'متصل الآن');
    wrap.appendChild(status);
    div.appendChild(avatar);
    div.appendChild(wrap);
    div.addEventListener('click', function () {
      if (window.showProfile) window.showProfile(user.topic || user.username);
    });
    listEl.appendChild(div);
  });
}

export function loadPublicOnlineUsers() {
  if (isStopped) return;
  if (currentUserSession()) { stopPublicOnlineUsersPolling(); return; }
  if (isFetching) return;
  isFetching = true;
  fetch('/api/public/online-users', { headers: { 'Cache-Control': 'no-cache' } })
    .then(function (res) { if (!res.ok) throw new Error('Network response error'); return res.json(); })
    .then(function (data) {
      isFetching = false;
      if (isStopped) return;
      render(data);
    })
    .catch(function (err) {
      console.warn('[PublicOnlineUsers] Fetch error:', err);
      isFetching = false;
    });
}

export function startPublicOnlineUsersPolling() {
  isStopped = false;
  isFetching = false;
  if (currentUserSession()) return;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  loadPublicOnlineUsers();
  pollTimer = setInterval(function () {
    if (currentUserSession()) { stopPublicOnlineUsersPolling(); return; }
    loadPublicOnlineUsers();
  }, POLL_MS);
}

export function stopPublicOnlineUsersPolling() {
  isStopped = true;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export function initPublicOnlineUsers() {
  document.addEventListener('DOMContentLoaded', function () { startPublicOnlineUsersPolling(); });
  if (document.readyState !== 'loading') startPublicOnlineUsersPolling();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !currentUserSession()) loadPublicOnlineUsers();
  });
}