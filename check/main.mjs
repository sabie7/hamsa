import { ui, showToast } from './modules/ui.js?v=3';
import * as state from './modules/state.js?v=3';
import { PrivateChatManager } from './modules/PrivateChatManager.js?v=1';
import { PrivateCallManager } from './modules/PrivateCallManager.js';
import { VoiceManager } from './modules/voice/VoiceManager.js?v=20260718';
import { MusicManager } from './modules/MusicManager.js?v=20260718';
import { prettifySystemMessage, initKeepAlive, initClearConfirm } from './modules/site-enhancements.js?v=1';
import { initGifts, openGiftPicker, announceGift } from './modules/gifts.js?v=1';
import { initCarGame, launchCarGame, onCarGameCreated, onCarGameAction, closeCarGame } from './modules/car-game.js?v=1';
import { initCustomModals } from './modules/custom-modals.js?v=1';
import { initEmojiPicker } from './modules/emoji-picker.js?v=1';

var socket = null;
var privateChat = new PrivateChatManager();
var privateCall = new PrivateCallManager();
var voiceManager = new VoiceManager();
var musicManager = new MusicManager();

var MAIN_ROOM = 'efOiAhhNdL';

function getSocket() {
  return state.getState().socket;
}

function emit(event, payload) {
  var s = getSocket();
  if (s && s.connected) s.emit(event, payload || {});
  else showToast('الاتصال غير متاح، حاول مرة أخرى', 'error');
}

function countryCode(selectId) {
  var sel = document.getElementById(selectId);
  return sel && sel.value ? sel.value : 'us';
}

function deviceFp() {
  return navigator.userAgent + '|' + (screen.width + 'x' + screen.height) + '|' + navigator.language + '|' + (window.localStorage && localStorage.getItem('fp') || '');
}

/* ══════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════ */

function login(username, password, isHidden) {
  if (!username || !password) {
    showToast('الرجاء إدخال اسم المستخدم وكلمة المرور', 'error');
    return;
  }
  emit('login', {
    name: username,
    password: password,
    stealth: !!isHidden,
    code: countryCode('member-country'),
    fp: deviceFp()
  });
}

function guestLogin(nickname) {
  if (!nickname || !nickname.trim()) {
    showToast('الرجاء إدخال الاسم المستعار', 'error');
    return;
  }
  emit('guest', {
    name: nickname.trim(),
    code: countryCode('guest-country'),
    fp: deviceFp()
  });
}

function logout() {
  var s = getSocket();
  if (s && s.connected) s.emit('logout');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  state.setState('user', null);
  state.setState('token', null);
  window.location.reload();
}

function submitLogin() {
  var usernameInput = document.getElementById('member-username');
  var passwordInput = document.getElementById('member-password');
  var hiddenInput = document.getElementById('login-hidden-input');
  if (!usernameInput || !passwordInput) return;
  var username = usernameInput.value.trim();
  var password = passwordInput.value;
  var isHidden = hiddenInput ? hiddenInput.value === 'true' : false;
  login(username, password, isHidden);
}

function showProfile(userId) {
  if (!userId) return;
  emit('profile', { name: userId });
}

window.login = login;
window.guestLogin = guestLogin;
window.logout = logout;
window.showProfile = showProfile;
window.submitLogin = submitLogin;

