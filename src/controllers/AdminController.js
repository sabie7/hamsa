var logger = require('../logger');
var path = require('path');
var bcrypt = require('bcryptjs');
var guard = require('../socket/guard');

var AUDIT_MAX = 5000;

function AdminController(io, socket, db, state, rateLimiter) {
  this.io = io;
  this.socket = socket;
  this.db = db;
  this.state = state;
  this.adminPass = state.adminPass;
  this.adminUser = state.adminUser || (require('../config').adminUser);
  this.rateLimiter = rateLimiter;
  this._adminHash = null;
}

AdminController.prototype._clone = function (obj) {
  if (obj === null || obj === undefined) return obj;
  try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
};

// Write one entry into the dedicated AdminAuditLog collection (Phase 5):
// who, what, on whom, when, and the before/after value.
AdminController.prototype.audit = function (action, target, before, after, detail) {
  try {
    var entry = {
      actor: this.adminUser || 'admin',
      ip: (this.socket && this.socket.handshake && this.socket.handshake.address) || '',
      action: action,
      target: target !== undefined && target !== null ? String(target) : '',
      before: this._clone(before),
      after: this._clone(after),
      detail: this._clone(detail) || {},
      when: new Date().toISOString(),
    };
    this.db.auditlog.create(entry);
    // Keep the collection bounded (drop the oldest entries beyond the cap).
    var all = this.db.auditlog.getAll();
    if (all.length > AUDIT_MAX) this.db.auditlog.setAll(all.slice(all.length - AUDIT_MAX));
  } catch (e) {
    logger.error('admin.audit', 'Failed to write audit log', { error: e.message });
  }
};

AdminController.prototype.authOk = function (pass) {
  if (!pass) return false;
  // Verify against the stored bcrypt hash of the admin account so that
  // passwords are never compared in plaintext. Falls back to the env value
  // only if the admin record has no usable hash yet.
  try {
    if (!this._adminHash) {
      var adminUser = this.db.users.findOne({ isAdmin: true }) || this.db.users.findOne({ topic: this.adminUser });
      if (adminUser && adminUser.password) this._adminHash = adminUser.password;
    }
    if (this._adminHash && (this._adminHash.slice(0, 4) === '$2a$' || this._adminHash.slice(0, 4) === '$2b$')) {
      return bcrypt.compareSync(pass, this._adminHash);
    }
  } catch (e) { logger.warn('admin.authOk', 'Hash lookup failed, falling back to env compare', { error: e.message }); }
  return pass === this.adminPass;
};

AdminController.prototype.savedone = function (msg) {
  this.socket.emit('savedone', msg || {});
};

