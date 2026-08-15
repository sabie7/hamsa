var logger = require('../logger');
var path = require('path');

function AdminController(io, socket, db, state) {
  this.io = io;
  this.socket = socket;
  this.db = db;
  this.state = state;
  this.adminPass = state.adminPass;
}

AdminController.prototype.authOk = function (pass) {
  return pass === this.adminPass;
};

AdminController.prototype.savedone = function (msg) {
  this.socket.emit('savedone', msg || {});
};

AdminController.prototype.runAdminCommand = function (cmd, a) {
  var self = this;
  var io = this.io;
  var socket = this.socket;
  var db = this.db;
  var state = this.state;

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
    case 'save_browser_bans': { var bans = state.bans || {}; bans.browsers = a; state.bans = bans; this.savedone(); break; }
    case 'save_system_bans': { var bans = state.bans || {}; bans.systems = a; state.bans = bans; this.savedone(); break; }
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
      try {
        var fs = require('fs');
        var backupDir = path.join(require('../config').rootDir, 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        var data = { users: db.users.getAll(), rooms: db.rooms.getAll(), settings: db.settings.getAll(), bands: db.bands.getAll(), bars: db.bars.getAll(), powers: db.powers.getAll(), messages: db.messages.getAll(), noletters: db.noletters.getAll(), subscriptions: db.subscriptions.getAll() };
        var filename = 'backup-' + Date.now() + '.json';
        fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(data, null, 2));
        this.savedone({ msg: 'تم إنشاء النسخة الاحتياطية: ' + filename });
      } catch (e) { logger.error('admin.backup', 'Error', { error: e.message }); }
      break;
    }
    case 'restore': {
      try {
        var fs = require('fs');
        var backupDir = path.join(require('../config').rootDir, 'backups');
        var files = fs.readdirSync(backupDir).filter(function (f) { return f.endsWith('.json'); }).sort();
        if (files.length === 0) { socket.emit('error-msg', { msg: 'لا توجد نسخ احتياطية' }); break; }
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
      } catch (e) { logger.error('admin.restore', 'Error', { error: e.message }); }
      break;
    }
    default:
      break;
  }
};

AdminController.prototype.adminAction = function (data) {
  try {
    if (!data || !data.cmd || !data.pass) return;
    if (!this.authOk(data.pass)) { this.socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'كلمة المرور غير صحيحة' } }); return; }
    this.runAdminCommand(data.cmd, data.data || {});
  } catch (e) { logger.error('admin.adminAction', 'Error', { error: e.message }); }
};

AdminController.prototype.getBansSystem = function () {
  var bans = this.state.bans || {};
  this.socket.emit('message', { cmd: 'setbansystem', data: { browsers: bans.browsers || {}, systems: bans.systems || {} } });
};