function enterChat(user) {
  var overlay = document.getElementById('login-overlay');
  var chatShell = document.getElementById('chat-shell');
  if (overlay) overlay.classList.add('d-none');
  if (chatShell) chatShell.classList.remove('d-none');

  var headerName = document.getElementById('header-site-name');
  if (headerName && user && user.name) headerName.textContent = user.name;

  if (socket) {
    socket.emit('getextras');
    socket.emit('getzajel');
    socket.emit('getquickchat');
    socket.emit('getwall');
    socket.emit('game:active-list');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function defaultAvatar() {
  return '/uploads/site/defaultAvatar-1783610496476-957604529.jpeg';
}

function currentUserId() {
  var u = state.getState().user;
  return u && u.name ? u.name : (sessionStorage.getItem('user') ? JSON.parse(sessionStorage.getItem('user')).name : '');
}

/* ══════════════════════════════════════════════════════════════
   RENDERING — messages, users, rooms, wall, zajel, quick chat
   ══════════════════════════════════════════════════════════════ */

function renderMessage(item) {
  var container = document.getElementById('messages-container');
  if (!container || !item) return;
  var isSystem = item.type === 'broadcast' || item.type === 'system';
  var row = document.createElement('div');
  row.className = 'message-row d-flex align-items-start gap-2 p-2 border-bottom';
  row.setAttribute('data-username', item.user || '');
  row.setAttribute('data-message-id', item.id || '');

  if (isSystem) {
    var sys = document.createElement('div');
    sys.className = 'system-message small text-center py-1';
    sys.textContent = prettifySystemMessage(item.msg || '');
    row.appendChild(sys);
  } else {
    var avatar = document.createElement('img');
    avatar.src = item.pic && item.pic !== 'pic.png' ? item.pic : defaultAvatar();
    avatar.className = 'message-avatar';
    avatar.style.cssText = 'width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;';
    avatar.setAttribute('referrerpolicy', 'origin-when-cross-origin');

    var body = document.createElement('div');
    body.className = 'message-body';

    var header = document.createElement('div');
    header.className = 'message-header d-flex align-items-baseline gap-2';

    var name = document.createElement('span');
    name.className = 'message-username fw-bold small';
    name.textContent = item.user || 'مجهول';
    if (item.color) name.style.color = item.color;
    name.style.cursor = 'pointer';
    name.addEventListener('click', function () {
      showProfile(item.user);
    });

    var text = document.createElement('span');
    text.className = 'message-text small';
    text.textContent = item.msg || '';

    header.appendChild(name);
    body.appendChild(header);
    body.appendChild(text);
    row.appendChild(avatar);
    row.appendChild(body);
  }

  container.appendChild(row);
  while (container.children.length > 200) container.removeChild(container.firstChild);
  container.scrollTop = container.scrollHeight;
}

function renderSidebarUsers(users) {
  var container = document.getElementById('sidebar-users-container');
  if (!container) return;
  container.innerHTML = '';
  users.forEach(function (user) {
    var div = document.createElement('div');
    div.className = 'user-pro-item d-flex align-items-center gap-2 p-2';
    div.setAttribute('data-username', user.topic || user.username || '');
    div.setAttribute('data-user-id', user.id || '');
    var avatar = document.createElement('img');
    avatar.src = user.pic && user.pic !== 'pic.png' ? user.pic : defaultAvatar();
    avatar.className = 'user-avatar';
    avatar.style.cssText = 'width: 36px; height: 36px; border-radius: 10px; object-fit: cover;';
    avatar.setAttribute('referrerpolicy', 'origin-when-cross-origin');
    var name = document.createElement('span');
    name.className = 'fw-bold small';
    name.textContent = user.topic || user.username || 'مستخدم';
    div.appendChild(avatar);
    div.appendChild(name);
    div.addEventListener('click', function () {
      showProfile(user.topic || user.username);
    });
    container.appendChild(div);
  });
}

function renderLandingUsers(users) {
  var landingList = document.getElementById('landing-users-list');
  if (!landingList) return;
  landingList.innerHTML = '';
  users.forEach(function (user) {
    var div = document.createElement('div');
    div.className = 'list-group-item list-group-item-action py-1 px-2 d-flex align-items-center gap-2';
    var name = document.createElement('span');
    name.textContent = user.topic || user.username || 'مستخدم';
    div.appendChild(name);
    div.addEventListener('click', function () {
      showProfile(user.topic || user.username);
    });
    landingList.appendChild(div);
  });
}

function updateLandingCount() {
  var count = state.getState().onlineUsers || [];
  var landingCount = document.getElementById('landing-users-count');
  var onlineCount = document.getElementById('online-count');
  if (landingCount) landingCount.innerHTML = '<i class="fas fa-user-friends"></i> ' + count.length;
  if (onlineCount) onlineCount.textContent = count.length;
}

function renderRooms(rooms) {
  var container = document.getElementById('sidebar-rooms-container');
  var gridContainer = document.getElementById('rooms-grid-container');
  if (container) {
    container.innerHTML = '';
    rooms.forEach(function (room) {
      var div = document.createElement('div');
      div.className = 'room-card d-flex align-items-center gap-2 p-2';
      var thumb = document.createElement('img');
      thumb.src = room.thumbnail || room.pic || '/uploads/site/defaultRoom-1783610496484-436012667.jpeg';
      thumb.className = 'room-card-thumbnail';
      thumb.style.cssText = 'width: 40px; height: 40px; border-radius: 8px; object-fit: cover;';
      thumb.setAttribute('referrerpolicy', 'origin-when-cross-origin');
      var info = document.createElement('div');
      info.className = 'flex-grow-1';
      var name = document.createElement('div');
      name.className = 'fw-bold small';
      name.textContent = room.name || 'غرفة';
      var count = document.createElement('span');
      count.className = 'room-user-count small';
      count.textContent = (room.online || 0) + ' مستخدم';
      info.appendChild(name);
      info.appendChild(count);
      div.appendChild(thumb);
      div.appendChild(info);
      div.addEventListener('click', function () {
        joinRoom(room);
      });
      container.appendChild(div);
    });
  }
  if (gridContainer) {
    gridContainer.innerHTML = '';
    rooms.forEach(function (room) {
      var col = document.createElement('div');
      col.className = 'col';
      var card = document.createElement('div');
      card.className = 'card room-select-card';
      card.innerHTML = '<div class="card-body text-center"><h6>' + escapeHtml(room.name || 'غرفة') + '</h6><small>' + (room.online || 0) + ' مستخدم</small></div>';
      card.addEventListener('click', function () {
        joinRoom(room);
      });
      col.appendChild(card);
      gridContainer.appendChild(col);
    });
  }
}

function joinRoom(room) {
  if (!room) return;
  if (room.password) {
    openRoomPasswordModal(room);
  } else {
    emit('join_room', { roomId: room.id });
  }
}

function renderWallPosts(posts) {
  var container = document.getElementById('wall-posts-container');
  if (!container) return;
  container.innerHTML = '';
  (posts || []).forEach(function (post) {
    var div = document.createElement('div');
    div.className = 'wall-post card mb-2';
    var header = document.createElement('div');
    header.className = 'card-header d-flex align-items-center gap-2 py-1';
    var avatar = document.createElement('img');
    avatar.src = post.pic && post.pic !== 'pic.png' ? post.pic : defaultAvatar();
    avatar.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; object-fit: cover;';
    var name = document.createElement('span');
    name.className = 'fw-bold small';
    name.textContent = post.name || '';
    header.appendChild(avatar);
    header.appendChild(name);
    var body = document.createElement('div');
    body.className = 'card-body py-2';
    body.textContent = post.msg || '';
    var footer = document.createElement('div');
    footer.className = 'card-footer py-1 d-flex gap-3 small';
    var likeBtn = document.createElement('a');
    likeBtn.href = '#';
    likeBtn.className = 'text-decoration-none';
    likeBtn.textContent = '❤ ' + (post.likes ? post.likes.length : 0);
    likeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      emit('walllike', { id: post.id });
    });
    var commentBtn = document.createElement('a');
    commentBtn.href = '#';
    commentBtn.className = 'text-decoration-none';
    commentBtn.textContent = '💬 ' + (post.comments ? post.comments.length : 0);
    footer.appendChild(likeBtn);
    footer.appendChild(commentBtn);
    div.appendChild(header);
    div.appendChild(body);
    div.appendChild(footer);
    container.appendChild(div);
  });
}

function renderZajel(list) {
  var container = document.getElementById('zajel-messages-container');
  if (!container) return;
  container.innerHTML = '';
  (list || []).forEach(function (item) {
    var row = document.createElement('div');
    row.className = 'zajel-item small py-1 border-bottom';
    row.setAttribute('data-zajel-id', item.id || '');
    var from = document.createElement('strong');
    from.textContent = (item.sender || '') + ': ';
    var text = document.createElement('span');
    text.textContent = item.text || '';
    row.appendChild(from);
    row.appendChild(text);
    container.appendChild(row);
  });
}