// Snapshot the pre-state for sensitive commands so audit entries can record
// before/after. Returns null for read-only or non-sensitive commands and for
// no-op calls (nothing actually changed) to keep the log free of noise.
AdminController.prototype._auditCaptureBefore = function (cmd, a) {
  var db = this.db, state = this.state;
  switch (cmd) {
    case 'save_state': return { action: cmd, target: 'siteweb', before: this._clone(state.settings.siteweb) };
    case 'save_band': return { action: cmd, target: (a && (a.fp || a.ip)) || '', before: null };
    case 'delete_band': {
      var existing = null;
      if (a && a.fp) existing = db.bands.findOne({ device_band: a.fp });
      if (!existing && a && a.ip) existing = db.bands.findOne({ ip_band: a.ip });
      if (!existing) return null;
      return { action: cmd, target: (a && (a.fp || a.ip)) || '', before: existing };
    }
    case 'delete_room': {
      if (!a || !a.id) return null;
      var r = db.rooms.findOne({ id: a.id });
      if (!r) return null;
      return { action: cmd, target: a.id, before: { id: r.id, name: r.name, owner: r.owner } };
    }
    case 'save_as': { var p = db.powers.find({}); return { action: cmd, target: 'powers', before: p.length ? p[0].powers : null }; }
    case 'setuserpower': {
      var u = a && a.name ? db.users.findOne({ topic: a.name }) : null;
      return { action: cmd, target: a && a.name, before: u ? { power: u.power } : null };
    }
    case 'delete_user': {
      var u = a && a.name ? db.users.findOne({ topic: a.name }) : null;
      if (!u) return null;
      return { action: cmd, target: a.name, before: { topic: u.topic, ip: u.ip, power: u.power } };
    }
    case 'edit_user': {
      var u = a && a.topic ? db.users.findOne({ topic: a.topic }) : null;
      return { action: cmd, target: a && a.topic, before: u ? { topic: u.topic, ip: u.ip, power: u.power } : null };
    }
    case 'fltr_add': return { action: cmd, target: a && a.value, before: null };
    case 'fltr_del': {
      var f = a && a.value ? (db.noletters.getAll() || []).filter(function (x) { return x.v === a.value; })[0] : null;
      if (!f) return null;
      return { action: cmd, target: a.value, before: f };
    }
    case 'shrt_add': return { action: cmd, target: a && a.name, before: null };
    case 'shrt_del': {
      var shrtDoc = db.settings.find({})[0] || {};
      var sh = (shrtDoc.shrt || []).filter(function (x) { return x.name === a.name; })[0];
      if (!sh) return null;
      return { action: cmd, target: a.name, before: sh };
    }
    case 'msg_add': return { action: cmd, target: a && a.adresse, before: null };
    case 'msg_del': {
      var ms = (db.messages.getAll() || []).filter(function (m) { return m.adresse === a.adresse && m.msg === a.msg; });
      if (ms.length === 0) return null;
      return { action: cmd, target: a.adresse, before: ms[0] };
    }
    case 'subs_add': return { action: cmd, target: a && a.iduser, before: null };
    case 'subs_del': {
      var sb = (db.subscriptions.getAll() || []).filter(function (x) { return x.iduser === a.iduser; })[0];
      if (!sb) return null;
      return { action: cmd, target: a.iduser, before: sb };
    }
    case 'delete_fps': if (db.logs.count() === 0) return null; return { action: cmd, target: 'logs', before: { count: db.logs.count() } };
    case 'delete_actions': if (db.states.count() === 0) return null; return { action: cmd, target: 'states', before: { count: db.states.count() } };
    case 'save_browser_bans': return { action: cmd, target: 'bans.browsers', before: this._clone((state.bans || {}).browsers || {}) };
    case 'save_system_bans': return { action: cmd, target: 'bans.systems', before: this._clone((state.bans || {}).systems || {}) };
    case 'save_noletters': return { action: cmd, target: 'noletters', before: this._clone(db.noletters.getAll()) };
    case 'save_dro3': return { action: cmd, target: 'dro3', before: { count: (state.settings.dro3 || []).length } };
    case 'save_emo': return { action: cmd, target: 'emo', before: { count: (state.settings.emo || []).length } };
    case 'save_sico': return { action: cmd, target: 'sico', before: { count: (state.settings.sico || []).length } };
    case 'backup': return { action: cmd, target: 'backups', before: null, after: null };
    case 'restore': return { action: cmd, target: 'backups', before: null, after: null };
    case 'reload_site': return { action: cmd, target: 'all', before: null };
    default: return null;
  }
};

// Finalize an audit entry after the command executed: computes the `after`
// snapshot and writes the record to the AdminAuditLog collection.
AdminController.prototype._auditCommit = function (cmd, a, ctx) {
  if (!ctx) return;
  var db = this.db, state = this.state, after;
  switch (cmd) {
    case 'save_state': after = this._clone(state.settings.siteweb); break;
    case 'save_band': after = { fp: a && a.fp, ip: a && a.ip, reason: a && a.reason }; break;
    case 'delete_band': after = null; break;
    case 'delete_room': after = null; break;
    case 'save_as': { var p = db.powers.find({}); after = p.length ? p[0].powers : null; break; }
    case 'setuserpower': after = { power: a && a.power }; break;
    case 'delete_user': after = null; break;
    case 'edit_user': after = this._clone(a); break;
    case 'fltr_add': after = { value: a && a.value, type: a && a.type }; break;
    case 'fltr_del': after = null; break;
    case 'shrt_add': after = { name: a && a.name, value: a && a.value }; break;
    case 'shrt_del': after = null; break;
    case 'msg_add': after = { category: a && a.category, adresse: a && a.adresse, msg: a && a.msg }; break;
    case 'msg_del': after = null; break;
    case 'subs_add': after = { iduser: a && a.iduser, sub: a && a.sub }; break;
    case 'subs_del': after = null; break;
    case 'delete_fps': after = { count: 0 }; break;
    case 'delete_actions': after = { count: 0 }; break;
    case 'save_browser_bans': after = this._clone((state.bans || {}).browsers || {}); break;
    case 'save_system_bans': after = this._clone((state.bans || {}).systems || {}); break;
    case 'save_noletters': after = this._clone(db.noletters.getAll()); break;
    case 'save_dro3': after = { count: (state.settings.dro3 || []).length }; break;
    case 'save_emo': after = { count: (state.settings.emo || []).length }; break;
    case 'save_sico': after = { count: (state.settings.sico || []).length }; break;
    case 'backup': after = ctx.after || null; break;
    case 'restore': after = ctx.after || null; break;
    case 'reload_site': after = null; break;
    default: return;
  }
  ctx.after = after;
  this.audit(ctx.action, ctx.target, ctx.before, ctx.after, { cmd: cmd });
};

