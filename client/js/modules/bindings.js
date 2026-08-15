import { emit } from './ctx.js';
import * as state from './state.js';
import { showToast } from './ui.js';
import { submitLogin, guestLogin, countryCode, deviceFp } from './auth.js';
import {
  getActionMap, closeSidebar, openZajelModal, submitZajelMsg,
  handleReconnectClose, openActiveGamesView, toggleFilterMonitorPanel,
  clearFilterMonitorLocal
} from './actions.js';
import {
  saveProfileNickname, saveProfileLikes, saveProfileGroup,
  saveProfileRep, saveProfileWallPoints, toggleAdminPanel
} from './profile.js';

/* Global delegated click handler: every [data-action] button */
var DELEGATED_ACTIONS_BOUND = false;
var FORMS_BOUND = false;

/* Global delegated click handler: every [data-action] button */
export function bindActions() {
  if (DELEGATED_ACTIONS_BOUND) return;
  DELEGATED_ACTIONS_BOUND = true;
  var ACTION_MAP = getActionMap();
  document.addEventListener('click', function (e) {
    var node = e.target;
    if (!node || typeof node.closest !== 'function') return;
    var target = node.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    var fn = ACTION_MAP[action];
    if (fn) {
      e.preventDefault();
      try {
        fn(target);
      } catch (err) {
        console.error('[action] handler failed for "' + action + '":', err);
      }
    } else {
      console.warn('Unmapped data-action:', action);
    }
  });
}

export function bindForms() {
  if (FORMS_BOUND) return;
  FORMS_BOUND = true;
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

export function bindSidebar() {
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

export function bindWindowFunctions() {
  window.togglePasswordVisibility = function (btn) {
    var input = btn.closest('.input-group') ? btn.closest('.input-group').querySelector('input[type="password"]') : null;
    if (input) {
      if (input.type === 'password') { input.type = 'text'; btn.innerHTML = '<i class="fas fa-eye-slash"></i>'; }
      else { input.type = 'password'; btn.innerHTML = '<i class="fas fa-eye"></i>'; }
    }
  };
  window.toggleHiddenMode = function (btn) {
    var hiddenInput = document.getElementById('login-hidden-input');
    if (hiddenInput) {
      var isHidden = hiddenInput.value === 'true';
      hiddenInput.value = isHidden ? 'false' : 'true';
      if (btn) btn.classList.toggle('active');
    }
  };
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
