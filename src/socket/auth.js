var bcrypt = require('bcryptjs');
var helpers = require('../utils/helpers');
var logger = require('../logger');
var guard = require('./guard');

var SALT_ROUNDS = 10;
var emptyPower = { rank: 0, name: '', ico: '', kick: 0, delbc: 0, alert: 0, mynick: 0, unick: 0, ban: 0, publicmsg: 0, forcepm: 0, roomowner: 0, createroom: 0, rooms: 0, edituser: 0, setpower: 0, upgrades: 0, history: 0, cp: 0, stealth: 0, owner: 0, meiut: 0, loveu: 0, ulike: 0, flter: 0, subs: 0, shrt: 0, msgs: 0, bootedit: 0, grupes: 0, delmsg: 0, delpic: 0 };

module.exports = function (io, socket, db, state, rateLimiter) {
  var on = guard.on(socket, 'auth');

  function savelogin(user, type) {
    try {
      db.logs.create({
        state: type || 'guest', topic: user.topic || user.username, topic1: user.topic || user.username,
        ip: user.ip || '', code: user.code || 'us', device: user.fp || '',
        isin: 'in', time: new Date().toISOString()
      });
      db.names.create({ topic: user.topic || user.username, ip: user.ip || '', fp: user.fp || '', iduser: user.uid || '' });
    } catch (e) {}
  }

  function syncOnline(user) {
    state.addOnline({
      id: socket.id, topic: user.topic || user.username, topic1: user.topic || user.username,
      pic: user.pic || 'pic.png', bg: user.bg || '#ffffff', ucol: user.ucol || '#000000',
      mcol: user.mcol || '#000000', msg: '', power: user.rank || '', rep: user.rep || 0, likes: user.likes || 0,
      co: user.code || 'us', roomid: 'efOiAhhNdL', lid: user.lid || '', idreg: user.idreg || '', ico: user.ico || ''
    });
    io.emit('user-joined', state.online[state.online.length - 1]);
    setTimeout(function () { io.emit('room-changed', { roomId: 'efOiAhhNdL' }); }, 500);
  }

  // On a fast reconnect the old socket may still be registered while the new
  // one connects. If the existing entry's socket is already gone, reclaim the
  // name so the client is not locked out by its own stale connection.
  function reclaimStaleUser(username) {
    if (typeof username !== 'string') return false;
    var lname = username.toLowerCase();
    for (var sid in state.users) {
      var u = state.users[sid];
      if (u.username && u.username.toLowerCase() === lname) {
        var s = io.sockets.sockets.get(sid);
        if (s) return false;
        delete state.users[sid];
        for (var i = state.online.length - 1; i >= 0; i--) {
          if (state.online[i].id === sid) { state.online.splice(i, 1); break; }
        }
        io.emit('user-left', { name: u.username });
        return true;
      }
    }
    return false;
  }

  function findUserInState(username) {
    for (var sid in state.users) {
      if (state.users[sid].username && state.users[sid].username.toLowerCase() === username.toLowerCase()) return state.users[sid];
    }
    return null;
  }

  on('guest', function (data) {
    try {
      if (rateLimiter('guest:' + socket.id, 3)) return;
      if (rateLimiter('guest_ip:' + (data.ip || socket.handshake.address), 6)) { socket.emit('error-msg', { msg: 'طلبات كثيرة، انتظر قليلاً' }); return; }
      if (!data || typeof data.name !== 'string' || data.name.trim().length < 3) return;
      reclaimStaleUser(data.name.trim());
      var siteweb = state.settings.siteweb || {};
      if (!siteweb.allowg) { socket.emit('error-msg', { msg: 'الزوار غير مسموح لهم حاليا' }); return; }
      var blocked = helpers.isSystemOrBrowserBlocked(state, data);
      if (blocked) { socket.emit('error-msg', { msg: blocked + ' محظور' }); return; }
      var username = data.name.trim();
      if (username.length > 50) { socket.emit('error-msg', { msg: 'اسم المستخدم طويل جدا' }); return; }
      if (db.users.findOne({ topic: username })) { socket.emit('error-msg', { msg: 'لا يمكنك الدخول باسم مسجل' }); return; }
      if (findUserInState(username)) { socket.emit('error-msg', { msg: 'هذا الاسم موجود في الدردشة' }); return; }
      var deviceFp = data.fp || '';
      var isbands = deviceFp.slice(-15);
      if (db.bands.findOne({ $or: [{ device_band: isbands }, { ip_band: data.ip }] })) { socket.emit('error-msg', { msg: 'تم حظرك من الدردشة' }); return; }
      if (db.bands.findOne({ $or: [{ device_band: deviceFp }, { ip_band: data.ip }] })) { socket.emit('error-msg', { msg: 'تم حظرك من الدردشة' }); return; }
      var userInfo = {
        id: socket.id, username: username, uid: '', lid: '', token: '', pic: 'pic.png', ico: '',
        ucol: '#000000', mcol: '#000000', bg: '#ffffff', rep: 0, rank: '', idreg: '#' + helpers.randomInt(300, 900),
        code: data.code || 'us', location: data.location || '', ip: data.ip || '', fp: deviceFp,
        stealth: false, ismuted: false, alerts: false, busy: false, powers: emptyPower, roomid: 'efOiAhhNdL', _lastHeartbeat: Date.now(),
      };
      state.users[socket.id] = userInfo;
      socket.join('efOiAhhNdL');
      var powersCol = db.powers.find({});
      var powers = powersCol.length > 0 ? powersCol[0].powers : null;
      socket.emit('login', { user: { name: username, pic: 'pic.png', id: socket.id }, token: '', adminPower: 0 });
      socket.emit('power', emptyPower);
      if (powers) socket.emit('powers', powers);
      socket.emit('emos', state.settings.emo || []);
      socket.emit('dro3', state.settings.dro3 || []);
      socket.emit('sicos', state.settings.sico || []);
      socket.emit('rlist', state.rooms);
      socket.emit('users-list', state.online);
      syncOnline(userInfo);
      savelogin(userInfo, 'guest');
    } catch (e) { logger.error('auth.guest', 'Error', { error: e.message }); }
  });

  on('login', async function (data) {
    try {
      if (rateLimiter('login:' + socket.id, 3)) return;
      if (rateLimiter('login_ip:' + (data.ip || socket.handshake.address), 8)) { socket.emit('error-msg', { msg: 'محاولات دخول كثيرة، انتظر قليلاً' }); return; }
      if (!data || typeof data.name !== 'string' || typeof data.password !== 'string') return;
      var username = data.name.trim();
      if (username.length > 50) { socket.emit('error-msg', { msg: 'اسم المستخدم طويل جداً' }); return; }
      var user = db.users.findOne({ topic: username });
      if (!user) { socket.emit('error-msg', { msg: 'اسم المستخدم او كلمة المرور غير صحيحة' }); return; }
      var match = await bcrypt.compare(data.password, user.password);
      if (!match) { socket.emit('error-msg', { msg: 'اسم المستخدم او كلمة المرور غير صحيحة' }); return; }
      var blocked = helpers.isSystemOrBrowserBlocked(state, data);
      if (blocked && !user.documentationc) { socket.emit('error-msg', { msg: blocked + ' محظور' }); return; }
      var deviceFp = data.fp || '';
      var isbands = deviceFp.slice(-15);
      if (db.bands.findOne({ $or: [{ device_band: isbands }, { ip_band: data.ip }] }) && !user.documentationc) { socket.emit('error-msg', { msg: 'تم حظرك' }); return; }
      // Reclaim a stale entry left behind by a fast reconnect before this login
      reclaimStaleUser(username);
      for (var i = 0; i < state.online.length; i++) {
        if (state.online[i].lid === user.id) {
          var oldSocket = io.sockets.sockets.get(state.online[i].id);
          if (oldSocket) { oldSocket.emit('duplicate-session', {}); oldSocket.emit('kicked', {}); oldSocket.disconnect(true); }
        }
      }
      var isStealth = data.stealth === true || data.stealth === 'true';
      var powerName = user.power || '';
      var adminPower = 0;
      var powersCol = db.powers.find({});
      var powers = powersCol.length > 0 ? powersCol[0].powers : null;
      if (username === require('../config').adminUser) adminPower = 999;
      var userInfo = {
        id: socket.id, username: user.topic || user.topic1 || user.username, uid: user.id, lid: user.lid, token: user.token || '',
        pic: user.pic || 'pic.png', ico: user.ico || '', ucol: user.ucol || '#000000', mcol: user.mcol || '#000000',
        bg: user.bg || '#ffffff', rep: user.rep || 0, rank: powerName, idreg: user.idreg || '',
        code: data.code || 'us', location: data.location || '', ip: data.ip || '', fp: deviceFp,
        stealth: isStealth, ismuted: false, alerts: false, busy: false, powers: emptyPower, roomid: 'efOiAhhNdL', _lastHeartbeat: Date.now(),
      };
      state.users[socket.id] = userInfo;
      socket.join('efOiAhhNdL');
      socket.emit('login', { user: { name: userInfo.username, pic: user.pic, id: socket.id }, token: user.token || '', adminPower: adminPower });
      if (powers) {
        socket.emit('powers', powers);
        for (var j = 0; j < powers.length; j++) {
          if (powers[j].name === user.power) { userInfo.powers = powers[j]; socket.emit('power', powers[j]); break; }
        }
      }
      if (!userInfo.powers || !userInfo.powers.rank) { userInfo.powers = emptyPower; socket.emit('power', emptyPower); }
      socket.emit('emos', state.settings.emo || []);
      socket.emit('dro3', state.settings.dro3 || []);
      socket.emit('sicos', state.settings.sico || []);
      socket.emit('rlist', state.rooms);
      socket.emit('users-list', state.online);
      socket.emit('savetoken', { token: user.token || '' });
      syncOnline(userInfo);
      savelogin(userInfo, 'member');
    } catch (e) { logger.error('auth.login', 'Error', { error: e.message }); }
  });

  on('register', async function (data) {
    try {
      if (rateLimiter('register:' + socket.id, 2)) return;
      if (rateLimiter('register_ip:' + (data.ip || socket.handshake.address), 5)) { socket.emit('error-msg', { msg: 'طلبات تسجيل كثيرة، انتظر قليلاً' }); return; }
      if (!data || typeof data.name !== 'string' || typeof data.password !== 'string') return;
      var siteweb = state.settings.siteweb || {};
      if (!siteweb.allowreg) { socket.emit('error-msg', { msg: 'لا يمكنك تسجيل عضوية حاليا' }); return; }
      var username = data.name.trim();
      if (username.length > (siteweb.walllikes && siteweb.walllikes.lengthUserReg ? siteweb.walllikes.lengthUserReg : 50)) {
        socket.emit('error-msg', { msg: 'اسم المستخدم طويل جداً' }); return;
      }
      if (db.users.findOne({ topic: username })) { socket.emit('error-msg', { msg: 'هذا المستخدم مسجل من قبل' }); return; }
      var hash = await bcrypt.hash(data.password, SALT_ROUNDS);
      var allUsers = db.users.find({});
      db.users.create({
        topic: username, password: hash, id: helpers.stringGen(15), lid: helpers.stringGen(31),
        idreg: '#' + (allUsers.length + 1), token: data.token || helpers.stringGen(177), fp: data.fp || '', ip: data.ip || '', co: data.co || 'us',
        pic: 'pic.png', ucol: '#000000', mcol: '#000000', bg: '#ffffff', rep: 0, msg: '', power: '', evaluation: 0, stat: 0, loginG: false, documentationc: 0,
      });
      socket.emit('error-msg', { msg: 'تم تسجيل العضويه بنجاح', color: 'success' });
    } catch (e) { logger.error('auth.register', 'Error', { error: e.message }); }
  });

  on('logout', function () {
    var user = state.users[socket.id];
    var username = user ? user.username : null;
    if (state.users[socket.id]) delete state.users[socket.id];
    for (var i = state.online.length - 1; i >= 0; i--) {
      if (state.online[i].id === socket.id) { state.online.splice(i, 1); break; }
    }
    if (username) io.emit('user-left', { name: username });
  });

  on('istoken', function (data) {
    try {
      if (typeof data !== 'string' || !data) { socket.emit('errortoken', {}); return; }
      var user = db.users.findOne({ token: data });
      if (!user) { socket.emit('errortoken', {}); return; }
      var u = state.users[socket.id];
      if (u) {
        socket.emit('login', { user: { name: u.username, pic: u.pic, id: socket.id }, token: user.token, adminPower: u.username === require('../config').adminUser ? 999 : 0 });
        var powersCol = db.powers.find({});
        var powers = powersCol.length > 0 ? powersCol[0].powers : null;
        if (powers) socket.emit('powers', powers);
        socket.emit('users-list', state.online);
        return;
      }
      var deviceFp = socket.handshake.headers['user-agent'] || '';
      var ip = socket.handshake.address;
      var adminPower = user.topic === require('../config').adminUser ? 999 : 0;
      // Kick any older socket on the same account (multi-tab handling)
      for (var k = 0; k < state.online.length; k++) {
        if (state.online[k].lid === user.id && state.online[k].id !== socket.id) {
          var oldSock = io.sockets.sockets.get(state.online[k].id);
          if (oldSock) { oldSock.emit('duplicate-session', {}); oldSock.emit('kicked', {}); oldSock.disconnect(true); }
        }
      }
      var userInfo = {
        id: socket.id, username: user.topic || user.topic1 || user.username, uid: user.id, lid: user.lid, token: user.token || '',
        pic: user.pic || 'pic.png', ico: user.ico || '', ucol: user.ucol || '#000000', mcol: user.mcol || '#000000',
        bg: user.bg || '#ffffff', rep: user.rep || 0, rank: user.power || '', idreg: user.idreg || '',
        code: user.co || 'us', location: '', ip: ip, fp: deviceFp,
        stealth: false, ismuted: false, alerts: false, busy: false, powers: null, roomid: 'efOiAhhNdL', _lastHeartbeat: Date.now(),
      };
      state.users[socket.id] = userInfo;
      socket.join('efOiAhhNdL');
      socket.emit('login', { user: { name: userInfo.username, pic: userInfo.pic, id: socket.id }, token: user.token, adminPower: adminPower });
      var powersCol = db.powers.find({});
      var powers = powersCol.length > 0 ? powersCol[0].powers : null;
      if (powers) {
        socket.emit('powers', powers);
        for (var j = 0; j < powers.length; j++) {
          if (powers[j].name === user.power) { userInfo.powers = powers[j]; socket.emit('power', powers[j]); break; }
        }
      }
      if (!userInfo.powers) { userInfo.powers = emptyPower; socket.emit('power', emptyPower); }
      socket.emit('emos', state.settings.emo || []);
      socket.emit('dro3', state.settings.dro3 || []);
      socket.emit('sicos', state.settings.sico || []);
      socket.emit('rlist', state.rooms);
      socket.emit('users-list', state.online);
      state.addOnline({ id: socket.id, topic: user.topic || user.topic1 || user.username, topic1: user.topic || user.topic1 || user.username, pic: user.pic || 'pic.png', bg: user.bg || '#ffffff', ucol: user.ucol || '#000000', mcol: user.mcol || '#000000', msg: user.msg || '', power: user.power || '', rep: user.rep || 0, likes: user.likes || 0, co: user.co || 'us', roomid: 'efOiAhhNdL', lid: user.lid, idreg: user.idreg, ico: user.ico || '' });
      io.emit('user-joined', state.online[state.online.length - 1]);      setTimeout(function () { io.emit('room-changed', { roomId: 'efOiAhhNdL' }); }, 500);
    } catch (e) { logger.error('auth.istoken', 'Error', { error: e.message }); }
  });
};