AdminController.prototype.runAdminCommand = function (cmd, a) {
  var self = this;
  var io = this.io;
  var socket = this.socket;
  var db = this.db;
  var state = this.state;

  // Phase 5: snapshot before/after for sensitive commands → AdminAuditLog.
  var auditCtx = this._auditCaptureBefore(cmd, a);

  switch (cmd) {
    case 'save_state': {
      var siteweb = state.settings.siteweb || {};
      if (a.name !== undefined) siteweb.name = a.name;
      if (a.title !== undefined) siteweb.title = a.title;
      if (a.background !== undefined) siteweb.background = a.background;
      if (a.bg !== undefined) siteweb.bg = a.bg;
      if (a.buttons !== undefined) siteweb.buttons = a.buttons;
      if (a.msgst !== undefined) siteweb.msgst = a.msgst;
      if (a.allowg !== undefined) siteweb.allowg = a.allowg;
      if (a.allowreg !== undefined) siteweb.allowreg = a.allowreg;
      if (a.walllikes) siteweb.walllikes = a.walllikes;
      state.settings.siteweb = siteweb;
      db.settings.setAll([state.settings]);
      io.emit('updatesiteweb', siteweb);
      this.savedone();
      break;
    }
    case 'save_dro3': { state.settings.dro3 = a.data || a || []; db.settings.setAll([state.settings]); io.emit('dro3', state.settings.dro3); this.savedone(); break; }
    case 'save_emo': { state.settings.emo = a.data || a || []; db.settings.setAll([state.settings]); io.emit('emos', state.settings.emo); this.savedone(); break; }
    case 'save_sico': { state.settings.sico = a.data || a || []; db.settings.setAll([state.settings]); io.emit('sicos', state.settings.sico); this.savedone(); break; }
    case 'reload_site': io.emit('reload_site', {}); this.savedone(); break;
    case 'save_band': {
      if (a.fp) db.bands.create({ device_band: a.fp, ip_band: a.ip || '', date: new Date().toISOString(), name_band: a.reason || 'مخالفة القوانين' });
      socket.emit('done_band', {});
      break;
    }
    case 'delete_band': { if (a.fp) db.bands.deleteOne({ device_band: a.fp }); if (a.ip) db.bands.deleteOne({ ip_band: a.ip }); this.savedone(); break; }
    case 'delete_room': { if (a.id) { db.rooms.deleteOne({ id: a.id }); state.rooms = db.rooms.getAll(); io.emit('rlist', state.rooms); } this.savedone(); break; }
    case 'save_as': { if (a.powers) { db.powers.setAll([{ powers: a.powers }]); io.emit('powers', a.powers); } this.savedone(); break; }
    case 'setuserpower': {
      if (a.name && a.power) {
        var tid = null;
        for (var sid in state.users) { if (state.users[sid].username === a.name) { tid = sid; break; } }
        if (tid) { state.users[tid].rank = a.power; io.emit('user_updated', { id: tid, power: a.power }); }
        var dbUser = db.users.findOne({ topic: a.name });
        if (dbUser) { dbUser.power = a.power; db.users.updateOne({ topic: a.name }, { $set: { power: a.power } }); }
      }
      this.savedone();
      break;
    }
    case 'delete_user': { if (a.name) db.users.deleteOne({ topic: a.name }); this.savedone(); break; }
    case 'get_user': { if (a.topic) { var u = db.users.findOne({ topic: a.topic }); if (u) socket.emit('user_data', u); } break; }
    case 'edit_user': { if (a.topic) { var user = db.users.findOne({ topic: a.topic }); if (user) { Object.keys(a).forEach(function (k) { if (k !== 'topic' && k !== 'password') user[k] = a[k]; }); db.users.updateOne({ topic: a.topic }, { $set: user }); } } this.savedone(); break; }
    case 'save_noletters': { db.noletters.setAll(a.data || a || []); io.emit('noletters', db.noletters.getAll()); this.savedone(); break; }
    case 'save_bans': { if (a.bans) { state.bans = a.bans; } this.savedone(); break; }
    case 'save_browser_bans': { var bans = state.bans || {}; bans.browsers = a.browser || a || {}; state.bans = bans; this.savedone(); break; }
    case 'save_system_bans': { var bans = state.bans || {}; bans.systems = a.os || a || {}; state.bans = bans; this.savedone(); break; }
    case 'fltr_add': { var noletters = db.noletters.getAll() || []; noletters.push({ type: a.type || 'bmsgs', v: a.value, path: a.path || '' }); db.noletters.setAll(noletters); this.savedone(); break; }
    case 'fltr_del': { var noletters = db.noletters.getAll() || []; db.noletters.setAll(noletters.filter(function (f) { return f.v !== a.value; })); this.savedone(); break; }
    case 'shrt_add': { var shrt = db.settings.find({})[0] || {}; if (!shrt.shrt) shrt.shrt = []; shrt.shrt.push({ name: a.name, value: a.value }); db.settings.setAll([shrt]); this.savedone(); break; }
    case 'shrt_del': { var shrt = db.settings.find({})[0] || {}; if (shrt.shrt) shrt.shrt = shrt.shrt.filter(function (s) { return s.name !== a.name; }); db.settings.setAll([shrt]); this.savedone(); break; }
    case 'msg_add': { var msgs = db.messages.getAll() || []; msgs.push({ category: a.category || 'w', adresse: a.adresse || '', msg: a.msg }); db.messages.setAll(msgs); this.savedone(); break; }
    case 'msg_del': { var msgs = db.messages.getAll() || []; db.messages.setAll(msgs.filter(function (m) { return m.adresse !== a.adresse || m.msg !== a.msg; })); this.savedone(); break; }
    case 'subs_add': { var subs = db.subscriptions.getAll() || []; subs.push({ iduser: a.iduser, sub: a.sub, topic: a.topic, topic1: a.topic1, time: new Date().toISOString(), timeis: a.timeis || '' }); db.subscriptions.setAll(subs); this.savedone(); break; }
    case 'subs_del': { var subs = db.subscriptions.getAll() || []; db.subscriptions.setAll(subs.filter(function (s) { return s.iduser !== a.iduser; })); this.savedone(); break; }
    case 'get_fps': { var logs = db.logs.find({}); var search = a.search || ''; if (search) logs = logs.filter(function (l) { return (l.topic && l.topic.includes(search)) || (l.ip && l.ip.includes(search)); }); socket.emit('fpslist', logs.slice(0, 200)); break; }
    case 'get_actions': { var states = db.states.find({}); socket.emit('actionslist', states.slice(0, 200)); break; }
    case 'delete_fps': { db.logs.drop(); this.savedone(); break; }
    case 'delete_actions': { db.states.drop(); this.savedone(); break; }
    case 'backup': {
      var bk = this.backup();
      if (auditCtx) auditCtx.after = bk ? (bk.filename || bk.dumpDir) : null;
      break;
    }
    case 'restore': {
      var rs = this.restore();
      if (auditCtx) auditCtx.after = rs || null;
      break;
    }
    case 'get_auditlog': {
      var auditAll = db.auditlog.getAll();
      socket.emit('auditlog', auditAll.slice(-200).reverse());
      break;
    }
    case 'get_system_health': {
      var mem = process.memoryUsage();
      var rooms = state.rooms || [];
      var isMongo = false;
      try { isMongo = require('../db').isMongo(); } catch (e) { /* ignore */ }
      socket.emit('system_health', {
        connectedUsers: Object.keys(state.users || {}).length,
        onlineCount: (state.online || []).length,
        activeRooms: rooms.length,
        roomsOnline: rooms.filter(function (r) { return (r.online || 0) > 0; }).length,
        memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
        dbStatus: isMongo ? 'mongo' : 'memory',
        uptime: process.uptime(),
        node: process.version,
        now: new Date().toISOString(),
      });
      break;
    }
    default:
      break;
  }

  this._auditCommit(cmd, a, auditCtx);
};

