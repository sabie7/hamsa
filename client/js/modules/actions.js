import ctx, { emit, MAIN_ROOM } from './ctx.js';
import * as state from './state.js';
import { showToast } from './ui.js';
import {
  submitLogin, guestLogin, logout, showProfile, countryCode, deviceFp,
  togglePasswordVisibility, toggleHiddenMode
} from './auth.js';
import { currentUserId } from './rendering.js';
import {
  profileTargetName, sendEffect, saveProfileNickname, saveProfileLikes,
  saveProfileGroup, saveProfileRep, saveProfileWallPoints, toggleAdminPanel
} from './profile.js';
import { openGiftPicker } from './gifts.js';
import { launchCarGame } from './car-game.js';

var ACTION_MAP = {};

export function registerAction(name, fn) {
  ACTION_MAP[name] = fn;
}

export function getActionMap() {
  return ACTION_MAP;
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
  if (ctx.voiceManager && ctx.voiceManager.activeMic === micId) {
    ctx.voiceManager.leaveMic();
    btn.classList.remove('active');
  } else {
    document.querySelectorAll('.btn-mic').forEach(function (m) { m.classList.remove('active'); });
    if (ctx.voiceManager) ctx.voiceManager.joinMic(micId);
    btn.classList.add('active');
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
  var muted = ctx.voiceManager ? ctx.voiceManager.toggleMute() : false;
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
  if (url && ctx.musicManager) ctx.musicManager.play(url);
});
registerAction('music-pause', function () { if (ctx.musicManager) ctx.musicManager.pause(); });
registerAction('music-stop', function () { if (ctx.musicManager) ctx.musicManager.stop(); });
registerAction('music-local-mute', function () {
  if (ctx.musicManager) ctx.musicManager.setVolume(ctx.musicManager.volume > 0 ? 0 : 0.5);
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
  if (name && ctx.privateChat) ctx.privateChat.openChat(name, name);
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
  if (!name) return;
  var doReveal = function () { emit('reveal:names', { name: name }); };
  if (window.Swal && window.Swal.fire) {
    window.Swal.fire({
      title: 'كشف النكات',
      html: 'يرجى العلم أنه يمنع منعاً باتاً مشاركة معلومات هذا العضو مع أي شخص آخر.<br>كشف النكات هي خاصية تنظيمية إدارية فقط لا غير.<br>خصوصية الأعضاء أمانة بين يديكم.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'نعم، كشف',
      cancelButtonText: 'إلغاء',
    }).then(function (res) {
      if (res && res.isConfirmed) doReveal();
    });
  } else if (window.confirm('يرجى العلم أنه يمنع منعاً باتاً مشاركة معلومات هذا العضو مع أي شخص آخر.\nكشف النكات هي خاصية تنظيمية إدارية فقط لا غير.\nخصوصية الأعضاء أمانة بين يديكم.')) {
    doReveal();
  }
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
  var ctxEl = document.getElementById('user-context-menu');
  var name = ctxEl ? ctxEl.getAttribute('data-username') : null;
  if (name) showProfile(name);
});
registerAction('ctx-pm', function () {
  var ctxEl = document.getElementById('user-context-menu');
  var name = ctxEl ? ctxEl.getAttribute('data-username') : null;
  if (name && ctx.privateChat) ctx.privateChat.openChat(name, name);
});
registerAction('ctx-ignore', function () {
  var ctxEl = document.getElementById('user-context-menu');
  var name = ctxEl ? ctxEl.getAttribute('data-username') : null;
  if (name) showToast('تم تجاهل ' + name, 'success');
});
registerAction('ctx-report', function () {
  var ctxEl = document.getElementById('user-context-menu');
  var name = ctxEl ? ctxEl.getAttribute('data-username') : null;
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

export function switchTab(tab) {
  state.setState('currentTab', tab);
  Object.keys(TAB_MAP).forEach(function (key) {
    var t = TAB_MAP[key];
    var btn = document.getElementById(t.btn);
    var panel = document.getElementById(t.panel);
    if (btn) btn.classList.toggle('active', key === tab);
    if (panel) panel.classList.toggle('d-none', key !== tab);
  });
}

export function closeSidebar() {
  var sidebar = document.getElementById('right-sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.add('d-none');
}

export function showAuthForm(formId) {
  ['member-login-form', 'guest-login-form', 'register-form'].forEach(function (id) {
    var f = document.getElementById(id);
    if (f) {
      if (id === formId) { f.classList.remove('hidden-form'); f.classList.add('visible-form'); }
      else { f.classList.remove('visible-form'); f.classList.add('hidden-form'); }
    }
  });
}

export function uploadImage(file, cb) {
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

export function bindSettingsUpload() {
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

export function openZajelModal() {
  var modal = document.getElementById('zajelSubmitModal');
  if (modal) {
    var bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }
}

export function submitZajelMsg() {
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

export function showReconnectBar() {
  var bar = document.getElementById('reconnect-status-bar');
  if (bar) bar.classList.remove('d-none');
}

export function hideReconnectBar() {
  var bar = document.getElementById('reconnect-status-bar');
  if (bar) bar.classList.add('d-none');
}

export function handleReconnectClose() {
  hideReconnectBar();
}

export function openActiveGamesView() {
  emit('game:active-list');
}

export function toggleFilterMonitorPanel() {
  var panel = document.getElementById('filter-monitor-panel');
  if (panel) panel.classList.toggle('open');
}

export function clearFilterMonitorLocal() {
  var messages = document.getElementById('filter-monitor-messages');
  if (messages) messages.innerHTML = '<p class="text-muted text-center py-4 my-2">لا يوجد رسائل مراقبة حالياً</p>';
}
