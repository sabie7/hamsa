import { emit, getSocket } from './ctx.js';
import * as state from './state.js';
import { showToast } from './ui.js';

export function countryCode(selectId) {
  var sel = document.getElementById(selectId);
  return sel && sel.value ? sel.value : 'us';
}

export function deviceFp() {
  return navigator.userAgent + '|' + (screen.width + 'x' + screen.height) + '|' + navigator.language + '|' + (window.localStorage && localStorage.getItem('fp') || '');
}

export function login(username, password, isHidden) {
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

export function guestLogin(nickname) {
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

export function logout() {
  var s = getSocket();
  if (s && s.connected) s.emit('logout');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  state.setState('user', null);
  state.setState('token', null);
  window.location.reload();
}

export function submitLogin() {
  var usernameInput = document.getElementById('member-username');
  var passwordInput = document.getElementById('member-password');
  var hiddenInput = document.getElementById('login-hidden-input');
  if (!usernameInput || !passwordInput) return;
  var username = usernameInput.value.trim();
  var password = passwordInput.value;
  var isHidden = hiddenInput ? hiddenInput.value === 'true' : false;
  login(username, password, isHidden);
}

export function showProfile(userId) {
  if (!userId) return;
  emit('profile', { name: userId });
}

export function enterChat(user) {
  var overlay = document.getElementById('login-overlay');
  var chatShell = document.getElementById('chat-shell');
  if (overlay) overlay.classList.add('d-none');
  if (chatShell) chatShell.classList.remove('d-none');

  var headerName = document.getElementById('header-site-name');
  if (headerName && user && user.name) headerName.textContent = user.name;

  var s = getSocket();
  if (s) {
    s.emit('getextras');
    s.emit('getzajel');
    s.emit('getquickchat');
    s.emit('getwall');
    s.emit('game:active-list');
  }
}

export function togglePasswordVisibility(btn) {
  var input = btn.closest('.input-group') ? btn.closest('.input-group').querySelector('input[type="password"]') : null;
  if (input) {
    if (input.type === 'password') { input.type = 'text'; btn.innerHTML = '<i class="fas fa-eye-slash"></i>'; }
    else { input.type = 'password'; btn.innerHTML = '<i class="fas fa-eye"></i>'; }
  }
}

export function toggleHiddenMode(btn) {
  var hiddenInput = document.getElementById('login-hidden-input');
  if (hiddenInput) {
    var isHidden = hiddenInput.value === 'true';
    hiddenInput.value = isHidden ? 'false' : 'true';
    if (btn) btn.classList.toggle('active');
  }
}
