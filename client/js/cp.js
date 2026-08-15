/* ══════════════════════════════════════════════════════════════
   CONTROL PANEL (لوحة التحكم)
   Speaks the admin socket protocol defined in src/socket/admin.js:
     - socket.on('msg', {cmd:'getstate', data:{password}}) → 'message' payloads
     - socket.on('msg', {cmd:'admin', data:{cmd, pass, data}}) → adminAction
   Server replies arrive wrapped in 'message' events with a `cmd` field.
   ══════════════════════════════════════════════════════════════ */

var socket = io('/');
var connected = false;
var authed = false;

var state = {
  password: '',
  siteweb: {},
  dro3: [],
  emo: [],
  sico: [],
  powers: [],
  noletters: [],
  users: [],
  rooms: [],
  bands: [],
  shrt: [],
  msgs: [],
  subs: [],
  bans: { browsers: {}, systems: {} },
  health: {},
  audit: [],
  online: [],
  postsMod: [],
  storiesMod: [],
  roomProfile: null,
  userProfile: null
};

/* ─── Helpers ─── */

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function $(id) { return document.getElementById(id); }

function setStatus(msg, type) {
  var el = $('cp-msg');
  if (el) {
    el.textContent = msg;
    el.style.color = type === 'error' ? '#ffdddd' : type === 'ok' ? '#d4edda' : '#f8f9fa';
  }
}

function admin(cmd, data) {
  socket.emit('msg', { cmd: 'admin', data: { cmd: cmd, pass: state.password, data: data || {} } });
}

function getState() {
  socket.emit('msg', { cmd: 'getstate', data: { password: state.password } });
}

/* ─── Renderers ─── */

function renderSettings() {
  var s = state.siteweb || {};
  var set = function (id, val) { var el = $(id); if (el && val !== undefined) el.value = val; };
  set('s-name', s.name);
  set('s-title', s.title);
  set('s-bg', s.bg || '#40404f');
  set('s-buttons', s.buttons || '#f93634');
  set('s-background', s.background || '#40404f');
  set('s-msgst', s.msgst);
  var allowg = $('s-allowg'); if (allowg) allowg.checked = !!s.allowg;
  var allowreg = $('s-allowreg'); if (allowreg) allowreg.checked = !!s.allowreg;
}

function renderSeo() {
  var s = state.seo || {};
  var set = function (id, val) { var el = $(id); if (el && val !== undefined) el.value = val; };
  set('seo-siteName', s.siteName);
  set('seo-siteTitle', s.siteTitle);
  set('seo-siteDescription', s.siteDescription);
  set('seo-siteKeywords', s.siteKeywords);
  set('seo-canonicalUrl', s.canonicalUrl);
  set('seo-robotsMeta', s.robotsMeta || 'index, follow');
  set('seo-ogImage', s.ogImage);
  set('seo-twitterCard', s.twitterCard || 'summary_large_image');
  set('seo-themeColor', s.themeColor || '#794e4e');
  var en = $('seo-enableSitemap'); if (en) en.checked = s.enableSitemap !== false;
  var enr = $('seo-enableRobotsTxt'); if (enr) enr.checked = s.enableRobotsTxt !== false;
  var ni = $('seo-noindex'); if (ni) ni.checked = !!s.noindex;
}

function renderPowers() {
  var el = $('cp-powers-editor');
  if (!el) return;
  el.innerHTML = '';
  state.powers.forEach(function (p, idx) {
    var card = document.createElement('div');
    card.className = 'cp-card';
    card.innerHTML = '<div class="d-flex align-items-center gap-2 mb-2">' +
      '<label>الرتبة</label><input type="number" class="pw-rank" value="' + (p.rank || 0) + '" style="width:70px">' +
      '<label>الاسم</label><input class="pw-name" value="' + escapeHtml(p.name || '') + '" style="width:120px">' +
      '</div><div class="pw-flags d-flex flex-wrap gap-2" style="font-size:12px"></div>';
    var flagsBox = card.querySelector('.pw-flags');
    var flagKeys = ['kick', 'delbc', 'alert', 'mynick', 'unick', 'ban', 'publicmsg', 'forcepm', 'roomowner', 'createroom', 'rooms', 'edituser', 'setpower', 'upgrades', 'history', 'cp', 'stealth', 'owner', 'meiut', 'loveu', 'ulike', 'flter', 'subs', 'shrt', 'msgs', 'bootedit', 'grupes', 'delmsg', 'delpic'];
    flagKeys.forEach(function (key) {
      var label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:3px;';
      label.innerHTML = '<input type="checkbox" class="pw-flag" data-key="' + key + '"' + (p[key] ? ' checked' : '') + '> ' + key;
      flagsBox.appendChild(label);
    });
    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm btn-primary mt-2';
    saveBtn.textContent = '💾 حفظ الصلاحية';
    saveBtn.addEventListener('click', function () {
      var doc = {
        rank: parseInt(card.querySelector('.pw-rank').value, 10) || 0,
        name: card.querySelector('.pw-name').value,
        ico: p.ico || ''
      };
      card.querySelectorAll('.pw-flag').forEach(function (cb) { doc[cb.getAttribute('data-key')] = cb.checked ? 1 : 0; });
      admin('save_as', { powers: state.powers.map(function (old, i) { return i === idx ? doc : old; }) });
    });
    card.appendChild(saveBtn);
    el.appendChild(card);
  });
}

