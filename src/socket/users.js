var helpers = require('../utils/helpers');
var logger = require('../logger');
var guard = require('./guard');

module.exports = function (io, socket, db, state, rateLimiter) {
  var on = guard.on(socket, 'users');

  on('get_user_info', function (data) {
    try {
      if (!data || typeof data.name !== 'string') return;
      var name = data.name;
      var target = null;
      var lname = name.toLowerCase();
      for (var sid in state.users) {
        var u = state.users[sid];
        if (u.username && String(u.username).toLowerCase() === lname ||
            u.topic && String(u.topic).toLowerCase() === lname) { target = u; break; }
      }
      var isGuest = false;
      var dbUser = null;
      if (!target) {
        dbUser = db.users.findOne({ $or: [{ topic: name }, { username: name }] });
        if (!dbUser) { socket.emit('userinfo', { error: 'المستخدم غير موجود' }); return; }
        var online = null;
        for (var i = 0; i < state.online.length; i++) {
          if (state.online[i].lid === dbUser.id) { online = state.online[i]; break; }
        }
        socket.emit('userinfo', {
          name: dbUser.topic || dbUser.username,
          topic: dbUser.topic || dbUser.username,
          topic1: dbUser.topic || dbUser.username,
          pic: dbUser.pic || 'pic.png',
          rep: dbUser.rep || 0,
          room: (online && online.roomid) || '',
          roomId: (online && online.roomid) || '',
          money: 0,
          msg: dbUser.msg || '',
          lastSeen: online ? 'متصل' : 'غير معروف',
          visitors: 0,
          power: dbUser.power || '',
          co: dbUser.co || dbUser.code || 'us',
          ucol: dbUser.ucol || '#000000',
          mcol: dbUser.mcol || '#000000',
          bg: dbUser.bg || '#ffffff',
          ico: dbUser.ico || '',
          idreg: dbUser.idreg || '',
          isGuest: false,
          wallPoints: 0,
          likes: dbUser.likes || 0,
          countryName: dbUser.location || '',
        });
        return;
      }
      var online = state.online.find(function (o) { return o.id === target.id; });
      dbUser = db.users.findOne({ id: target.uid });
      isGuest = !target.uid;
      socket.emit('userinfo', {
        name: target.username,
        topic: target.topic || target.username,
        topic1: target.topic1 || target.topic || target.username,
        pic: target.pic || 'pic.png',
        rep: target.rep || 0,
        room: target.roomid || '',
        roomId: target.roomid || '',
        money: 0,
        msg: dbUser ? dbUser.msg : '',
        lastSeen: online ? 'متصل' : 'غير معروف',
        visitors: 0,
        power: target.rank || '',
        co: target.code || 'us',
        ucol: target.ucol || '#000000',
        mcol: target.mcol || '#000000',
        bg: target.bg || '#ffffff',
        ico: target.ico || '',
        idreg: target.idreg || '',
        isGuest: isGuest,
        wallPoints: 0,
        likes: target.likes || 0,
        countryName: target.location || '',
      });
    } catch (e) { logger.error('users.get_user_info', 'Error', { error: e.message }); }
  });

  on('typing', function () {
    try {
      var u = state.users[socket.id];
      if (!u) return;
      socket.broadcast.emit('typing', { name: u.username });
    } catch (e) {}
  });

  on('setprofile', function (data) {
    try {
      if (!data || typeof data !== 'object') return;
      var u = state.users[socket.id];
      if (!u) return;
      var dbUser = db.users.findOne({ id: u.uid });
      if (!dbUser) return;
      if (typeof data.msg === 'string') { dbUser.msg = helpers.escapeHtml(data.msg).substring(0, 200); db.users.updateOne({ id: u.uid }, { $set: { msg: dbUser.msg } }); }
      if (typeof data.bg === 'string' && data.bg.length <= 20) { dbUser.bg = data.bg; u.bg = data.bg; db.users.updateOne({ id: u.uid }, { $set: { bg: data.bg } }); }
      if (typeof data.pic === 'string' && data.pic.length <= 200) { dbUser.pic = data.pic; u.pic = data.pic; db.users.updateOne({ id: u.uid }, { $set: { pic: data.pic } }); }
      if (typeof data.ucol === 'string' && data.ucol.length <= 20) { dbUser.ucol = data.ucol; db.users.updateOne({ id: u.uid }, { $set: { ucol: data.ucol } }); }
      if (typeof data.mcol === 'string' && data.mcol.length <= 20) { dbUser.mcol = data.mcol; db.users.updateOne({ id: u.uid }, { $set: { mcol: data.mcol } }); }
      if (typeof data.fontColor === 'string' && data.fontColor.length <= 20) { dbUser.fontColor = data.fontColor; db.users.updateOne({ id: u.uid }, { $set: { fontColor: data.fontColor } }); }
      if (typeof data.topic === 'string') { dbUser.topic = helpers.escapeHtml(data.topic).substring(0, 50); u.username = dbUser.topic; db.users.updateOne({ id: u.uid }, { $set: { topic: dbUser.topic } }); }
      for (var i = 0; i < state.online.length; i++) {
        if (state.online[i].lid === dbUser.lid) {
          if (typeof data.msg === 'string') state.online[i].msg = dbUser.msg;
          if (data.bg) { state.online[i].bg = data.bg; }
          if (data.pic) { state.online[i].pic = data.pic; }
          if (typeof data.topic === 'string') { state.online[i].topic = dbUser.topic; }
          io.emit('user_updated', { id: socket.id, pic: u.pic, bg: u.bg, ucol: dbUser.ucol, mcol: dbUser.mcol, fontColor: dbUser.fontColor, msg: dbUser.msg, topic: dbUser.topic || u.username });
          break;
        }
      }
      socket.emit('savedone', {});
    } catch (e) { logger.error('users.setprofile', 'Error', { error: e.message }); }
  });

  on('setpass', async function (data) {
    try {
      if (!data || typeof data.password !== 'string' || !data.password) return;
      var u = state.users[socket.id];
      if (!u) return;
      var dbUser = db.users.findOne({ id: u.uid });
      if (!dbUser) return;
      var hash = await require('bcryptjs').hash(data.password, 10);
      dbUser.password = hash;
      db.users.updateOne({ id: u.uid }, { $set: { password: hash } });
      socket.emit('savedone', {});
    } catch (e) { logger.error('users.setpass', 'Error', { error: e.message }); }
  });

  on('delete_account', function () {
    try {
      var u = state.users[socket.id];
      if (!u) return;
      db.users.deleteOne({ id: u.uid });
      socket.emit('savedone', {});
      socket.disconnect(true);
    } catch (e) { logger.error('users.delete_account', 'Error', { error: e.message }); }
  });

  // ── Reveal names (admin-only) — restored from sor/1 (3).txt ──
  // Matches the target account against every other account sharing the same
  // device fingerprint or IP (live sockets + persisted member records).
  on('reveal:names', function (data) {
    try {
      if (!socket.isAdmin) { socket.emit('reveal:names', { error: 'هذه الخاصية للمشرفين فقط' }); return; }
      if (!data || typeof data.name !== 'string') return;
      var name = String(data.name);
      var target = null;
      var lname = name.toLowerCase();
      for (var sid in state.users) {
        var u = state.users[sid];
        if (u && u.username && String(u.username).toLowerCase() === lname ||
            u && u.topic && String(u.topic).toLowerCase() === lname) { target = u; break; }
      }
      var dbTarget = null;
      if (!target) {
        dbTarget = db.users.findOne({ $or: [{ topic: name }, { username: name }] });
        if (!dbTarget) { socket.emit('reveal:names', { error: 'المستخدم غير موجود' }); return; }
      }
      var fp = target ? (target.fp || '') : (dbTarget.fp || '');
      var ip = target ? (target.ip || '') : (dbTarget.ip || '');
      var rows = [];
      var seen = {};
      function push(row) {
        if (!row || !row.name || seen[row.name]) return;
        seen[row.name] = true;
        rows.push(row);
      }
      for (var s2 in state.users) {
        var u2 = state.users[s2];
        if (!u2 || !u2.username) continue;
        var reason = null;
        if (fp && u2.fp && String(u2.fp) === String(fp)) reason = 'البصمة';
        else if (ip && u2.ip && String(u2.ip) === String(ip)) reason = 'IP';
        if (!reason) continue;
        push({
          name: u2.topic || u2.username,
          type: u2.uid ? 'عضو' : 'زائر',
          status: 'متصل الآن',
          rank: u2.rank || '',
          match: reason,
          source: 'مباشر',
          ip: u2.ip || '',
          fp: u2.fp || '',
          device: u2.code || '',
        });
      }
      var allUsers = db.users.find({});
      if (allUsers && allUsers.length) {
        allUsers.forEach(function (du) {
          if (!du || !du.topic) return;
          var reason2 = null;
          if (fp && du.fp && String(du.fp) === String(fp)) reason2 = 'البصمة';
          else if (ip && du.ip && String(du.ip) === String(ip)) reason2 = 'IP';
          if (!reason2) return;
          push({
            name: du.topic,
            type: 'عضو',
            status: '',
            rank: du.power || '',
            match: reason2,
            source: 'القاعدة',
            ip: du.ip || '',
            fp: du.fp || '',
            device: du.co || du.code || '',
          });
        });
      }
      socket.emit('reveal:names', {
        target: target ? (target.topic || target.username) : (dbTarget.topic || dbTarget.username),
        rows: rows,
      });
    } catch (e) { logger.error('users.reveal_names', 'Error', { error: e.message }); }
  });
};
