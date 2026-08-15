import ctx, { emit } from './ctx.js';
import * as state from './state.js';
import { showToast } from './ui.js';
import { enterChat, logout } from './auth.js';
import {
  renderMessage, renderSidebarUsers, renderLandingUsers, updateLandingCount,
  renderRooms, renderWallPosts, renderZajel, renderQuickChat
} from './rendering.js';
import { openProfileModal } from './profile.js';
import { announceGift } from './gifts.js';
import { onCarGameCreated, onCarGameAction, closeCarGame } from './car-game.js';
import { showReconnectBar, hideReconnectBar } from './actions.js';

/* ── Voice connection-state indicator (Phase 4) ── */
export function renderVoiceBadge(vstate) {
  var el = document.getElementById('voice-state-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'voice-state-badge';
    el.style.cssText = 'position:fixed;top:64px;right:16px;z-index:1080;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:700;color:#fff;display:none;';
    document.body.appendChild(el);
  }
  var map = { connecting: ['#f39c12', 'توصيل الصوت…'], connected: ['#27ae60', 'الصوت متصل'], reconnecting: ['#e67e22', 'إعادة الاتصال…'], failed: ['#e74c3c', 'فشل الاتصال الصوتي'], idle: ['', ''] };
  var cfg = map[vstate] || ['', ''];
  if (!cfg[0]) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.background = cfg[0];
  el.textContent = cfg[1];
}

export function handleVoiceError(err) {
  if (!err) return;
  if (err.code === 'SPEAKER_LIMIT' && err.msg) {
    showToast(err.msg, 'warning');
    if (ctx.voiceManager) {
      ctx.voiceManager.leaveMic();
      document.querySelectorAll('.btn-mic.active').forEach(function (m) { m.classList.remove('active'); });
    }
    return;
  }
  if (err.msg) showToast(err.msg, 'error');
}

export function initSocket() {
  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var host = window.location.host;
  var socket = io(protocol + '//' + host, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    timeout: 20000
  });
  state.setState('socket', socket);

  if (ctx.voiceManager) {
    try {
      ctx.voiceManager.attach(socket);
      ctx.voiceManager.setUiHandler(renderVoiceBadge);
      ctx.voiceManager.setErrorHandler(handleVoiceError);
    } catch (e) { console.error('[init] voice attach failed:', e); }
  }

  /* Server → client event handlers */
  var pingTimer = null;
  var reconnectBarVisible = false;

  function syncReconnectBar(visible) {
    if (visible === reconnectBarVisible) return;
    reconnectBarVisible = visible;
    if (visible) showReconnectBar(); else hideReconnectBar();
  }

  socket.on('connect', function () {
    var token = sessionStorage.getItem('token');
    if (token) socket.emit('istoken', token);
    syncReconnectBar(false);
    if (!pingTimer) {
      pingTimer = setInterval(function () { if (socket.connected) socket.emit('ping'); }, 25000);
    }
  });

  socket.on('disconnect', function (reason) {
    if (reason && reason !== 'io client disconnect') syncReconnectBar(true);
  });

  socket.on('connect_error', function () {
    syncReconnectBar(true);
  });

  socket.on('reconnect_attempt', function () {
    syncReconnectBar(true);
  });

  socket.on('reconnect', function () {
    syncReconnectBar(false);
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
      socket.userName = data.user.name;
      state.setState('user', data.user);
      sessionStorage.setItem('user', JSON.stringify(data.user));
      enterChat(data.user);
    }
    if (data && data.adminPower) {
      state.setState('adminPower', data.adminPower);
      if (document.getElementById('btn-profile-admin')) document.getElementById('btn-profile-admin').classList.remove('d-none');
      if (document.getElementById('btn-profile-reveal')) document.getElementById('btn-profile-reveal').style.setProperty('display', 'flex', 'important');
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
    if (item && item.user && ctx.privateChat) {
      ctx.privateChat.addMessage(item.from || item.user, item);
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

  socket.on('reveal:names', function (data) {
    var body = document.getElementById('reveal-nickname-table-body');
    if (!data || data.error) {
      showToast((data && data.error) || 'تعذر كشف النكات', 'error');
      return;
    }
    if (body) {
      body.innerHTML = '';
      (data.rows || []).forEach(function (r) {
        var tr = document.createElement('tr');
        [r.name, r.type, r.status, r.rank, r.match, r.source, r.ip, r.fp, r.device].forEach(function (c) {
          var td = document.createElement('td');
          td.textContent = c || '';
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }
    var modal = document.getElementById('revealNicknameModal');
    if (modal) {
      var bs = new bootstrap.Modal(modal);
      bs.show();
    }
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
}

export function loadInitialData() {
  var socket = state.getState().socket;
  if (socket) {
    socket.emit('getstate');
    socket.emit('get_site_info');
  }
}