AdminController.prototype.adminAction = function (data) {
  try {
    if (process.env.ADMIN_TRACE) console.error('[ADMIN-TRACE] adminAction called', JSON.stringify(data && data.cmd));
    if (!data || !data.cmd || !data.pass) return;
    var limiter = this.rateLimiter;
    if (limiter) {
      // Tighter rate limit for admin commands (failed attempts & churn).
      if (limiter('admin:' + this.socket.id, 5)) {
        this.socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'طلبات كثيرة جداً، انتظر قليلاً' } });
        return;
      }
      if (!this.authOk(data.pass) && limiter('adminfail:' + this.socket.id, 3)) {
        this.socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'محاولات كثيرة خاطئة، انتظر قليلاً' } });
        return;
      }
    }
    if (!this.authOk(data.pass)) { this.socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'كلمة المرور غير صحيحة' } }); return; }
    this.socket.isAdmin = true;
    this.runAdminCommand(data.cmd, data.data || {});
  } catch (e) { logger.error('admin.adminAction', 'Error', { error: e.message }); }
};

AdminController.prototype.getBansSystem = function () {
  var bans = this.state.bans || {};
  this.socket.emit('message', { cmd: 'setbansystem', data: { browsers: bans.browsers || {}, systems: bans.systems || {} } });
};