function renderQuickChat(list) {
  var container = document.getElementById('quick-chat-messages');
  if (!container) return;
  container.innerHTML = '';
  (list || []).forEach(function (item) {
    var row = document.createElement('div');
    row.className = 'quick-chat-item small py-1 border-bottom';
    var from = document.createElement('strong');
    from.textContent = (item.user || '') + ': ';
    var text = document.createElement('span');
    text.textContent = item.text || '';
    row.appendChild(from);
    row.appendChild(text);
    container.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════════════════
   PROFILE MODAL
   ══════════════════════════════════════════════════════════════ */

function openProfileModal(data) {
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

function updateProfileModal(user) {
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

  var pic = user.pic && user.pic !== 'pic.png' ? user.pic : defaultAvatar();
  if (avatar) avatar.src = pic;
  if (avatarHeader) avatarHeader.src = pic;
  if (topic) topic.textContent = user.topic || user.name || user.username || 'مستخدم';
  if (msg) msg.textContent = user.msg || user.about || user.status || '';
  if (rep) rep.textContent = user.rep || '0';
  if (points) points.textContent = user.wallPoints || '0';
  if (likes) likes.textContent = user.likes || '0';
  if (roomName) roomName.textContent = user.room || '';
  if (cover) cover.src = user.bg && user.bg !== '#ffffff' ? user.bg : 'https://picsum.photos/seed/cover/400/150';
  if (countryName) countryName.textContent = user.countryName || '';
  if (countryFlag) countryFlag.className = 'fi fi-' + (user.co || user.code || 'us');
  if (verified) verified.classList.toggle('d-none', !user.isGuest === false && !user.verified);
}

function sendEffect(type) {
  var modal = document.getElementById('userProfileModal');
  var targetName = modal ? modal.getAttribute('data-username') : null;
  if (!targetName) return;
  emit(type, { name: targetName });
}

/* ══════════════════════════════════════════════════════════════
   ACTION MAP — every data-action button → real socket event
   ══════════════════════════════════════════════════════════════ */

var ACTION_MAP = {};

function registerAction(name, fn) {
  ACTION_MAP[name] = fn;
}

registerAction('refresh-page', function () { window.location.reload(); });

registerAction('show-register', function () { showAuthForm('register-form'); });
registerAction('show-member-login', function () { showAuthForm('member-login-form'); });
registerAction('show-guest-login', function () { showAuthForm('guest-login-form'); });
registerAction('member-login', function () { submitLogin(); });
registerAction('guest-login', function () {
  var nickname = document.getElementById('guest-nickname');
  if (nickname && nickname.value.trim()) guestLogin(nickname.value.trim());
});
registerAction('register', function () {
  var username = document.getElementById('register-username');
  var password = document.getElementById('register-password');
  if (username && password && username.value.trim() && password.value.trim()) {
    emit('register', {
      name: username.value.trim(),
      password: password.value.trim(),
      code: countryCode('register-country'),
      fp: deviceFp()
    });
  }
});
registerAction('toggle-password', function (btn) { togglePasswordVisibility(btn); });
registerAction('toggle-hidden', function (btn) { toggleHiddenMode(btn); });

registerAction('logout', function () { logout(); });
registerAction('delete-account', function () {
  if (confirm('هل أنت متأكد من حذف حسابك نهائياً؟')) {
    emit('delete_account');
    setTimeout(function () { window.location.reload(); }, 500);
  }
});

registerAction('send-message', function () {
  var chatInput = document.getElementById('chat-input');
  if (chatInput && chatInput.value.trim()) {
    emit('message', { msg: chatInput.value.trim() });
    chatInput.value = '';
    chatInput.style.height = 'auto';
  }
});

registerAction('send-pm', function () {
  var to = document.getElementById('pm-user-name');
  var input = document.getElementById('pm-message-input');
  if (to && input && input.value.trim()) {
    emit('send_pm', { to: to.textContent || to.getAttribute('data-user'), msg: input.value.trim() });
    input.value = '';
  }
});

registerAction('leave-room', function () {
  emit('change-room', { roomId: MAIN_ROOM });
});

registerAction('clear-chat', function () {
  var container = document.getElementById('messages-container');
  if (container) container.innerHTML = '';
  emit('clear-room-chat');
});

registerAction('upload-file', function () {
  var fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.click();
});

registerAction('bot-message', function () {
  var bar = document.getElementById('bot-mode-bar');
  if (bar) bar.classList.toggle('d-none');
});
registerAction('change-bot', function () {
  var bar = document.getElementById('bot-mode-bar');
  if (bar) bar.classList.toggle('d-none');
});
registerAction('exit-bot-mode', function () {
  var bar = document.getElementById('bot-mode-bar');
  if (bar) bar.classList.add('d-none');
});

registerAction('filter-monitor', function () { toggleFilterMonitorPanel(); });
registerAction('toggle-filter-monitor', function () { toggleFilterMonitorPanel(); });
registerAction('clear-filter-monitor', function () { clearFilterMonitorLocal(); });

registerAction('toggle-extra-actions', function (btn) {
  var menu = document.getElementById('extra-actions-menu');
  if (menu) menu.classList.toggle('d-none');
});

registerAction('toggle-emoji', function () {
  var picker = document.getElementById('emoji-picker');
  if (picker) picker.classList.toggle('d-none');
});
registerAction('close-emoji-picker', function () {
  var picker = document.getElementById('emoji-picker');
  if (picker) picker.classList.add('d-none');
});
registerAction('picker-tab', function (btn) {
  document.querySelectorAll('.picker-tab').forEach(function (t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
});

registerAction('send-wall-post', function () {
  var input = document.getElementById('wall-post-input');
  if (input && input.value.trim()) {
    emit('wallpost', { msg: input.value.trim() });
    input.value = '';
  }
});

registerAction('cancel-reply', function () {
  var bar = document.getElementById('reply-bar');
  if (bar) bar.classList.add('d-none');
});

registerAction('close-pm', function () {
  var modal = document.getElementById('pmModal');
  if (modal) {
    var bs = bootstrap.Modal.getInstance(modal);
    if (bs) bs.hide();
  }
});

registerAction('toggle-sound', function (btn) {
  var icon = btn.querySelector('i');
  if (icon) {
    icon.className = icon.classList.contains('fa-volume-up') ? 'fas fa-volume-mute' : 'fas fa-volume-up';
  }
});

registerAction('mic-toggle', function (btn) {
  var micId = btn.id;
  if (voiceManager.activeMic === micId) {
    voiceManager.leaveMic();
    btn.classList.remove('active');
    emit('voice:mic-toggle', { enabled: false });
  } else {
    document.querySelectorAll('.btn-mic').forEach(function (m) { m.classList.remove('active'); });
    voiceManager.joinMic(micId);
    btn.classList.add('active');
    emit('voice:mic-toggle', { enabled: true });
  }
});

registerAction('room-music', function () {
  var modal = document.getElementById('roomMusicModal');
  if (modal) {
    var bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }
});

registerAction('live-broadcast', function () {
  var modal = document.getElementById('liveBroadcastModal');
  if (modal) {
    var bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }
});

registerAction('open-zajel', function () { openZajelModal(); });
registerAction('send-zajel', function () { submitZajelMsg(); });

registerAction('reconnect-close', function () { handleReconnectClose(); });

/* Battle */
registerAction('battle-minimize', function () {
  var panel = document.getElementById('battle-challenge-panel');
  var mini = document.getElementById('battle-minimized-indicator');
  if (panel) panel.classList.add('d-none');
  if (mini) mini.classList.remove('d-none');
});
registerAction('battle-expand', function () {
  var panel = document.getElementById('battle-challenge-panel');
  var mini = document.getElementById('battle-minimized-indicator');
  if (panel) panel.classList.remove('d-none');
  if (mini) mini.classList.add('d-none');
});
registerAction('battle-cancel', function () {
  var battleId = document.getElementById('battle-challenge-panel');
  var id = battleId ? battleId.getAttribute('data-battle-id') : null;
  if (id) emit('battle:decline', { id: id });
});
registerAction('battle-support-p1', function () {
  var battleId = document.getElementById('battle-challenge-panel');
  var id = battleId ? battleId.getAttribute('data-battle-id') : null;
  if (id) emit('battle:round-action', { id: id, action: 'support', player: 1 });
});
registerAction('battle-support-p2', function () {
  var battleId = document.getElementById('battle-challenge-panel');
  var id = battleId ? battleId.getAttribute('data-battle-id') : null;
  if (id) emit('battle:round-action', { id: id, action: 'support', player: 2 });
});
registerAction('battle-gift', function () {
  var panel = document.getElementById('battle-challenge-panel');
  var opponent = panel ? panel.getAttribute('data-opponent') : null;
  if (opponent) openGiftPicker(opponent);
});

/* Games */
registerAction('game-minimize', function () {
  var overlay = document.getElementById('game-overlay');
  var mini = document.getElementById('game-minimized-indicator');
  if (overlay) overlay.classList.add('d-none');
  if (mini) mini.classList.remove('d-none');
});
registerAction('game-expand', function () {
  var overlay = document.getElementById('game-overlay');
  var mini = document.getElementById('game-minimized-indicator');
  if (overlay) overlay.classList.remove('d-none');
  if (mini) mini.classList.add('d-none');
});
registerAction('game-close', function () {
  var overlay = document.getElementById('game-overlay');
  var mini = document.getElementById('game-minimized-indicator');
  if (overlay) overlay.classList.add('d-none');
  if (mini) mini.classList.add('d-none');
  var gameId = document.getElementById('game-overlay').getAttribute('data-game-id');
  if (gameId) emit('game:end', { gameId: gameId });
});
registerAction('game-mic-toggle', function () {
  var muted = voiceManager.toggleMute();
  emit('voice:mic-toggle', { enabled: !muted });
});
registerAction('game-speaker-toggle', function (btn) {
  var icon = btn.querySelector('i');
  var muted = false;
  if (icon) {
    if (icon.classList.contains('fa-volume-up')) { icon.className = 'fas fa-volume-mute'; muted = true; }
    else { icon.className = 'fas fa-volume-up'; muted = false; }
  }
  emit('voice:speaker-muted', { muted: muted });
});
registerAction('open-active-games', function () {
  emit('game:active-list');
});
registerAction('launch-car-game', function () { launchCarGame(); });

/* Music controls */
registerAction('music-play', function (btn) {
  var url = btn.getAttribute('data-url');
  if (url) musicManager.play(url);
});
registerAction('music-pause', function () { musicManager.pause(); });
registerAction('music-stop', function () { musicManager.stop(); });
registerAction('music-local-mute', function () {
  musicManager.setVolume(musicManager.volume > 0 ? 0 : 0.5);
});
registerAction('music-fix-sound', function () {
  showToast('تم إصلاح الصوت', 'success');
});
registerAction('music-search', function () {
  var search = document.getElementById('music-search-input');
  if (search) {
    var list = document.getElementById('music-track-list');
    var query = search.value.toLowerCase();
    if (list) {
      Array.prototype.forEach.call(list.children, function (item) {
        item.style.display = item.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
    }
  }
});

/* Sidebar */
registerAction('close-sidebar', function () { closeSidebar(); });
registerAction('close-sidebar-overlay', function () { closeSidebar(); });
registerAction('tab-users', function () { switchTab('users'); });
registerAction('tab-private', function () { switchTab('private'); });
registerAction('tab-rooms', function () { switchTab('rooms'); });
registerAction('tab-wall', function () { switchTab('wall'); });
registerAction('tab-settings', function () { switchTab('settings'); });
registerAction('tab-games', function () { switchTab('games'); emit('game:active-list'); });

/* Settings */
registerAction('toggle-dark-mode', function () {
  document.body.classList.toggle('dark-mode-active');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode-active'));
});
registerAction('settings-upload', function () {
  var fileInput = document.getElementById('settings-file-input');
  if (fileInput) fileInput.click();
});
registerAction('delete-pic', function () {
  emit('delpic', { name: currentUserId() });
});
registerAction('save-settings', function () {
  var msg = document.getElementById('settings-msg-input');
  var topic = document.getElementById('settings-topic-input');
  var payload = {};
  if (msg && msg.value.trim() !== undefined) payload.msg = msg.value;
  if (topic && topic.value.trim()) payload.topic = topic.value.trim();
  emit('setprofile', payload);
});

/* Profile actions */
registerAction('profile-likes', function () {
  var name = profileTargetName();
  if (name) emit('like-user', { name: name });
});
registerAction('profile-rep', function () {
  var name = profileTargetName();
  if (name) emit('rep:update', { name: name, amount: 1 });
});
registerAction('profile-alert', function () {
  var name = profileTargetName();
  if (name) emit('send:public-notification', { text: 'تنبيه للمستخدم ' + name });
});
registerAction('profile-private', function () {
  var name = profileTargetName();
  if (name) privateChat.openChat(name, name);
});
registerAction('profile-battle', function () {
  var name = profileTargetName();
  if (name) emit('battle:create', { target: name, rounds: 3 });
});
registerAction('profile-del-pic', function () {
  var name = profileTargetName();
  if (name) emit('delpic', { name: name });
});
registerAction('profile-reveal', function () {
  var name = profileTargetName();
  if (name) showToast('الكشف عن النك غير متاح حالياً', 'warning');
});
registerAction('profile-gift', function () {
  var name = profileTargetName();
  if (name) openGiftPicker(name);
});
registerAction('profile-effects', function () {
  var modal = document.getElementById('effectsModal');
  if (modal) {
    var bs = new bootstrap.Modal(modal);
    bs.show();
  }
});
registerAction('profile-mute', function () {
  var name = profileTargetName();
  if (name) emit('mute', { name: name, value: true, seconds: 300 });
});
registerAction('profile-mute-room', function () {
  var name = profileTargetName();
  if (name) emit('mute', { name: name, value: true, seconds: 60 });
});
registerAction('profile-mute-global', function () {
  var name = profileTargetName();
  if (name) emit('mute', { name: name, value: true, seconds: 0 });
});
registerAction('profile-banner', function () {
  showToast('البنر', 'info');
});
registerAction('profile-kick', function () {
  var name = profileTargetName();
  if (name) emit('kick-user', { name: name });
});
registerAction('profile-kick-room', function () {
  var name = profileTargetName();
  if (name) emit('roomkick', { name: name });
});
registerAction('profile-kick-global', function () {
  var name = profileTargetName();
  if (name) emit('kick-user', { name: name });
});
registerAction('profile-ban', function () {
  var name = profileTargetName();
  if (name) emit('ban-user', { name: name, reason: 'مخالفة القوانين' });
});
registerAction('profile-ban-room', function () {
  var name = profileTargetName();
  if (name) emit('ban-room', { name: name });
});
registerAction('profile-ban-permanent', function () {
  var name = profileTargetName();
  if (name) emit('ban-user', { name: name, reason: 'حظر دائم' });
});
registerAction('profile-ban-temporary', function () {
  var name = profileTargetName();
  if (name) emit('ban-user', { name: name, reason: 'حظر مؤقت' });
});
registerAction('profile-report', function () {
  var name = profileTargetName();
  var modal = document.getElementById('reportModal');
  if (name && modal) {
    modal.setAttribute('data-report-target', name);
    var bs = new bootstrap.Modal(modal);
    bs.show();
  }
});
registerAction('profile-ignore', function () {
  var name = profileTargetName();
  if (name) showToast('تم تجاهل ' + name, 'success');
});
registerAction('profile-admin', function () {
  toggleAdminPanel();
});
registerAction('profile-mod-room', function () {
  var name = profileTargetName();
  if (name) emit('setpower', { name: name, powerName: 'مشرف' });
});
registerAction('profile-kiss', function () { sendEffect('kiss'); });
registerAction('profile-slap', function () { sendEffect('slap'); });
registerAction('profile-hug', function () { sendEffect('hug'); });
registerAction('profile-clap', function () { sendEffect('clap'); });

/* Admin profile panel */
registerAction('save-profile-nickname', function () { saveProfileNickname(); });
registerAction('save-profile-likes', function () { saveProfileLikes(); });
registerAction('save-profile-group', function () { saveProfileGroup(); });
registerAction('save-profile-rep', function () { saveProfileRep(); });
registerAction('save-profile-wallpoints', function () { saveProfileWallPoints(); });
registerAction('move-member', function () {
  var select = document.getElementById('move-member-room-select');
  var name = profileTargetName();
  if (select && select.value && name) {
    emit('manage_room', { target: name, roomId: select.value });
  }
});
registerAction('add-moderator', function () {
  var select = document.getElementById('moderator-select');
  var name = profileTargetName();
  if (select && select.value && name) {
    emit('setpower', { name: name, powerName: select.value });
    showToast('تم منح صلاحية المراقبة لـ ' + name, 'success');
  }
});
registerAction('close-admin-panel', function () { toggleAdminPanel(false); });

/* Modals */
registerAction('submit-report', function () {
  var modal = document.getElementById('reportModal');
  var reason = document.getElementById('report-reason-input');
  var error = document.getElementById('report-reason-error');
  var target = modal ? modal.getAttribute('data-report-target') : null;
  if (!reason || !reason.value.trim()) {
    if (error) error.classList.remove('d-none');
    return;
  }
  if (error) error.classList.add('d-none');
  if (target) emit('report', { name: target, reason: reason.value.trim() });
  var bs = bootstrap.Modal.getInstance(modal);
  if (bs) bs.hide();
  showToast('تم إرسال التبليغ', 'success');
});
registerAction('submit-room-password', function () {
  var modal = document.getElementById('roomPasswordModal');
  var input = document.getElementById('room-password-input');
  var roomId = modal ? modal.getAttribute('data-room-id') : null;
  if (input && input.value && roomId) {
    emit('join_room', { roomId: roomId, password: input.value });
    var bs = bootstrap.Modal.getInstance(modal);
    if (bs) bs.hide();
  }
});
registerAction('close-room-grid', function () {
  var modal = document.getElementById('roomsGridModal');
  if (modal) {
    var bs = bootstrap.Modal.getInstance(modal);
    if (bs) bs.hide();
  }
});
registerAction('close-modal', function (btn) {
  var modal = btn.closest('.modal');
  if (modal) {
    var bs = bootstrap.Modal.getInstance(modal);
    if (bs) bs.hide();
  }
});
registerAction('close-lightbox', function () {
  var lightbox = document.getElementById('lightbox');
  if (lightbox) lightbox.classList.add('d-none');
});
registerAction('addons-back', function () {
  var modal = document.getElementById('addonsModal');
  if (modal) {
    var bs = bootstrap.Modal.getInstance(modal);
    if (bs) bs.hide();
  }
});
registerAction('remove-addon', function () {
  showToast('تمت إزالة الهدية', 'success');
});

/* Context menu */
registerAction('ctx-profile', function () {
  var ctx = document.getElementById('user-context-menu');
  var name = ctx ? ctx.getAttribute('data-username') : null;
  if (name) showProfile(name);
});
registerAction('ctx-pm', function () {
  var ctx = document.getElementById('user-context-menu');
  var name = ctx ? ctx.getAttribute('data-username') : null;
  if (name) privateChat.openChat(name, name);
});
registerAction('ctx-ignore', function () {
  var ctx = document.getElementById('user-context-menu');
  var name = ctx ? ctx.getAttribute('data-username') : null;
  if (name) showToast('تم تجاهل ' + name, 'success');
});
registerAction('ctx-report', function () {
  var ctx = document.getElementById('user-context-menu');
  var name = ctx ? ctx.getAttribute('data-username') : null;
  if (name) {
    var modal = document.getElementById('reportModal');
    modal.setAttribute('data-report-target', name);
    var bs = new bootstrap.Modal(modal);
    bs.show();
  }
});

/* Room create / edit */
registerAction('edit-cover', function () {
  var fileInput = document.getElementById('cover-file-input');
  if (fileInput) fileInput.click();
});
registerAction('pick-thumbnail', function (btn) {
  var fileInput = btn.closest('form') ? btn.closest('form').querySelector('input[type="file"]') : null;
  if (fileInput) fileInput.click();
});
registerAction('pick-banner', function () {
  showToast('اختر صورة البنر', 'info');
});

/* Upload submit */
registerAction('upload-submit', function () {
  var fileInput = document.getElementById('upload-file-input');
  if (fileInput && fileInput.files && fileInput.files[0]) {
    uploadImage(fileInput.files[0], function (url) {
      if (url) emit('setprofile', { pic: url });
    });
  }
});

function profileTargetName() {
  var modal = document.getElementById('userProfileModal');
  return modal ? modal.getAttribute('data-username') : null;
}

/* ══════════════════════════════════════════════════════════════
   HELPERS — tabs, sidebar, auth forms, upload, modals
   ══════════════════════════════════════════════════════════════ */

var TAB_MAP = {
  users: { btn: 'users-tab-btn', panel: 'sidebar-users-wrapper' },
  private: { btn: 'private-tab-btn', panel: 'sidebar-private-container' },
  rooms: { btn: 'rooms-tab-btn', panel: 'sidebar-rooms-container' },
  wall: { btn: 'wall-tab-btn', panel: 'sidebar-wall-container' },
  settings: { btn: 'settings-tab-btn', panel: 'sidebar-settings-container' },
  games: { btn: 'games-tab-btn', panel: 'sidebar-games-container' }
};

function switchTab(tab) {
  state.setState('currentTab', tab);
  Object.keys(TAB_MAP).forEach(function (key) {
    var t = TAB_MAP[key];
    var btn = document.getElementById(t.btn);
    var panel = document.getElementById(t.panel);
    if (btn) btn.classList.toggle('active', key === tab);
    if (panel) panel.classList.toggle('d-none', key !== tab);
  });
}

function closeSidebar() {
  var sidebar = document.getElementById('right-sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.add('d-none');
}

function showAuthForm(formId) {
  ['member-login-form', 'guest-login-form', 'register-form'].forEach(function (id) {
    var f = document.getElementById(id);
    if (f) {
      if (id === formId) { f.classList.remove('hidden-form'); f.classList.add('visible-form'); }
      else { f.classList.remove('visible-form'); f.classList.add('hidden-form'); }
    }
  });
}

function openRoomPasswordModal(room) {
  var modal = document.getElementById('roomPasswordModal');
  if (modal) {
    modal.setAttribute('data-room-id', room.id);
    var bs = new bootstrap.Modal(modal);
    bs.show();
  }
}

function uploadImage(file, cb) {
  var reader = new FileReader();
  reader.onload = function (e) {
    fetch('/api/uploadbase64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: e.target.result })
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.url && cb) cb(data.url);
      else if (cb) cb(null);
    }).catch(function () {
      if (cb) cb(null);
      showToast('فشل رفع الصورة', 'error');
    });
  };
  reader.readAsDataURL(file);
}

function bindSettingsUpload() {
  var fileInput = document.getElementById('settings-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        uploadImage(this.files[0], function (url) {
          if (url) emit('setprofile', { pic: url });
        });
      }
    });
  }
  var fileInput2 = document.getElementById('file-input');
  if (fileInput2) {
    fileInput2.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        uploadImage(this.files[0], function (url) {
          if (url) emit('message', { msg: url });
        });
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   SOCKET SETUP
   ══════════════════════════════════════════════════════════════ */

function init() {
  /* Bind DOM actions FIRST so buttons always respond even if a later
     handler registration throws. */
  bindActions();
  bindForms();

  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var host = window.location.host;
  socket = io(protocol + '//' + host, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
  });
  state.setState('socket', socket);

  /* Server → client event handlers */
  var pingTimer = null;
  socket.on('connect', function () {
    var token = sessionStorage.getItem('token');
    if (token) socket.emit('istoken', token);
    hideReconnectBar();
    if (!pingTimer) {
      pingTimer = setInterval(function () { if (socket.connected) socket.emit('ping'); }, 25000);
    }
  });

  socket.on('disconnect', function (reason) {
    if (reason && reason !== 'io client disconnect') showReconnectBar();
  });

  socket.on('connect_error', function () {
    showReconnectBar();
  });

  socket.on('reconnect_attempt', function () {
    showReconnectBar();
  });

  socket.on('reconnect', function () {
    hideReconnectBar();
  });

  socket.on('init-config', function (data) {
    if (data && data.settings) state.setState('settings', data.settings);
    if (data && data.siteweb) state.setState('siteweb', data.siteweb);
  });

  socket.on('login', function (data) {
    if (data && data.token) {
      sessionStorage.setItem('token', data.token);
      state.setState('token', data.token);
    }
    if (data && data.user) {
      state.setState('user', data.user);
      sessionStorage.setItem('user', JSON.stringify(data.user));
      enterChat(data.user);
    }
  });

  socket.on('savetoken', function (data) {
    if (data && data.token) {
      sessionStorage.setItem('token', data.token);
      state.setState('token', data.token);
    }
  });

  socket.on('errortoken', function () {
    sessionStorage.removeItem('token');
  });

  socket.on('error-msg', function (data) {
    showToast(data && data.msg ? data.msg : 'حدث خطأ', data && data.color === 'success' ? 'success' : 'error');
    var spinner = document.querySelector('#member-login-btn .spinner-border');
    if (spinner) spinner.classList.add('d-none');
  });

  socket.on('alert', function (data) {
    if (data && data.msg) showToast(data.msg, 'warning');
  });

  socket.on('msg:error', function (data) {
    if (data && data.msg) showToast(data.msg, 'error');
  });

  socket.on('msg:rate-limit', function (data) {
    if (data && data.msg) showToast(data.msg, 'warning');
  });

  socket.on('savedone', function (data) {
    if (data && data.msg) showToast(data.msg, 'success');
  });

  socket.on('message', function (item) {
    renderMessage(item);
  });

  socket.on('pm', function (item) {
    if (item && item.user) {
      privateChat.addMessage(item.from || item.user, item);
    }
    renderMessage({ user: (item.from || item.user) + ' 💬', msg: item.msg, color: item.color, pic: item.pic });
  });

  socket.on('profile', function (data) {
    if (data && data.error) {
      showToast(data.error, 'error');
      return;
    }
    openProfileModal(data);
  });

  socket.on('userinfo', function (data) {
    if (data && data.error) {
      showToast(data.error, 'error');
      return;
    }
    openProfileModal(data);
  });

  socket.on('power', function (p) {
    state.setState('power', p);
  });

  socket.on('powers', function (p) {
    state.setState('powers', p);
  });

  socket.on('users-list', function (users) {
    users = users || [];
    state.setState('onlineUsers', users);
    updateLandingCount();
    renderSidebarUsers(users);
    renderLandingUsers(users);
  });

  socket.on('user-joined', function (user) {
    var users = state.getState().onlineUsers || [];
    var exists = users.some(function (u) { return u.id === user.id; });
    if (!exists) users.push(user);
    state.setState('onlineUsers', users);
    updateLandingCount();
    renderSidebarUsers(users);
    renderLandingUsers(users);
  });

  socket.on('user-left', function (data) {
    var users = state.getState().onlineUsers || [];
    if (data && data.name) {
      users = users.filter(function (u) { return u.topic !== data.name && u.username !== data.name; });
    }
    state.setState('onlineUsers', users);
    updateLandingCount();
    renderSidebarUsers(users);
    renderLandingUsers(users);
  });

  socket.on('rlist', function (rooms) {
    rooms = rooms || [];
    state.setState('rooms', rooms);
    renderRooms(rooms);
  });

  socket.on('rooms:full-list', function (rooms) {
    rooms = rooms || [];
    state.setState('rooms', rooms);
    renderRooms(rooms);
  });

  socket.on('rooms-stats', function (data) {
    if (!data || !data.rooms) return;
    var rooms = state.getState().rooms || [];
    var map = {};
    data.rooms.forEach(function (r) { map[r.id] = r.online; });
    rooms.forEach(function (room) {
      if (map[room.id] !== undefined) room.online = map[room.id];
    });
    state.setState('rooms', rooms);
    renderRooms(rooms);
  });

  socket.on('room-changed', function (data) {
    if (data && data.roomId) state.setState('currentRoom', data.roomId);
  });

  socket.on('typing', function (data) {
    var el = document.getElementById('typing-indicator');
    if (el && data && data.name) {
      el.textContent = data.name + ' يكتب...';
      el.classList.remove('d-none');
      setTimeout(function () { el.classList.add('d-none'); }, 2000);
    }
  });

  socket.on('wall-stats', function (posts) {
    renderWallPosts(posts);
  });

  socket.on('wall-update', function (post) {
    var posts = state.getState().wallPosts || [];
    posts.unshift(post);
    state.setState('wallPosts', posts.slice(0, 50));
    renderWallPosts(posts.slice(0, 50));
  });

  socket.on('wallcomment', function (data) {
    var posts = state.getState().wallPosts || [];
    posts.forEach(function (p) {
      if (p.id === data.id) p.comments = data.comments;
    });
    renderWallPosts(posts);
  });

  socket.on('delwall', function (data) {
    var posts = (state.getState().wallPosts || []).filter(function (p) { return p.id !== data.id; });
    state.setState('wallPosts', posts);
    renderWallPosts(posts);
  });

  socket.on('likes-updated', function (data) {
    var posts = state.getState().wallPosts || [];
    posts.forEach(function (p) {
      if (p.id === data.id) p.likes = data.likes;
    });
    renderWallPosts(posts);
  });

  socket.on('zajel:list', function (list) {
    renderZajel(list);
  });

  socket.on('zajel:new', function (item) {
    var list = state.getState().zajelMessages || [];
    list.unshift(item);
    if (list.length > 30) list.pop();
    state.setState('zajelMessages', list);
    renderZajel(list);
  });

  socket.on('zajel:delete', function (data) {
    var list = (state.getState().zajelMessages || []).filter(function (m) { return m.id !== data.id; });
    state.setState('zajelMessages', list);
    renderZajel(list);
  });

  socket.on('quick-chat:history', function (list) {
    renderQuickChat(list);
  });

  socket.on('quick-chat:new', function (item) {
    var list = state.getState().quickChatHistory || [];
    list.unshift(item);
    if (list.length > 100) list.pop();
    state.setState('quickChatHistory', list);
    renderQuickChat(list);
  });

  socket.on('news_ticker_updated', function (data) {
    var ticker = document.getElementById('news-ticker');
    if (ticker && data && data.text) ticker.textContent = data.text;
  });

  socket.on('kicked', function () {
    showToast('تم طردك من الدردشة', 'error');
    setTimeout(function () { logout(); }, 1000);
  });

  socket.on('muted', function (data) {
    showToast(data && data.reason ? 'تم كتمك: ' + data.reason : 'تم كتم صوتك', 'warning');
  });

  socket.on('banned', function (data) {
    showToast(data && data.reason ? 'تم حظرك: ' + data.reason : 'تم حظرك من الدردشة', 'error');
  });

  socket.on('duplicate-session', function () {
    showToast('تم تسجيل الدخول من جهاز آخر', 'error');
  });

  socket.on('kiss-animation', function (data) {
    if (data && data.from) showToast(data.from + ' قبلتك 💋', 'success');
  });

  socket.on('hug-received', function (data) {
    if (data && data.from) showToast(data.from + ' عانقك 🤗', 'success');
  });

  socket.on('slap-received', function (data) {
    if (data && data.from) showToast(data.from + ' كفّلك 👋', 'error');
  });

  socket.on('clap-received', function (data) {
    if (data && data.from) showToast(data.from + ' صفق لك 👏', 'success');
  });

  socket.on('gift', function (data) {
    announceGift(data);
  });

  socket.on('animation', function (data) {
    if (data && data.from) showToast(data.from + ' أرسل تأثيراً', 'info');
  });

  socket.on('system-message', function (data) {
    showToast(data && data.msg ? data.msg : '', 'info');
  });

  socket.on('reload_site', function () {
    window.location.reload();
  });

  socket.on('server_restarting', function () {
    showToast('سيتم إعادة تشغيل السيرفر قريباً', 'warning');
  });

  socket.on('alert:show', function (data) {
    if (data && data.text) showToast(data.text, 'warning');
  });

  socket.on('admin:broadcast', function (data) {
    if (data && data.msg) showToast(data.msg, 'info');
  });

  socket.on('battle:created', function (data) {
    showToast('تم إنشاء التحدي', 'success');
    var panel = document.getElementById('battle-challenge-panel');
    if (panel && data) {
      panel.setAttribute('data-battle-id', data.id);
      panel.classList.remove('d-none');
    }
  });

  socket.on('battle:invited', function (data) {
    if (confirm((data.opponent || '') + ' يريد تحديك! هل تقبل؟')) {
      emit('battle:accept', { id: data.id });
    } else {
      emit('battle:decline', { id: data.id });
    }
  });

  socket.on('battle:started', function (battle) {
    showToast('بدأ التحدي!', 'success');
    var panel = document.getElementById('battle-challenge-panel');
    if (panel) {
      panel.setAttribute('data-battle-id', battle.id);
      panel.classList.remove('d-none');
    }
  });

  socket.on('battle:round-update', function (data) {
    if (data && data.by) showToast(data.by + ' قام بالحركة (' + data.action + ')', 'info');
  });

  socket.on('battle:score-update', function (data) {
    if (data && data.scores) {
      var p1 = document.getElementById('bt-score-player1');
      var p2 = document.getElementById('bt-score-player2');
      var keys = Object.keys(data.scores);
      if (p1 && keys[0]) p1.textContent = data.scores[keys[0]];
      if (p2 && keys[1]) p2.textContent = data.scores[keys[1]];
    }
  });

  socket.on('battle:ended', function () {
    var panel = document.getElementById('battle-challenge-panel');
    if (panel) panel.classList.add('d-none');
    showToast('انتهى التحدي', 'info');
  });

  socket.on('game:created', function (game) {
    var overlay = document.getElementById('game-overlay');
    if (overlay && game) {
      overlay.setAttribute('data-game-id', game.id);
      overlay.classList.remove('d-none');
    }
    onCarGameCreated(game);
  });

  socket.on('game:ended', function () {
    var overlay = document.getElementById('game-overlay');
    if (overlay) overlay.classList.add('d-none');
    closeCarGame();
  });

  socket.on('game:action', function (data) {
    onCarGameAction(data);
  });

  socket.on('game:active-list', function (games) {
    var container = document.getElementById('active-games-sidebar-container');
    if (container) {
      container.innerHTML = '';
      (games || []).forEach(function (g) {
        var div = document.createElement('div');
        div.className = 'game-entry small p-2 border-bottom d-flex justify-content-between align-items-center';
        var info = document.createElement('span');
        info.textContent = (g.creator || '') + ' — ' + (g.type || 'لعبة');
        var btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline-primary';
        btn.textContent = 'مشاهدة';
        btn.addEventListener('click', function () {
          emit('game:spectate', { gameId: g.id });
        });
        div.appendChild(info);
        div.appendChild(btn);
        container.appendChild(div);
      });
    }
  });

  socket.on('voice:mic-status', function (data) {
    if (data && data.name) showToast(data.name + (data.enabled ? ' فتح المايك' : ' أغلق المايك'), 'info');
  });

  socket.on('voice:speaker-muted', function (data) {
    if (data && data.name) showToast(data.name + (data.muted ? ' كتم المكبر' : ' فتح المكبر'), 'info');
  });

  socket.on('report:submitted', function () {
    showToast('تم إرسال التبليغ', 'success');
  });

  socket.on('notification', function (data) {
    if (data && data.text) showToast(data.from + ': ' + data.text, 'info');
  });

  socket.on('private-notification', function (data) {
    if (data && data.text) showToast(data.from + ': ' + data.text, 'info');
  });

  socket.on('rep-updated', function (data) {
    if (data && data.name && data.rep) showToast('تم تحديث سمعة ' + data.name + ' إلى ' + data.rep, 'success');
  });

  socket.on('user_updated', function (data) {
    var users = state.getState().onlineUsers || [];
    users.forEach(function (u) {
      if (u.id === data.id) {
        if (data.pic) u.pic = data.pic;
        if (data.rep !== undefined) u.rep = data.rep;
        if (data.power) u.power = data.power;
      }
    });
    state.setState('onlineUsers', users);
    renderSidebarUsers(users);
  });

  socket.on('updateOnline', function (data) {
    var el = document.getElementById('room-online-count');
    if (el && data) el.textContent = data.count || '0';
  });

  socket.on('filter:monitor-update', function (data) {
    if (data && data.noletters) {
      var list = document.getElementById('filter-monitor-messages');
      if (list) list.textContent = 'الكلمات المفلترة: ' + data.noletters.length;
    }
  });

  /* Bind DOM (reconnect-bar/overlay close handled by bindActions already) */
  bindSettingsUpload();
  bindSidebar();
  bindWindowFunctions();
  initKeepAlive();
  initClearConfirm();
  initGifts({ emit: emit, showToast: showToast });
  initCarGame({ emit: emit });
  initCustomModals();
  initEmojiPicker();
  loadInitialData();
}

/* Global delegated click handler: every [data-action] button */
function bindActions() {
  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    var fn = ACTION_MAP[action];
    if (fn) {
      e.preventDefault();
      fn(target);
    } else {
      console.warn('Unmapped data-action:', action);
    }
  });
}

function bindForms() {
  var memberForm = document.getElementById('member-login-form');
  if (memberForm) {
    memberForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submitLogin();
    });
  }

  var guestForm = document.getElementById('guest-login-form');
  if (guestForm) {
    guestForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var nickname = document.getElementById('guest-nickname');
      if (nickname && nickname.value.trim()) guestLogin(nickname.value.trim());
    });
  }

  var registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var username = document.getElementById('register-username');
      var password = document.getElementById('register-password');
      if (username && password && username.value.trim() && password.value.trim()) {
        emit('register', {
          name: username.value.trim(),
          password: password.value.trim(),
          code: countryCode('register-country'),
          fp: deviceFp()
        });
      }
    });
  }

  var chatForm = document.getElementById('chat-form');
  var chatInput = document.getElementById('chat-input');
  if (chatForm) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (chatInput && chatInput.value.trim()) {
        emit('message', { msg: chatInput.value.trim() });
        chatInput.value = '';
        chatInput.style.height = 'auto';
      }
    });
  }
  if (chatInput) {
    chatInput.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
  }

  var searchInput = document.getElementById('sidebar-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var query = this.value.toLowerCase();
      var items = document.querySelectorAll('#sidebar-users-container .user-pro-item');
      items.forEach(function (item) {
        var name = item.getAttribute('data-username') || '';
        item.style.display = name.toLowerCase().includes(query) ? '' : 'none';
      });
    });
  }
}