AdminController.prototype.handleMsg = function (data) {
  if (!data || !data.cmd) return;
  var socket = this.socket;
  var db = this.db;
  var state = this.state;
  switch (data.cmd) {
    case 'admin': this.adminAction(data.data); break;
    case 'BandSystem':
      if (data.data) {
        var bans = state.bans || {};
        if (data.data.type === 'browser') bans.browsers = data.data.state || {};
        if (data.data.type === 'system') bans.systems = data.data.state || {};
        state.bans = bans;
      }
      break;
    case 'banddevice':
      if (data.data && typeof data.data === 'string') {
        db.bands.create({ device_band: data.data, ip_band: '', date: new Date().toISOString(), name_band: 'حظر مباشر' });
      }
      break;
    case 'delBand':
      if (data.data && data.data.id) db.bands.deleteOne({ _id: data.data.id });
      break;
    case 'history':
      if (data.data && data.data.cmd === 'get_log') { var logs = db.logs.find({}); socket.emit('message', { cmd: 'users_log', data: logs }); }
      break;
    case 'getstate':
      var adminPass = data.data ? data.data.password : '';
      socket.emit('message', { cmd: 'siteweb', data: state.settings.siteweb || {} });
      socket.emit('message', { cmd: 'dro3', data: state.settings.dro3 || [] });
      socket.emit('message', { cmd: 'emos', data: state.settings.emo || [] });
      socket.emit('message', { cmd: 'sicos', data: state.settings.sico || [] });
      if (this.authOk(adminPass)) {
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

  socket.on('msg', function (data) { self.handleMsg(data); });

  socket.on('getstate', function () { self.handleGetState(); });

  socket.on('save_site', function (a) { if (a) self.handleSaveSite(a); });

  socket.on('save_state', function () {
    db.settings.setAll([state.settings]);
    self.savedone();
  });

  socket.on('save_dro3', function (data) { state.settings.dro3 = data || []; db.settings.setAll([state.settings]); self.io.emit('dro3', state.settings.dro3); self.savedone(); });
  socket.on('save_emo', function (data) { state.settings.emo = data || []; db.settings.setAll([state.settings]); self.io.emit('emos', state.settings.emo); self.savedone(); });
  socket.on('save_sico', function (data) { state.settings.sico = data || []; db.settings.setAll([state.settings]); self.io.emit('sicos', state.settings.sico); self.savedone(); });
  socket.on('save_powers', function (data) { if (data && data.powers) { db.powers.setAll([{ powers: data.powers }]); self.io.emit('powers', data.powers); } self.savedone(); });
  socket.on('save_power', function (data) { if (data && data.powers) { db.powers.setAll([{ powers: data.powers }]); } self.savedone(); });
  socket.on('save_noletters_direct', function (data) { if (data) { db.noletters.setAll(data); self.io.emit('noletters', db.noletters.getAll()); } self.savedone(); });
  socket.on('save_band', function (data) { if (data && data.name) { db.bands.create({ device_band: data.name, ip_band: data.ip || '', date: new Date().toISOString(), name_band: data.reason || 'مخالفة' }); } socket.emit('done_band', {}); });
  socket.on('delBand', function (data) { if (data && data.id) db.bands.deleteOne({ _id: data.id }); });
  socket.on('delete_room', function (data) { if (data && data.roomId) { db.rooms.deleteOne({ id: data.roomId }); state.rooms = db.rooms.getAll(); self.io.emit('rlist', state.rooms); } self.savedone(); });
  socket.on('save_browser_bans', function (data) { if (data && data.browser) { var bans = state.bans || {}; bans.browsers = data.browser; state.bans = bans; } self.savedone(); });
  socket.on('save_system_bans', function (data) { if (data && data.os) { var bans = state.bans || {}; bans.systems = data.os; state.bans = bans; } self.savedone(); });
  socket.on('fltr_add', function (data) { if (data && data.word) { var nl = db.noletters.getAll() || []; nl.push({ type: 'bmsgs', v: data.word }); db.noletters.setAll(nl); } self.savedone(); });
  socket.on('fltr_del', function (data) { if (data && data.word) { var nl = db.noletters.getAll() || []; db.noletters.setAll(nl.filter(function (f) { return f.v !== data.word; })); } self.savedone(); });
  socket.on('msg_add', function (data) { if (data && data.key) { var msgs = db.messages.getAll() || []; msgs.push({ category: 'w', adresse: data.key, msg: data.msg }); db.messages.setAll(msgs); } self.savedone(); });
  socket.on('msg_del', function (data) { if (data && data.key) { var msgs = db.messages.getAll() || []; db.messages.setAll(msgs.filter(function (m) { return m.adresse !== data.key; })); } self.savedone(); });
  socket.on('shrt_add', function (data) { if (data && data.key) { var shrt = db.settings.find({})[0] || {}; if (!shrt.shrt) shrt.shrt = []; shrt.shrt.push({ name: data.key, value: data.msg }); db.settings.setAll([shrt]); } self.savedone(); });
  socket.on('shrt_del', function (data) { if (data && data.key) { var shrt = db.settings.find({})[0] || {}; if (shrt.shrt) shrt.shrt = shrt.shrt.filter(function (s) { return s.name !== data.key; }); db.settings.setAll([shrt]); } self.savedone(); });
  socket.on('subs_add', function (data) { if (data && data.key) { var subs = db.subscriptions.getAll() || []; subs.push({ iduser: Date.now().toString(), sub: data.msg, topic: data.key, topic1: data.key, time: new Date().toISOString() }); db.subscriptions.setAll(subs); } self.savedone(); });
  socket.on('subs_del', function (data) { if (data && data.key) { var subs = db.subscriptions.getAll() || []; db.subscriptions.setAll(subs.filter(function (s) { return s.topic !== data.key; })); } self.savedone(); });
  socket.on('get_actions', function (data) { var states = db.states.find({}); socket.emit('actionslist', states.slice(0, 200)); });
  socket.on('delete_actions', function () { db.states.drop(); self.savedone(); });
  socket.on('delete_fps', function () { db.logs.drop(); self.savedone(); });
  socket.on('backup', function () { self.backup(); });
  socket.on('restore', function () { self.restore(); });
  socket.on('setuserpower', function (data) {
    if (data && data.name && data.power !== undefined) {
      var tid = null;
      for (var sid in state.users) { if (state.users[sid].username === data.name) { tid = sid; break; } }
      if (tid) { state.users[tid].rank = data.power; self.io.emit('user_updated', { id: tid, power: data.power }); }
      var dbUser = db.users.findOne({ topic: data.name });
      if (dbUser) { dbUser.power = data.power; db.users.updateOne({ topic: data.name }, { $set: { power: data.power } }); }
    }
    self.savedone();
  });
  socket.on('get_user', function (data) { if (data && data.name) { var u = db.users.findOne({ topic: data.name }); if (u) socket.emit('user_data', { name: u.topic, ip: u.ip, power: u.power, pic: u.pic, rep: u.rep, online: u.online, ban: u.ban, lastSeen: u.time }); } });
  socket.on('delete_user', function (data) { if (data && data.name) db.users.deleteOne({ topic: data.name }); self.savedone(); });
  socket.on('get_site_info', function () {
    socket.emit('updatesiteweb', state.settings.siteweb || {});
    socket.emit('init-config', { rooms: state.rooms, settings: state.settings, siteweb: state.settings.siteweb || {} });
  });
};

AdminController.prototype.backup = function () {
  var fs = require('fs');
  var db = this.db;
  try {
    var backupDir = path.join(require('../config').rootDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    var data = { users: db.users.getAll(), rooms: db.rooms.getAll(), settings: db.settings.getAll(), bands: db.bands.getAll(), bars: db.bars.getAll(), powers: db.powers.getAll(), messages: db.messages.getAll(), noletters: db.noletters.getAll(), subscriptions: db.subscriptions.getAll() };
    var filename = 'backup-' + Date.now() + '.json';
    fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(data, null, 2));
    this.savedone({ msg: 'تم إنشاء النسخة الاحتياطية: ' + filename });
  } catch (e) { logger.error('admin.backup', 'Error', { error: e.message }); }
};

AdminController.prototype.restore = function () {
  var fs = require('fs');
  var db = this.db;
  var state = this.state;
  try {
    var backupDir = path.join(require('../config').rootDir, 'backups');
    var files = fs.readdirSync(backupDir).filter(function (f) { return f.endsWith('.json'); }).sort();
    if (files.length === 0) { this.socket.emit('error-msg', { msg: 'لا توجد نسخ احتياطية' }); return; }
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
  } catch (e) { logger.error('admin.restore', 'Error', { error: e.message }); }
};

module.exports = AdminController;