AdminController.prototype.handleMsg = function (data) {
  if (process.env.ADMIN_TRACE) console.error('[ADMIN-TRACE] handleMsg', JSON.stringify(data && data.cmd));
  if (!data || !data.cmd) return;
  var socket = this.socket;
  var db = this.db;
  var state = this.state;
  switch (data.cmd) {
    case 'admin': this.adminAction(data.data); break;
    case 'BandSystem':
      if (!socket.isAdmin) return;
      if (data.data) {
        var bans = state.bans || {};
        if (data.data.type === 'browser') bans.browsers = data.data.state || {};
        if (data.data.type === 'system') bans.systems = data.data.state || {};
        state.bans = bans;
      }
      break;
    case 'banddevice':
      if (!socket.isAdmin) return;
      if (data.data && typeof data.data === 'string') {
        db.bands.create({ device_band: data.data, ip_band: '', date: new Date().toISOString(), name_band: 'حظر مباشر' });
        this.audit('banddevice', data.data, null, { device_band: data.data });
      }
      break;
    case 'delBand':
      if (!socket.isAdmin) return;
      if (data.data && data.data.id) {
        var bandDoc = db.bands.findOne({ _id: data.data.id });
        db.bands.deleteOne({ _id: data.data.id });
        if (bandDoc) this.audit('delete_band', bandDoc.device_band || bandDoc.ip_band || data.data.id, bandDoc, null);
      }
      break;
    case 'history':
      if (!socket.isAdmin) return;
      if (data.data && data.data.cmd === 'get_log') { var logs = db.logs.find({}); socket.emit('message', { cmd: 'users_log', data: logs }); }
      break;
    case 'getstate':
      var adminPass = data.data ? data.data.password : '';
      var limiter2 = this.rateLimiter;
      if (limiter2 && limiter2('getstate:' + this.socket.id, 5)) {
        this.socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'طلبات كثيرة جداً، انتظر قليلاً' } });
        return;
      }
      socket.emit('message', { cmd: 'siteweb', data: state.settings.siteweb || {} });
      socket.emit('message', { cmd: 'dro3', data: state.settings.dro3 || [] });
      socket.emit('message', { cmd: 'emos', data: state.settings.emo || [] });
      socket.emit('message', { cmd: 'sicos', data: state.settings.sico || [] });
      if (this.authOk(adminPass)) {
        socket.isAdmin = true;
        var p = db.powers.find({});
        socket.emit('message', { cmd: 'powers', data: p.length > 0 ? p[0].powers : [] });
        socket.emit('message', { cmd: 'noletters', data: db.noletters.getAll() || [] });
        socket.emit('message', { cmd: 'zaker', data: db.zakrfa.getAll() || [] });
        socket.emit('message', { cmd: 'users_data', data: db.users.find({}) });
        socket.emit('message', { cmd: 'rlist', data: state.rooms || [] });
        socket.emit('message', { cmd: 'band_list', data: db.bands.find({}) });
        this.getBansSystem();
        var shrt = db.settings.find({})[0] || {};
        socket.emit('message', { cmd: 'shrtlist', data: shrt.shrt || [] });
        socket.emit('message', { cmd: 'msgslist', data: db.messages.getAll() || [] });
        socket.emit('message', { cmd: 'subslist', data: db.subscriptions.getAll() || [] });
      }
      break;
  }
};

AdminController.prototype.handleGetState = function () {
  var p = this.db.powers.find({});
  this.socket.emit('getstate', {
    siteweb: this.state.settings.siteweb || {},
    dro3: this.state.settings.dro3 || [], emos: this.state.settings.emo || [], sicos: this.state.settings.sico || [],
    powers: p.length > 0 ? p[0].powers : [], noletters: this.db.noletters.getAll() || [],
    zaker: this.db.zakrfa.getAll() || [], users_data: this.db.users.find({}),
    rlist: this.state.rooms || [], bandList: this.db.bands.find({}), blockList: this.db.bars.find({}),
    shrtlist: (this.db.settings.find({})[0] || {}).shrt || [],
    msgslist: this.db.messages.getAll() || [], subslist: this.db.subscriptions.getAll() || [],
  });
};