function bindSidebar() {
  var closeBtn = document.getElementById('close-sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  var sidebar = document.getElementById('right-sidebar');

  if (closeBtn && sidebar && overlay) {
    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
  }

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode-active');
  }
}

function loadInitialData() {
  socket.emit('getstate');
  socket.emit('get_site_info');
}

/* ══════════════════════════════════════════════════════════════
   WINDOW FUNCTIONS (exposed for inline onclick handlers)
   ══════════════════════════════════════════════════════════════ */

function togglePasswordVisibility(btn) {
  var input = btn.closest('.input-group') ? btn.closest('.input-group').querySelector('input[type="password"]') : null;
  if (input) {
    if (input.type === 'password') { input.type = 'text'; btn.innerHTML = '<i class="fas fa-eye-slash"></i>'; }
    else { input.type = 'password'; btn.innerHTML = '<i class="fas fa-eye"></i>'; }
  }
}

function toggleHiddenMode(btn) {
  var hiddenInput = document.getElementById('login-hidden-input');
  if (hiddenInput) {
    var isHidden = hiddenInput.value === 'true';
    hiddenInput.value = isHidden ? 'false' : 'true';
    if (btn) btn.classList.toggle('active');
  }
}

function saveProfileNickname() {
  var input = document.getElementById('profile-admin-nickname-input');
  var name = profileTargetName();
  if (input && input.value && name) {
    emit('admin', { cmd: 'edit_user', data: { topic: name, topic1: input.value } });
  }
}