function renderUsers() {
  var tbody = $('cp-users-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.users.forEach(function (u) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + escapeHtml(u.topic || u.username || '') + '</td>' +
      '<td>' + escapeHtml(u.power || '') + '</td>' +
      '<td>' + escapeHtml(u.ip || '') + '</td>' +
      '<td>' + (u.documentationc ? '—' : '<button class="btn btn-sm btn-danger" data-act="ban">حظر</button>') + '</td>' +
      '<td>' +
      '<button class="btn btn-sm btn-success" data-act="edit">تعديل</button> ' +
      '<button class="btn btn-sm btn-warning" data-act="del">حذف</button> ' +
      '<button class="btn btn-sm btn-info" data-act="chpow">صلاحية</button>' +
      '</td>';
    tr.querySelector('[data-act="edit"]').addEventListener('click', function () {
      admin('get_user_profile', { topic: u.topic || u.username });
    });
    tr.querySelector('[data-act="ban"]') && tr.querySelector('[data-act="ban"]').addEventListener('click', function () {
      if (confirm('حظر ' + (u.topic || u.username) + '؟')) admin('save_band', { fp: u.fp || u.ip || '', ip: u.ip || '', reason: 'حظر من لوحة التحكم' });
    });
    tr.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (confirm('حذف ' + (u.topic || u.username) + ' نهائياً؟')) admin('delete_user', { name: u.topic || u.username });
    });
    tr.querySelector('[data-act="chpow"]').addEventListener('click', function () {
      var p = prompt('اسم الصلاحية الجديدة لـ ' + (u.topic || u.username) + ':', u.power || 'user');
      if (p) admin('setuserpower', { name: u.topic || u.username, power: p });
    });
    tbody.appendChild(tr);
  });
}

function renderUserProfile(u) {
  var el = $('cp-user-result');
  if (!el) return;
  var online = (state.online || []).some(function (o) { return o.username === u.username || o.username === u.topic; });
  el.innerHTML = '<div class="cp-card">' +
    '<h6>تعديل العضو: ' + escapeHtml(u.topic || u.username || '') + '</h6>' +
    '<div class="row">' +
    '<div class="col"><label>اسم المستخدم</label><input id="up-topic" value="' + escapeHtml(u.topic || '') + '"></div>' +
    '<div class="col"><label>الصلاحية</label><input id="up-power" value="' + escapeHtml(u.power || '') + '"></div>' +
    '<div class="col"><label>النقاط (rep)</label><input id="up-rep" type="number" value="' + (u.rep || 0) + '"></div>' +
    '<div class="col"><label>الإعجابات</label><input id="up-likes" type="number" value="' + (u.likes || 0) + '"></div>' +
    '</div>' +
    '<div class="row mt-2">' +
    '<div class="col"><label>العمولات (coins)</label><input id="up-coins" type="number" value="' + (u.coins || 0) + '"></div>' +
    '<div class="col"><label>نقاط الجدار</label><input id="up-wall" type="number" value="' + (u.wallPoints || 0) + '"></div>' +
    '<div class="col"><label>الدولة (كود)</label><input id="up-co" value="' + escapeHtml(u.co || '') + '"></div>' +
    '<div class="col"><label>الاشتراك</label><input id="up-membership" value="' + escapeHtml(u.memberShip || 'free') + '"></div>' +
    '</div>' +
    '<div class="row mt-2">' +
    '<div class="col"><label class="d-flex align-items-center gap-1"><input type="checkbox" id="up-verify"' + (u.verified ? ' checked' : '') + '> موثق</label></div>' +
    '<div class="col"><label>IP</label><input id="up-ip" value="' + escapeHtml(u.ip || '') + '" disabled></div>' +
    '<div class="col"><label>الجنس</label><input id="up-gender" value="' + escapeHtml(u.gender || '') + '"></div>' +
    '<div class="col"><label>كلمة مرور جديدة (اختياري)</label><input id="up-pass" type="password" placeholder="اتركه فارغاً للإبقاء"></div>' +
    '</div>' +
    '<button class="btn btn-primary btn-sm mt-2" data-action="cp-save-profile">💾 حفظ العضو</button>' +
    '</div>';
  if (online) {
    var kickBtn = document.createElement('button');
    kickBtn.className = 'btn btn-danger btn-sm mt-2 ms-1';
    kickBtn.textContent = 'طرد من الاتصال';
    kickBtn.addEventListener('click', function () { admin('cp_kick_user', { name: u.topic || u.username, reason: 'طرد من لوحة التحكم' }); });
    el.querySelector('.cp-card').appendChild(kickBtn);
  }
}