AdminController.prototype.handleSaveSite = function (a) {
  var siteweb = this.state.settings.siteweb || {};
  if (a.name !== undefined) siteweb.name = a.name;
  if (a.title !== undefined) siteweb.title = a.title;
  if (a.desc !== undefined) siteweb.desc = a.desc;
  if (a.pic !== undefined) siteweb.pic = a.pic;
  if (a.css !== undefined) siteweb.css = a.css;
  if (a.forced !== undefined) siteweb.forced = a.forced;
  if (a.background !== undefined) siteweb.background = a.background;
  if (a.bg !== undefined) siteweb.bg = a.bg;
  if (a.buttons !== undefined) siteweb.buttons = a.buttons;
  if (a.msgst !== undefined) siteweb.msgst = a.msgst;
  if (a.allowg !== undefined) siteweb.allowg = a.allowg;
  if (a.allowreg !== undefined) siteweb.allowreg = a.allowreg;
  this.state.settings.siteweb = siteweb;
  this.db.settings.setAll([this.state.settings]);
  this.io.emit('updatesiteweb', siteweb);
  this.savedone();
};

AdminController.prototype.attach = function () {
  var socket = this.socket;
  var db = this.db;
  var state = this.state;
  var self = this;
  var on = guard.on(socket, 'admin');

  function adminOnly(fn) {
    return function (data) {
      if (!socket.isAdmin) return;
      fn(data);
    };
  }

  on('msg', function (data) { self.handleMsg(data); });

  on('getstate', function () { if (socket.isAdmin) self.handleGetState(); });

  on('save_site', adminOnly(function (a) { if (a) { var before = self._clone(state.settings.siteweb); self.handleSaveSite(a); self.audit('save_site', 'siteweb', before, self._clone(state.settings.siteweb)); } }));

  on('save_state', adminOnly(function () {
    var before = self._clone(state.settings.siteweb);
    db.settings.setAll([state.settings]);
    self.savedone();
    self.audit('save_state', 'siteweb', before, self._clone(state.settings.siteweb));
  }));

  on('save_dro3', adminOnly(function (data) { var before = { count: (state.settings.dro3 || []).length }; state.settings.dro3 = data || []; db.settings.setAll([state.settings]); self.io.emit('dro3', state.settings.dro3); self.savedone(); self.audit('save_dro3', 'dro3', before, { count: (state.settings.dro3 || []).length }); }));
  on('save_emo', adminOnly(function (data) { var before = { count: (state.settings.emo || []).length }; state.settings.emo = data || []; db.settings.setAll([state.settings]); self.io.emit('emos', state.settings.emo); self.savedone(); self.audit('save_emo', 'emo', before, { count: (state.settings.emo || []).length }); }));
  on('save_sico', adminOnly(function (data) { var before = { count: (state.settings.sico || []).length }; state.settings.sico = data || []; db.settings.setAll([state.settings]); self.io.emit('sicos', state.settings.sico); self.savedone(); self.audit('save_sico', 'sico', before, { count: (state.settings.sico || []).length }); }));
  on('save_powers', adminOnly(function (data) { if (data && data.powers) { var before = (db.powers.find({})[0] || {}).powers; db.powers.setAll([{ powers: data.powers }]); self.io.emit('powers', data.powers); self.audit('save_powers', 'powers', before, data.powers); } self.savedone(); }));
  on('save_power', adminOnly(function (data) { if (data && data.powers) { var before = (db.powers.find({})[0] || {}).powers; db.powers.setAll([{ powers: data.powers }]); self.audit('save_power', 'powers', before, data.powers); } self.savedone(); }));
  on('save_noletters_direct', adminOnly(function (data) { if (data) { var before = self._clone(db.noletters.getAll()); db.noletters.setAll(data); self.io.emit('noletters', db.noletters.getAll()); self.audit('save_noletters', 'noletters', before, self._clone(db.noletters.getAll())); } self.savedone(); }));
  on('save_band', adminOnly(function (data) { if (data && data.name) { db.bands.create({ device_band: data.name, ip_band: data.ip || '', date: new Date().toISOString(), name_band: data.reason || 'مخالفة' }); self.audit('save_band', data.name, null, { fp: data.name, ip: data.ip, reason: data.reason }); } socket.emit('done_band', {}); }));
  on('delBand', adminOnly(function (data) { if (data && data.id) { var band = db.bands.findOne({ _id: data.id }); db.bands.deleteOne({ _id: data.id }); if (band) self.audit('delete_band', band.device_band || band.ip_band || data.id, band, null); } }));
  on('delete_room', adminOnly(function (data) { if (data && data.roomId) { var room = db.rooms.findOne({ id: data.roomId }); db.rooms.deleteOne({ id: data.roomId }); state.rooms = db.rooms.getAll(); self.io.emit('rlist', state.rooms); if (room) self.audit('delete_room', data.roomId, { id: room.id, name: room.name, owner: room.owner }, null); } self.savedone(); }));
  on('save_browser_bans', adminOnly(function (data) { if (data && data.browser) { var bans = state.bans || {}; var before = self._clone(bans.browsers || {}); bans.browsers = data.browser; state.bans = bans; self.audit('save_browser_bans', 'bans.browsers', before, self._clone(bans.browsers)); } self.savedone(); }));
  on('save_system_bans', adminOnly(function (data) { if (data && data.os) { var bans = state.bans || {}; var before = self._clone(bans.systems || {}); bans.systems = data.os; state.bans = bans; self.audit('save_system_bans', 'bans.systems', before, self._clone(bans.systems)); } self.savedone(); }));
  on('fltr_add', adminOnly(function (data) { if (data && data.word) { var nl = db.noletters.getAll() || []; nl.push({ type: 'bmsgs', v: data.word }); db.noletters.setAll(nl); self.audit('fltr_add', data.word, null, { value: data.word, type: 'bmsgs' }); } self.savedone(); }));
  on('fltr_del', adminOnly(function (data) { if (data && data.word) { var nl = db.noletters.getAll() || []; var before = nl.filter(function (f) { return f.v === data.word; })[0]; db.noletters.setAll(nl.filter(function (f) { return f.v !== data.word; })); if (before) self.audit('fltr_del', data.word, before, null); } self.savedone(); }));
  on('msg_add', adminOnly(function (data) { if (data && data.key) { var msgs = db.messages.getAll() || []; msgs.push({ category: 'w', adresse: data.key, msg: data.msg }); db.messages.setAll(msgs); self.audit('msg_add', data.key, null, { category: 'w', adresse: data.key, msg: data.msg }); } self.savedone(); }));
  on('msg_del', adminOnly(function (data) { if (data && data.key) { var msgs = db.messages.getAll() || []; var before = msgs.filter(function (m) { return m.adresse === data.key; })[0]; db.messages.setAll(msgs.filter(function (m) { return m.adresse !== data.key; })); if (before) self.audit('msg_del', data.key, before, null); } self.savedone(); }));
  on('shrt_add', adminOnly(function (data) { if (data && data.key) { var shrt = db.settings.find({})[0] || {}; if (!shrt.shrt) shrt.shrt = []; shrt.shrt.push({ name: data.key, value: data.msg }); db.settings.setAll([shrt]); self.audit('shrt_add', data.key, null, { name: data.key, value: data.msg }); } self.savedone(); }));
  on('shrt_del', adminOnly(function (data) { if (data && data.key) { var shrt = db.settings.find({})[0] || {}; if (shrt.shrt) { var before = shrt.shrt.filter(function (s) { return s.name === data.key; })[0]; shrt.shrt = shrt.shrt.filter(function (s) { return s.name !== data.key; }); db.settings.setAll([shrt]); if (before) self.audit('shrt_del', data.key, before, null); } } self.savedone(); }));
  on('subs_add', adminOnly(function (data) { if (data && data.key) { var subs = db.subscriptions.getAll() || []; subs.push({ iduser: Date.now().toString(), sub: data.msg, topic: data.key, topic1: data.key, time: new Date().toISOString() }); db.subscriptions.setAll(subs); self.audit('subs_add', data.key, null, { topic: data.key, sub: data.msg }); } self.savedone(); }));
  on('subs_del', adminOnly(function (data) { if (data && data.key) { var subs = db.subscriptions.getAll() || []; var before = subs.filter(function (s) { return s.topic === data.key; })[0]; db.subscriptions.setAll(subs.filter(function (s) { return s.topic !== data.key; })); if (before) self.audit('subs_del', data.key, before, null); } self.savedone(); }));
  on('get_actions', adminOnly(function (data) { var states = db.states.find({}); socket.emit('actionslist', states.slice(0, 200)); }));
  on('delete_actions', adminOnly(function () { var before = { count: db.states.count() }; db.states.drop(); self.savedone(); self.audit('delete_actions', 'states', before, { count: 0 }); }));
  on('delete_fps', adminOnly(function () { var before = { count: db.logs.count() }; db.logs.drop(); self.savedone(); self.audit('delete_fps', 'logs', before, { count: 0 }); }));
  on('backup', adminOnly(function () { var res = self.backup(); self.audit('backup', 'backups', null, res ? (res.filename || res.dumpDir) : null); }));
  on('restore', adminOnly(function () { var res = self.restore(); self.audit('restore', 'backups', null, res || null); }));
  on('setuserpower', adminOnly(function (data) {
    if (data && data.name && data.power !== undefined) {
      var before = null;
      var dbUser0 = db.users.findOne({ topic: data.name });
      if (dbUser0) before = { power: dbUser0.power };
      var tid = null;
      for (var sid in state.users) { if (state.users[sid].username === data.name) { tid = sid; break; } }
      if (tid) { state.users[tid].rank = data.power; self.io.emit('user_updated', { id: tid, power: data.power }); }
      var dbUser = db.users.findOne({ topic: data.name });
      if (dbUser) { dbUser.power = data.power; db.users.updateOne({ topic: data.name }, { $set: { power: data.power } }); }
      self.audit('setuserpower', data.name, before, { power: data.power });
    }
    self.savedone();
  }));
  on('get_user', adminOnly(function (data) { if (data && data.name) { var u = db.users.findOne({ topic: data.name }); if (u) socket.emit('user_data', { name: u.topic, ip: u.ip, power: u.power, pic: u.pic, rep: u.rep, online: u.online, ban: u.ban, lastSeen: u.time }); } }));
  on('delete_user', adminOnly(function (data) { if (data && data.name) { var u = db.users.findOne({ topic: data.name }); db.users.deleteOne({ topic: data.name }); if (u) self.audit('delete_user', data.name, { topic: u.topic, ip: u.ip, power: u.power }, null); } self.savedone(); }));
  on('get_auditlog', adminOnly(function () { var all = db.auditlog.getAll(); socket.emit('auditlog', all.slice(-200).reverse()); }));
  on('get_system_health', adminOnly(function () {
    var mem = process.memoryUsage();
    var rooms = state.rooms || [];
    var isMongo = false;
    try { isMongo = require('../db').isMongo(); } catch (e) { /* ignore */ }
    socket.emit('system_health', {
      connectedUsers: Object.keys(state.users || {}).length,
      onlineCount: (state.online || []).length,
      activeRooms: rooms.length,
      roomsOnline: rooms.filter(function (r) { return (r.online || 0) > 0; }).length,
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
      dbStatus: isMongo ? 'mongo' : 'memory',
      uptime: process.uptime(),
      node: process.version,
      now: new Date().toISOString(),
    });
  }));
  on('get_site_info', function () {
    socket.emit('updatesiteweb', state.settings.siteweb || {});
    socket.emit('init-config', { rooms: state.rooms, settings: state.settings, siteweb: state.settings.siteweb || {} });
  });
};