function saveProfileLikes() {
  var input = document.getElementById('profile-admin-likes-input');
  var name = profileTargetName();
  if (input && input.value && name) {
    emit('admin', { cmd: 'edit_user', data: { topic: name, likes: parseInt(input.value) } });
  }
}

function saveProfileGroup() {
  var select = document.getElementById('profile-admin-group-select');
  var name = profileTargetName();
  if (select && select.value && name) {
    emit('admin', { cmd: 'setuserpower', data: { name: name, power: select.value } });
  }
}

function saveProfileRep() {
  var input = document.getElementById('profile-admin-rep-input');
  var name = profileTargetName();
  if (input && input.value && name) {
    emit('admin', { cmd: 'edit_user', data: { topic: name, rep: parseInt(input.value) } });
  }
}

function saveProfileWallPoints() {
  var input = document.getElementById('profile-admin-wallpoints-input');
  var name = profileTargetName();
  if (input && input.value && name) {
    emit('admin', { cmd: 'edit_user', data: { topic: name, evaluation: parseInt(input.value) } });
  }
}

function toggleAdminPanel(show) {
  var panel = document.getElementById('profile-admin-sliding-panel');
  if (panel) {
    if (show === undefined) show = panel.classList.contains('d-none');
    panel.classList.toggle('d-none', !show);
  }
}

