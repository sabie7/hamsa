import { emit } from './ctx.js';
import { showToast } from './ui.js';
import { defaultAvatar } from './rendering.js';

export function profileTargetName() {
  var modal = document.getElementById('userProfileModal');
  return modal ? modal.getAttribute('data-username') : null;
}

export function openProfileModal(data) {
  var modal = document.getElementById('userProfileModal');
  if (!modal) return;
  if (data && data.name) {
    modal.setAttribute('data-user-id', data.name);
    modal.setAttribute('data-username', data.name);
  }
  updateProfileModal(data || {});
  var bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}

export function updateProfileModal(user) {
  var avatar = document.getElementById('profile-avatar-modal');
  var avatarHeader = document.getElementById('profile-avatar-header');
  var topic = document.getElementById('profile-header-topic');
  var msg = document.getElementById('profile-msg');
  var rep = document.getElementById('profile-rep-count');
  var points = document.getElementById('profile-wall-points');
  var likes = document.getElementById('profile-likes-count-btn');
  var roomName = document.getElementById('profile-room-name');
  var cover = document.getElementById('profile-cover');
  var countryName = document.getElementById('profile-country-name');
  var countryFlag = document.getElementById('profile-country-flag');
  var verified = document.getElementById('profile-main-verified-badge');
  var midUsername = document.getElementById('profile-mid-username');
  var badges = document.getElementById('profile-badges-container');

  var pic = user.pic && user.pic !== 'pic.png' ? user.pic : defaultAvatar();
  if (avatar) avatar.src = pic;
  if (avatarHeader) avatarHeader.src = pic;
  if (topic) topic.textContent = user.topic || user.name || user.username || 'مستخدم';
  if (midUsername) { midUsername.textContent = user.topic || user.name || user.username || ''; midUsername.classList.remove('d-none'); }
  if (msg) msg.textContent = user.msg || user.about || user.status || '';
  if (rep) rep.textContent = user.rep || '0';
  if (points) points.textContent = user.wallPoints || '0';
  if (likes) likes.textContent = user.likes || '0';
  if (roomName) roomName.textContent = user.room || '';
  if (cover) cover.src = user.bg && user.bg !== '#ffffff' ? user.bg : 'https://picsum.photos/seed/cover/400/150';
  if (countryName) countryName.textContent = user.countryName || '';
  if (countryFlag) countryFlag.className = 'fi fi-' + (user.co || user.code || 'us');
  if (verified) verified.classList.toggle('d-none', !user.verified);

  if (badges) {
    badges.innerHTML = '';
    var rank = user.power || user.rank || '';
    if (rank && String(rank) !== '0') {
      var badge = document.createElement('span');
      badge.className = 'profile-rank-badge badge rounded-pill';
      badge.textContent = String(rank);
      badges.appendChild(badge);
    }
  }
}

export function sendEffect(type) {
  var modal = document.getElementById('userProfileModal');
  var targetName = modal ? modal.getAttribute('data-username') : null;
  if (!targetName) return;
  emit(type, { name: targetName });
}

function getToken() {
  try { return sessionStorage.getItem('token') || localStorage.getItem('token') || ''; } catch (e) { return ''; }
}

function profileUserId() {
  var modal = document.getElementById('userProfileModal');
  var userId = modal ? modal.getAttribute('data-user-id') : null;
  if (userId) return userId;
  var username = modal ? modal.getAttribute('data-username') : null;
  return username || null;
}

function adminFetch(userId, body) {
  return fetch('/api/admin/users/' + encodeURIComponent(userId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify(body)
  });
}

export function saveProfileNickname() {
  var input = document.getElementById('profile-admin-nickname-input');
  var userId = profileUserId();
  if (input && input.value && userId) {
    adminFetch(userId, { topic: input.value })
      .then(function (r) { if (r.ok) showToast('تم تحديث الزخرفة بنجاح', 'success'); else return r.json().then((d) => { throw new Error((d && d.message) || 'فشل التحديث'); }); })
      .catch(function (e) { showToast(e.message || 'خطأ في الاتصال', 'error'); });
  }
}

export function saveProfileLikes() {
  var input = document.getElementById('profile-admin-likes-input');
  var userId = profileUserId();
  if (input && input.value && userId) {
    adminFetch(userId, { likes: parseInt(input.value, 10) || 0 })
      .then(function (r) { if (r.ok) showToast('تم تحديث اللايكات بنجاح', 'success'); else return r.json().then((d) => { throw new Error((d && d.message) || 'فشل التحديث'); }); })
      .catch(function (e) { showToast(e.message || 'خطأ في الاتصال', 'error'); });
  }
}

export function saveProfileGroup() {
  var select = document.getElementById('profile-admin-group-select');
  var userId = profileUserId();
  if (select && select.value && userId) {
    adminFetch(userId, { groupId: select.value })
      .then(function (r) { if (r.ok) showToast('تم تحديث المجموعة بنجاح', 'success'); else return r.json().then((d) => { throw new Error((d && d.message) || 'فشل التحديث'); }); })
      .catch(function (e) { showToast(e.message || 'خطأ في الاتصال', 'error'); });
  }
}

export function saveProfileRep() {
  var input = document.getElementById('profile-admin-rep-input');
  var userId = profileUserId();
  if (input && input.value && userId) {
    adminFetch(userId, { rep: parseInt(input.value, 10) || 0 })
      .then(function (r) { if (r.ok) showToast('تم تحديث السمعة بنجاح', 'success'); else return r.json().then((d) => { throw new Error((d && d.message) || 'فشل التحديث'); }); })
      .catch(function (e) { showToast(e.message || 'خطأ في الاتصال', 'error'); });
  }
}

export function saveProfileWallPoints() {
  var input = document.getElementById('profile-admin-wallpoints-input');
  var userId = profileUserId();
  if (input && input.value && userId) {
    adminFetch(userId, { wallPoints: parseInt(input.value, 10) || 0 })
      .then(function (r) { if (r.ok) showToast('تم تحديث النقاط بنجاح', 'success'); else return r.json().then((d) => { throw new Error((d && d.message) || 'فشل التحديث'); }); })
      .catch(function (e) { showToast(e.message || 'خطأ في الاتصال', 'error'); });
  }
}

export function toggleAdminPanel(show) {
  var panel = document.getElementById('profile-admin-sliding-panel');
  if (panel) {
    if (show === undefined) show = panel.classList.contains('d-none');
    panel.classList.toggle('d-none', !show);
  }
}