function renderBans() {
  var tbody = $('cp-ban-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.bands.forEach(function (b) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + escapeHtml(b.device_band || b.ip_band || '') + '</td>' +
      '<td>' + escapeHtml(b.date || '') + '</td>' +
      '<td>' + escapeHtml(b.name_band || '') + '</td>' +
      '<td><button class="btn btn-sm btn-danger" data-id="' + (b._id || '') + '" data-dev="' + escapeHtml(b.device_band || '') + '" data-ip="' + escapeHtml(b.ip_band || '') + '">إلغاء</button></td>';
    tr.querySelector('button').addEventListener('click', function () {
      socket.emit('msg', { cmd: 'delBand', data: { id: this.getAttribute('data-id') } });
      admin('delete_band', { fp: this.getAttribute('data-dev'), ip: this.getAttribute('data-ip') });
    });
    tbody.appendChild(tr);
  });
}

function renderBrowserBans() {
  var el = $('cp-browser-bans');
  if (!el) return;
  var defs = { browser_all: 'الكل', browser1: 'Chrome', browser2: 'Firefox', browser3: 'Safari', browser4: 'Opera', browser6: 'Edge' };
  el.innerHTML = '';
  Object.keys(defs).forEach(function (key) {
    var label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:4px;';
    var cur = state.bans.browsers || {};
    label.innerHTML = '<input type="checkbox" class="bb" data-key="' + key + '"' + (cur[key] === false ? '' : cur[key] === true ? ' checked' : '') + '> ' + defs[key];
    el.appendChild(label);
  });
}

function renderOsBans() {
  var el = $('cp-os-bans');
  if (!el) return;
  var defs = { system_all: 'الكل', system1: 'Windows', system2: 'Linux', system3: 'Android', system4: 'iOS', system5: 'Mac OS' };
  el.innerHTML = '';
  Object.keys(defs).forEach(function (key) {
    var label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:4px;';
    var cur = state.bans.systems || {};
    label.innerHTML = '<input type="checkbox" class="so" data-key="' + key + '"' + (cur[key] === false ? '' : cur[key] === true ? ' checked' : '') + '> ' + defs[key];
    el.appendChild(label);
  });
}

function renderRooms() {
  var tbody = $('cp-rooms-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.rooms.forEach(function (r) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + escapeHtml(r.name || '') + '</td>' +
      '<td>' + escapeHtml(r.owner || r.roomOwner || '') + '</td>' +
      '<td>' + (r.hasPassword || r.password ? '🔒' : '—') + '</td>' +
      '<td>' + (r.isActive ? 'نعم' : 'لا') + '</td>' +
      '<td>' + (r.isLocked ? 'نعم' : 'لا') + '</td>' +
      '<td>' +
      '<button class="btn btn-sm btn-info" data-edit="1">تعديل</button> ' +
      '<button class="btn btn-sm btn-danger">حذف</button>' +
      '</td>';
    tr.querySelector('[data-edit="1"]').addEventListener('click', function () {
      admin('get_room_profile', { id: r.id });
    });
    tr.querySelector('button:last-child').addEventListener('click', function () {
      if (confirm('حذف غرفة ' + r.name + '؟')) admin('delete_room', { id: r.id });
    });
    tbody.appendChild(tr);
  });
}

function renderFilter() {
  var el = $('cp-fltr-list');
  if (!el) return;
  el.innerHTML = '';
  state.noletters.forEach(function (n) {
    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = escapeHtml(n.v || '') + ' <span class="del" title="حذف">✕</span>';
    tag.querySelector('.del').addEventListener('click', function () {
      admin('fltr_del', { value: n.v });
    });
    el.appendChild(tag);
  });
}

function renderMessages() {
  var el = $('cp-msg-list');
  if (!el) return;
  el.innerHTML = '';
  state.msgs.forEach(function (m) {
    var row = document.createElement('div');
    row.className = 'cp-card';
    row.innerHTML = '<strong>' + escapeHtml(m.adresse || '') + '</strong><div class="small">' + escapeHtml(m.msg || '') + '</div><button class="btn btn-sm btn-danger mt-1">حذف</button>';
    row.querySelector('button').addEventListener('click', function () {
      admin('msg_del', { adresse: m.adresse, msg: m.msg });
    });
    el.appendChild(row);
  });
}

function renderShortcuts() {
  var el = $('cp-shrt-list');
  if (!el) return;
  el.innerHTML = '';
  state.shrt.forEach(function (s) {
    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = '<b>' + escapeHtml(s.name || '') + '</b> = ' + escapeHtml(String(s.value || '').substring(0, 20)) + ' <span class="del" title="حذف">✕</span>';
    tag.querySelector('.del').addEventListener('click', function () {
      admin('shrt_del', { name: s.name });
    });
    el.appendChild(tag);
  });
}