function openZajelModal() {
  var modal = document.getElementById('zajelSubmitModal');
  if (modal) {
    var bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }
}

function submitZajelMsg() {
  var input = document.getElementById('zajel-msg-input');
  var error = document.getElementById('zajel-submit-error');
  if (input && input.value.trim()) {
    emit('zajel:send', { msg: input.value.trim() });
    input.value = '';
    var modal = document.getElementById('zajelSubmitModal');
    if (modal) {
      var bsModal = bootstrap.Modal.getInstance(modal);
      if (bsModal) bsModal.hide();
    }
  } else if (error) {
    error.classList.remove('d-none');
    error.textContent = 'الرجاء كتابة رسالة';
  }
}

function showReconnectBar() {
  var bar = document.getElementById('reconnect-status-bar');
  if (bar) bar.classList.remove('d-none');
}

function hideReconnectBar() {
  var bar = document.getElementById('reconnect-status-bar');
  if (bar) bar.classList.add('d-none');
}

function handleReconnectClose() {
  hideReconnectBar();
}

function openActiveGamesView() {
  emit('game:active-list');
}

function toggleFilterMonitorPanel() {
  var panel = document.getElementById('filter-monitor-panel');
  if (panel) panel.classList.toggle('open');
}

function clearFilterMonitorLocal() {
  var messages = document.getElementById('filter-monitor-messages');
  if (messages) messages.innerHTML = '<p class="text-muted text-center py-4 my-2">لا يوجد رسائل مراقبة حالياً</p>';
}