AdminController.prototype.backup = function () {
  try {
    var backupService = require('../services/backupService');
    var res = backupService.createBackup(this.db);
    if (res) {
      var label = res.mode === 'mongo' ? 'تم إنشاء نسخة MongoDB كاملة: ' : 'تم إنشاء النسخة الاحتياطية: ';
      this.savedone({ msg: label + (res.filename || res.dumpDir) });
    } else {
      this.socket.emit('error-msg', { msg: 'فشل إنشاء النسخة الاحتياطية' });
    }
    return res;
  } catch (e) { logger.error('admin.backup', 'Error', { error: e.message }); return null; }
};

AdminController.prototype.restore = function () {
  var fs = require('fs');
  var db = this.db;
  var state = this.state;
  try {
    var backupDir = require('../config').backupDir;
    if (!fs.existsSync(backupDir)) { this.socket.emit('error-msg', { msg: 'لا توجد نسخ احتياطية' }); return null; }
    var files = fs.readdirSync(backupDir).filter(function (f) { return /^backup-\d+\.json$/.test(f); }).sort();
    if (files.length === 0) { this.socket.emit('error-msg', { msg: 'لا توجد نسخ احتياطية' }); return null; }
    var latest = path.join(backupDir, files[files.length - 1]);
    var data = JSON.parse(fs.readFileSync(latest, 'utf8'));
    if (data.users) db.users.setAll(data.users);
    if (data.rooms) { db.rooms.setAll(data.rooms); state.rooms = db.rooms.getAll(); }
    if (data.settings) db.settings.setAll(data.settings);
    if (data.bands) db.bands.setAll(data.bands);
    if (data.bars) db.bars.setAll(data.bars);
    if (data.powers) db.powers.setAll(data.powers);
    if (data.messages) db.messages.setAll(data.messages);
    if (data.noletters) db.noletters.setAll(data.noletters);
    if (data.subscriptions) db.subscriptions.setAll(data.subscriptions);
    this.savedone({ msg: 'تمت الاستعادة من: ' + files[files.length - 1] });
    return files[files.length - 1];
  } catch (e) { logger.error('admin.restore', 'Error', { error: e.message }); return null; }
};

module.exports = AdminController;