function renderSubs() {
  var tbody = $('cp-subs-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.subs.forEach(function (s) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + escapeHtml(s.topic || s.topic1 || '') + '</td>' +
      '<td>' + escapeHtml(s.sub || '') + '</td>' +
      '<td>' + escapeHtml(s.time || '') + '</td>' +
      '<td><button class="btn btn-sm btn-danger">حذف</button></td>';
    tr.querySelector('button').addEventListener('click', function () {
      admin('subs_del', { iduser: s.iduser });
    });
    tbody.appendChild(tr);
  });
}

function renderOnline() {
  var tbody = $('cp-live-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!state.online.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted">لا يوجد متصلون حالياً</td></tr>';
    return;
  }
  state.online.forEach(function (u) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(u.username) + (u.guest ? ' <span class="tag">زائر</span>' : '') + '</td>' +
      '<td>' + escapeHtml(u.power || 'user') + '</td>' +
      '<td>' + escapeHtml(u.roomName || '') + '</td>' +
      '<td>' + escapeHtml(u.ip || '') + '</td>' +
      '<td>' + (u.idle ? '<span class="muted">خامل</span>' : '<span>نشط</span>') + '</td>' +
      '<td>' +
      '<button class="btn btn-sm btn-warning" data-act="mute">كتم</button> ' +
      '<button class="btn btn-sm btn-danger" data-act="kick">طرد</button> ' +
      '<button class="btn btn-sm btn-danger" data-act="ban">حظر</button>' +
      '</td>';
    tr.querySelector('[data-act="mute"]').addEventListener('click', function () {
      var ms = prompt('مدة الكتم بالدقائق:', '10');
      if (ms !== null) admin('cp_mute_user', { name: u.username, roomId: u.roomid, ms: (parseInt(ms, 10) || 10) * 60000, reason: 'كتم من لوحة التحكم' });
    });
    tr.querySelector('[data-act="kick"]').addEventListener('click', function () {
      if (confirm('طرد ' + u.username + '؟')) admin('cp_kick_user', { name: u.username, reason: 'طرد من لوحة التحكم' });
    });
    tr.querySelector('[data-act="ban"]').addEventListener('click', function () {
      if (confirm('حظر ' + u.username + '؟')) admin('cp_ban_online', { name: u.username, reason: 'حظر من لوحة التحكم' });
    });
    tbody.appendChild(tr);
  });
}

function renderModeration() {
  renderModPosts();
  renderModStories();
}

function renderModPosts() {
  var tbody = $('cp-mod-posts');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!state.postsMod.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-muted">لا توجد منشورات</td></tr>'; return; }
  state.postsMod.forEach(function (p) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(p.username || '') + '</td>' +
      '<td>' + escapeHtml((p.text || '').substring(0, 60)) + '</td>' +
      '<td>❤️ ' + (p.likes || 0) + ' | 💬 ' + (p.comments || 0) + '</td>' +
      '<td>' + escapeHtml((p.createdAt || '').replace('T', ' ').replace('Z', '')) + '</td>' +
      '<td><button class="btn btn-sm btn-danger">حذف</button></td>';
    tr.querySelector('button').addEventListener('click', function () {
      if (confirm('حذف منشور ' + (p.username || '') + '؟')) admin('del_post', { postId: p.id });
    });
    tbody.appendChild(tr);
  });
}

function renderModStories() {
  var tbody = $('cp-mod-stories');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!state.storiesMod.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-muted">لا توجد ستوريات</td></tr>'; return; }
  state.storiesMod.forEach(function (s) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(s.username || '') + '</td>' +
      '<td>' + escapeHtml((s.text || '').substring(0, 50)) + '</td>' +
      '<td>' + (s.views || 0) + '</td>' +
      '<td>' + (s.likes || 0) + '</td>' +
      '<td>' + escapeHtml((s.createdAt || '').replace('T', ' ').replace('Z', '')) + '</td>' +
      '<td><button class="btn btn-sm btn-danger">حذف</button></td>';
    tr.querySelector('button').addEventListener('click', function () {
      if (confirm('حذف ستوري ' + (s.username || '') + '؟')) admin('del_story', { storyId: s.id });
    });
    tbody.appendChild(tr);
  });
}