function bindWindowFunctions() {
  window.togglePasswordVisibility = togglePasswordVisibility;
  window.toggleHiddenMode = toggleHiddenMode;
  window.saveProfileNickname = saveProfileNickname;
  window.saveProfileLikes = saveProfileLikes;
  window.saveProfileGroup = saveProfileGroup;
  window.saveProfileRep = saveProfileRep;
  window.saveProfileWallPoints = saveProfileWallPoints;
  window.toggleAdminPanel = toggleAdminPanel;
  window.openActiveGamesView = openActiveGamesView;
  window.handleReconnectClose = handleReconnectClose;
  window.openZajelModal = openZajelModal;
  window.submitZajelMsg = submitZajelMsg;
  window.toggleFilterMonitorPanel = toggleFilterMonitorPanel;
  window.clearFilterMonitorLocal = clearFilterMonitorLocal;
  window.openGamesView = function () { openActiveGamesView(); };
  window.sendPublicAlert = function () { emit('admin:alert', { msg: 'تنبيه عام', title: 'تنبيه' }); };
  window.openEditRoomModal = function () { var m = document.getElementById('createRoomModal'); if (m) { var bs = new bootstrap.Modal(m); bs.show(); } };
  window.themeGuestLogin = function () { var f = document.getElementById('guest-login-form'); if (f) f.dispatchEvent(new Event('submit')); };
  window.closeCoinsModal = function () { var m = document.getElementById('coinsModal'); if (m) { var bs = bootstrap.Modal.getInstance(m); if (bs) bs.hide(); } };
}

init();