function renderRoomEditor() {
  var el = $('cp-room-editor');
  if (!el) return;
  var r = state.roomProfile;
  if (!r) { el.innerHTML = ''; return; }
  el.innerHTML = '<h6 class="mt-2">تعديل الغرفة: ' + escapeHtml(r.name || '') + '</h6>' +
    '<div class="row">' +
    '<div class="col"><label>الاسم</label><input id="cp-re-name" value="' + escapeHtml(r.name || '') + '"></div>' +
    '<div class="col"><label>كلمة المرور (فارغ للإزالة)</label><input id="cp-re-pass" type="password" value="' + escapeHtml(r.password || '') + '" placeholder="' + (r.hasPassword ? 'موجودة حالياً' : 'لا توجد') + '"></div>' +
    '<div class="col"><label>المالك</label><input id="cp-re-owner" value="' + escapeHtml(r.owner || r.roomOwner || '') + '"></div>' +
    '<div class="col"><label>عدد المكالمات/الكاميرات</label><input id="cp-re-cap" type="number" value="' + (r.capacity || 0) + '"></div>' +
    '</div>' +
    '<div class="row mt-2">' +
    '<div class="col"><label>مستوى الغرفة</label><input id="cp-re-level" type="number" value="' + (r.roomLevel || 0) + '"></div>' +
    '<div class="col"><label>نقاط الإعجاب المطلوبة</label><input id="cp-re-likes" type="number" value="' + (r.requiredLikes || 0) + '"></div>' +
    '<div class="col"><label>ماكس مايكات</label><input id="cp-re-mics" type="number" value="' + (r.roomMaxMicSlots || 4) + '"></div>' +
    '<div class="col"><label>الوصف</label><input id="cp-re-desc" value="' + escapeHtml(r.roomDescription || '') + '"></div>' +
    '</div>' +
    '<div class="row mt-2">' +
    '<div class="col"><label class="d-flex align-items-center gap-1"><input type="checkbox" id="cp-re-active"' + (r.isActive ? ' checked' : '') + '> نشطة</label></div>' +
    '<div class="col"><label class="d-flex align-items-center gap-1"><input type="checkbox" id="cp-re-cam"' + (r.allowCamera ? ' checked' : '') + '> كاميرا</label></div>' +
    '<div class="col"><label class="d-flex align-items-center gap-1"><input type="checkbox" id="cp-re-broadcast"' + (r.allowBroadcast ? ' checked' : '') + '> بث مباشر</label></div>' +
    '<div class="col"><label class="d-flex align-items-center gap-1"><input type="checkbox" id="cp-re-chat"' + (r.disableChat ? ' checked' : '') + '> تعطيل الدردشة</label></div>' +
    '</div>' +
    '<div class="mt-2 d-flex gap-2 flex-wrap">' +
    '<button class="btn btn-primary btn-sm" data-action="cp-save-room">💾 حفظ الغرفة</button>' +
    '<button class="btn btn-info btn-sm" data-action="cp-clear-room-chat">🧹 مسح المحادثة</button>' +
    '</div>' +
    '<div class="mt-2">' +
    '<label>المشرفون (افصل بالفواصل):</label>' +
    '<input id="cp-re-mods" value="' + escapeHtml((r.moderators || []).join('، ')) + '">' +
    '</div>' +
    '<div class="mt-2">' +
    '<button class="btn btn-success btn-sm" data-action="cp-add-mod">👮 إضافة مشرف (من خانة أعلاه)</button>' +
    '<button class="btn btn-warning btn-sm ms-1" data-action="cp-del-mod">👮 إزالة مشرف</button>' +
    '</div>';
}

function renderFps(logs) {
  var el = $('cp-fp-list');
  if (!el) return;
  el.innerHTML = '';
  (logs || []).forEach(function (l) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + escapeHtml(l.topic || '') + '</td><td>' + escapeHtml(l.ip || '') + '</td><td>' + escapeHtml(l.time || '') + '</td>';
    el.appendChild(tr);
  });
}

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(1) + ' ' + units[i];
}

function fmtUptime(sec) {
  if (!sec && sec !== 0) return '—';
  var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  var out = [];
  if (d) out.push(d + ' يوم');
  if (h) out.push(h + ' س');
  if (m) out.push(m + ' د');
  return out.length ? out.join(' ') : (Math.floor(sec) + ' ث');
}

function renderHealth() {
  var h = state.health || {};
  var set = function (id, val) { var el = $(id); if (el) el.textContent = val; };
  set('h-users', h.connectedUsers !== undefined ? h.connectedUsers : '—');
  set('h-online', h.onlineCount !== undefined ? h.onlineCount : '—');
  set('h-rooms', h.activeRooms !== undefined ? h.activeRooms : '—');
  set('h-rooms-online', h.roomsOnline !== undefined ? h.roomsOnline : '—');
  set('h-db', h.dbStatus === 'mongo' ? 'MongoDB' : h.dbStatus === 'memory' ? 'ذاكرة مؤقتة' : '—');
  set('h-mem', h.memory ? fmtBytes(h.memory.rss) : '—');
  set('h-uptime', fmtUptime(h.uptime));
  set('h-node', h.node || '—');
}

function renderAudit() {
  var tbody = $('cp-audit-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  (state.audit || []).forEach(function (e) {
    var tr = document.createElement('tr');
    var short = function (o) {
      if (o === null || o === undefined) return '—';
      var s = typeof o === 'string' ? o : JSON.stringify(o);
      return escapeHtml(s.length > 60 ? s.substring(0, 60) + '…' : s);
    };
    tr.innerHTML = '<td>' + escapeHtml((e.when || '').replace('T', ' ').replace('Z', '')) + '</td>' +
      '<td>' + escapeHtml(e.actor || '') + '</td>' +
      '<td>' + escapeHtml(e.action || '') + '</td>' +
      '<td>' + escapeHtml(e.target || '') + '</td>' +
      '<td>' + short(e.before) + '</td>' +
      '<td>' + short(e.after) + '</td>';
    tbody.appendChild(tr);
  });
  if (!state.audit || !state.audit.length) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" class="text-muted">لا توجد سجلات بعد</td>';
    tbody.appendChild(tr);
  }
}

function renderAll() {
  renderSettings();
  renderPowers();
  renderUsers();
  renderBans();
  renderBrowserBans();
  renderOsBans();
  renderRooms();
  renderFilter();
  renderMessages();
  renderShortcuts();
  renderSubs();
  renderOnline();
  renderModeration();
  renderRoomEditor();
}

/* ─── Server → client 'message' protocol handler ─── */

socket.on('connect', function () {
  connected = true;
  setStatus('متصل — أدخل كلمة المرور واضغط اتصال');
  var saved = sessionStorage.getItem('cp-pass');
  if (saved) { $('cp-pass').value = saved; doConnect(); }
});

socket.on('disconnect', function () {
  connected = false;
  authed = false;
  setStatus('انقطع الاتصال');
});

socket.on('message', function (msg) {
  if (!msg || !msg.cmd) return;
  switch (msg.cmd) {
    case 'error_list':
      authed = false;
      setStatus(msg.data && msg.data.msg ? msg.data.msg : 'كلمة المرور غير صحيحة', 'error');
      break;
    case 'siteweb': state.siteweb = msg.data || {}; renderSettings(); break;
    case 'dro3': state.dro3 = msg.data || []; break;
    case 'emos': state.emo = msg.data || []; break;
    case 'sicos': state.sico = msg.data || []; break;
    case 'powers': state.powers = msg.data || []; renderPowers(); break;
    case 'noletters': state.noletters = msg.data || []; renderFilter(); break;
    case 'zaker': break;
    case 'users_data': state.users = msg.data || []; renderUsers(); break;
    case 'rlist': state.rooms = msg.data || []; renderRooms(); break;
    case 'band_list': state.bands = msg.data || []; renderBans(); break;
    case 'setbansystem': state.bans = msg.data || state.bans; renderBrowserBans(); renderOsBans(); break;
    case 'shrtlist': state.shrt = msg.data || []; renderShortcuts(); break;
    case 'msgslist': state.msgs = msg.data || []; renderMessages(); break;
    case 'subslist': state.subs = msg.data || []; renderSubs(); break;
    case 'online_usrs': state.online = msg.data || []; renderOnline(); break;
    case 'posts_moderation': state.postsMod = msg.data || []; renderModPosts(); break;
    case 'stories_moderation': state.storiesMod = msg.data || []; renderModStories(); break;
    case 'user_profile': state.userProfile = msg.data || null; renderUserProfile(msg.data); break;
    case 'room_profile': state.roomProfile = msg.data || null; renderRoomEditor(); break;
    case 'seo': state.seo = msg.data || {}; renderSeo(); break;
    case 'seo_saved': state.seo = msg.data || {}; renderSeo(); break;
    default:
      if (!authed) break;
  }
});

socket.on('savedone', function (data) {
  setStatus(data && data.msg ? data.msg : 'تم الحفظ ✓', 'ok');
  getState();
});

socket.on('error-msg', function (data) {
  setStatus(data && data.msg ? data.msg : 'خطأ', 'error');
});

socket.on('fpslist', function (logs) {
  renderFps(logs);
});

socket.on('user_data', function (u) {
  var el = $('cp-user-result');
  if (!el) return;
  if (!u) { el.innerHTML = '<div class="text-muted">لا يوجد مستخدم</div>'; return; }
  el.innerHTML = '<div class="cp-card"><strong>' + escapeHtml(u.topic || '') + '</strong> — IP: ' + escapeHtml(u.ip || '') +
    '<div class="small">الصلاحية: ' + escapeHtml(u.power || '') + ' | النقاط: ' + (u.rep || 0) + '</div></div>';
});

socket.on('done_band', function () { setStatus('تم الحظر ✓', 'ok'); getState(); });

socket.on('system_health', function (h) { state.health = h || {}; renderHealth(); });

socket.on('auditlog', function (list) { state.audit = list || []; renderAudit(); });

/* ─── Actions ─── */

function doConnect() {
  var pass = $('cp-pass').value.trim();
  if (!pass) { setStatus('أدخل كلمة المرور', 'error'); return; }
  state.password = pass;
  sessionStorage.setItem('cp-pass', pass);
  setStatus('جاري التحقق...');
  getState();
}

var ACTIONS = {
  'cp-connect': function () { doConnect(); },
  'cp-save-sett': function () {
    admin('save_state', {
      name: $('s-name').value,
      title: $('s-title').value,
      bg: $('s-bg').value,
      buttons: $('s-buttons').value,
      background: $('s-background').value,
      msgst: $('s-msgst').value,
      allowg: !!$('s-allowg').checked,
      allowreg: !!$('s-allowreg').checked
    });
  },
  'cp-save-seo': function () {
    admin('save_seo', {
      siteName: $('seo-siteName').value,
      siteTitle: $('seo-siteTitle').value,
      siteDescription: $('seo-siteDescription').value,
      siteKeywords: $('seo-siteKeywords').value,
      canonicalUrl: $('seo-canonicalUrl').value,
      robotsMeta: $('seo-robotsMeta').value,
      ogImage: $('seo-ogImage').value,
      twitterCard: $('seo-twitterCard').value,
      themeColor: $('seo-themeColor').value,
      enableSitemap: !!$('seo-enableSitemap').checked,
      enableRobotsTxt: !!$('seo-enableRobotsTxt').checked,
      noindex: !!$('seo-noindex').checked
    });
  },
  'cp-upload-emo': function () { uploadJson('cp-emo-file', 'save_emo'); },
  'cp-upload-dro3': function () { uploadJson('cp-dro3-file', 'save_dro3'); },
  'cp-upload-sico': function () { uploadJson('cp-sico-file', 'save_sico'); },
  'cp-user-search': function () {
    var q = $('cp-user-search').value.trim();
    if (q) admin('get_user', { topic: q });
  },
  'cp-save-browser-bans': function () {
    var browsers = {};
    document.querySelectorAll('.bb').forEach(function (cb) { browsers[cb.getAttribute('data-key')] = cb.checked; });
    admin('save_browser_bans', { browser: browsers });
  },
  'cp-save-os-bans': function () {
    var systems = {};
    document.querySelectorAll('.so').forEach(function (cb) { systems[cb.getAttribute('data-key')] = cb.checked; });
    admin('save_system_bans', { os: systems });
  },
  'cp-add-ban': function () {
    var val = $('cp-ban-input').value.trim();
    var reason = $('cp-ban-reason').value.trim() || 'مخالفة القوانين';
    if (val) {
      var isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(val);
      admin('save_band', { fp: val, ip: isIp ? val : '', reason: reason });
      $('cp-ban-input').value = '';
    }
  },
  'cp-fltr-block': function () {
    var v = $('cp-fltr-input').value.trim();
    if (v) { admin('fltr_add', { value: v, type: 'bmsgs' }); $('cp-fltr-input').value = ''; }
  },
  'cp-fltr-allow': function () {
    var v = $('cp-fltr-input').value.trim();
    if (v) { admin('fltr_del', { value: v }); $('cp-fltr-input').value = ''; }
  },
  'cp-msg-welcome': function () {
    addMessage('w');
  },
  'cp-msg-daily': function () {
    addMessage('d');
  },
  'cp-shrt-add': function () {
    var name = $('cp-shrt-name').value.trim();
    var value = $('cp-shrt-value').value.trim();
    if (name && value) { admin('shrt_add', { name: name, value: value }); $('cp-shrt-name').value = ''; $('cp-shrt-value').value = ''; }
  },
  'cp-subs-add': function () {
    var user = $('cp-subs-user').value.trim();
    var power = $('cp-subs-power').value.trim();
    if (user && power) {
      admin('subs_add', { iduser: user, topic: user, topic1: user, sub: power, timeis: Date.now() });
      $('cp-subs-user').value = ''; $('cp-subs-power').value = ''; $('cp-subs-days').value = '';
    }
  },
  'cp-cmd-delete-fps': function () { if (confirm('حذف سجل الدخول؟')) admin('delete_fps'); },
  'cp-cmd-delete-actions': function () { if (confirm('حذف سجل الإجراءات؟')) admin('delete_actions'); },
  'cp-cmd-reload': function () { admin('reload_site'); },
  'cp-backup': function () { admin('backup'); },
  'cp-restore': function () { if (confirm('استعادة آخر نسخة احتياطية؟')) admin('restore'); },
  'cp-refresh-health': function () { admin('get_system_health'); },
  'cp-refresh-audit': function () { admin('get_auditlog'); },
  'cp-refresh-live': function () { admin('get_online_users'); },
  'cp-refresh-mod': function () { admin('get_posts_moderation'); admin('get_stories_moderation'); },
  'cp-add-room': function () {
    var n = ($('cp-room-name') && $('cp-room-name').value.trim()) || '';
    if (n) { admin('add_room', { name: n }); $('cp-room-name').value = ''; }
  },
  'cp-save-room': function () {
    var r = state.roomProfile;
    if (!r) return;
    admin('edit_room_full', {
      id: r.id,
      name: $('cp-re-name').value,
      owner: $('cp-re-owner').value,
      roomPassword: $('cp-re-pass').value,
      removePassword: $('cp-re-pass').value ? 'false' : 'true',
      capacity: $('cp-re-cap').value,
      roomLevel: $('cp-re-level').value,
      requiredLikes: $('cp-re-likes').value,
      roomMaxMicSlots: $('cp-re-mics').value,
      roomDescription: $('cp-re-desc').value,
      isActive: !!$('cp-re-active').checked,
      allowCamera: !!$('cp-re-cam').checked,
      allowBroadcast: !!$('cp-re-broadcast').checked,
      disableChat: !!$('cp-re-chat').checked
    });
  },
  'cp-clear-room-chat': function () {
    var r = state.roomProfile;
    if (r && confirm('مسح محادثة الغرفة ' + r.name + '؟')) admin('clear_room_chat', { id: r.id });
  },
  'cp-add-mod': function () {
    var r = state.roomProfile;
    var name = ($('cp-re-mods') && $('cp-re-mods').value.trim().split(/[،,]/)[0]) || '';
    if (r && name) admin('add_room_moderator', { id: r.id, username: name });
  },
  'cp-del-mod': function () {
    var r = state.roomProfile;
    var name = ($('cp-re-mods') && $('cp-re-mods').value.trim().split(/[،,]/)[0]) || '';
    if (r && name) admin('del_room_moderator', { id: r.id, username: name });
  },
  'cp-save-profile': function () {
    var topic = ($('up-topic') && $('up-topic').value.trim()) || '';
    var original = (state.userProfile && (state.userProfile.topic || state.userProfile.username)) || '';
    if (!topic) return;
    var data = {
      topic: topic,
      power: ($('up-power') && $('up-power').value.trim()) || 'user',
      rep: ($('up-rep') && $('up-rep').value) || 0,
      likes: ($('up-likes') && $('up-likes').value) || 0,
      coins: ($('up-coins') && $('up-coins').value) || 0,
      wallPoints: ($('up-wall') && $('up-wall').value) || 0,
      co: ($('up-co') && $('up-co').value.trim()) || '',
      memberShip: ($('up-membership') && $('up-membership').value.trim()) || 'free',
      verified: !!( $('up-verify') && $('up-verify').checked),
      gender: ($('up-gender') && $('up-gender').value.trim()) || ''
    };
    var pw = $('up-pass') && $('up-pass').value.trim();
    if (pw) data.password = pw;
    if (original) data.original = original;
    admin('edit_user_profile', data);
  },
  'cp-broadcast': function () {
    var msg = ($('cp-broadcast-msg') && $('cp-broadcast-msg').value.trim()) || '';
    if (msg) { admin('broadcast_msg', { msg: msg }); $('cp-broadcast-msg').value = ''; }
  }
};

function addMessage(category) {
  var title = $('cp-msg-title').value.trim();
  var body = $('cp-msg-body').value.trim();
  if (body) {
    admin('msg_add', { category: category, adresse: title, msg: body });
    $('cp-msg-title').value = ''; $('cp-msg-body').value = '';
  }
}

function uploadJson(inputId, cmd) {
  var input = $(inputId);
  if (!input || !input.files || !input.files[0]) { setStatus('اختر ملف JSON أولاً', 'error'); return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var data = JSON.parse(e.target.result);
      if (Array.isArray(data)) admin(cmd, data);
      else if (data && Array.isArray(data.data)) admin(cmd, data.data);
      else { setStatus('صيغة JSON غير صالحة', 'error'); return; }
    } catch (err) { setStatus('فشل قراءة JSON', 'error'); }
  };
  reader.readAsText(input.files[0]);
}

/* ─── Bind ─── */

document.addEventListener('click', function (e) {
  var target = e.target.closest('[data-action]');
  if (!target) return;
  var action = target.getAttribute('data-action');
  var fn = ACTIONS[action];
  if (fn) { e.preventDefault(); fn(); }
});

document.querySelectorAll('#cp-sidebar .nav-item').forEach(function (item) {
  item.addEventListener('click', function () {
    document.querySelectorAll('#cp-sidebar .nav-item').forEach(function (i) { i.classList.remove('active'); });
    item.classList.add('active');
    document.querySelectorAll('.cp-section').forEach(function (s) { s.classList.remove('active'); });
    var tab = $('cp-' + item.getAttribute('data-tab'));
    if (tab) tab.classList.add('active');
    if (authed) {
      if (item.getAttribute('data-tab') === 'health') admin('get_system_health');
      if (item.getAttribute('data-tab') === 'audit') admin('get_auditlog');
      if (item.getAttribute('data-tab') === 'live') admin('get_online_users');
      if (item.getAttribute('data-tab') === 'mod') admin('get_posts_moderation'), admin('get_stories_moderation');
      if (item.getAttribute('data-tab') === 'rooms') admin('get_room_profile', { id: (state.roomProfile && state.roomProfile.id) || (state.rooms[0] && state.rooms[0].id) });
      if (item.getAttribute('data-tab') === 'seo') admin('get_seo');
    }
  });
});

$('cp-fp-search').addEventListener('input', function () {
  var q = this.value.trim();
  if (q) socket.emit('msg', { cmd: 'admin', data: { cmd: 'get_fps', pass: state.password, data: { search: q } } });
  else socket.emit('msg', { cmd: 'admin', data: { cmd: 'get_fps', pass: state.password, data: {} } });
});

if (!connected) setStatus('جاري الاتصال...');
