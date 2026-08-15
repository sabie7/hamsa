var helpers = require('../utils/helpers');
var logger = require('../logger');
var guard = require('./guard');

var MAX_MSG_LEN = 2000;
var DEFAULT_ROOM_ID = 'efOiAhhNdL';

module.exports = function (io, socket, db, state, rateLimiter) {
  var on = guard.on(socket, 'chat');
  var wallPosts = [];
  state.wallPosts = wallPosts;

  function filterText(text) {
    var noletters = db.noletters.getAll() || [];
    for (var i = 0; i < noletters.length; i++) {
      var n = noletters[i];
      if (n.type === 'bmsgs' || n.type === 'amsgs') {
        var re = new RegExp(helpers.escapeRegex(n.v || n), 'gi');
        text = text.replace(re, '***');
      }
    }
    return text;
  }

  on('message', function (data) {
    try {
      if (!data || typeof data.msg !== 'string') return;
      var user = state.users[socket.id];
      if (!user) return;
      if (user.ismuted) { socket.emit('alert', { msg: 'أنت مكتوم الصوت' }); return; }
      if (rateLimiter(socket.id + '_msg', 3)) { socket.emit('msg:rate-limit', { msg: 'الرجاء الانتظار قبل إرسال رسالة أخرى' }); return; }
      var msg = helpers.escapeHtml(filterText(data.msg)).substring(0, MAX_MSG_LEN);
      if (!msg.trim()) return;
      var item = { type: 'msg', user: user.username, msg: msg, color: user.ucol || '#fff', pic: user.pic || 'pic.png', room: user.roomid };
      // Room-scoped broadcast: only clients in the sender's room receive the
      // message instead of a global io.emit() to every connected client.
      io.to(user.roomid || DEFAULT_ROOM_ID).emit('message', item);
    } catch (e) { logger.error('chat.message', 'Error', { error: e.message }); }
  });

  on('send_pm', function (data) {
    try {
      if (!data || typeof data.msg !== 'string' || typeof data.to !== 'string') return;
      var user = state.users[socket.id];
      if (!user) return;
      var msg = helpers.escapeHtml(filterText(data.msg)).substring(0, MAX_MSG_LEN);
      if (!msg.trim()) return;
      var targetId = null;
      for (var sid in state.users) {
        if (state.users[sid].username === data.to) { targetId = sid; break; }
      }
      var item = { type: 'pm', user: user.username, msg: msg, color: user.ucol || '#4FC3F7', from: user.username };
      if (targetId) io.to(targetId).emit('pm', item);
      socket.emit('pm', item);
    } catch (e) { logger.error('chat.send_pm', 'Error', { error: e.message }); }
  });

  on('wallpost', function (data) {
    try {
      if (!data || typeof data.msg !== 'string' || !data.msg.trim()) return;
      if (rateLimiter(socket.id + '_wall', 1)) return;
      var user = state.users[socket.id];
      if (!user) return;
      var post = { id: helpers.stringGen(12), name: user.username, pic: user.pic || 'pic.png', msg: helpers.escapeHtml(data.msg).substring(0, 500), likes: [], comments: [], time: Date.now() };
      wallPosts.unshift(post);
      if (wallPosts.length > 50) wallPosts.pop();
      io.emit('wall-update', post);
    } catch (e) { logger.error('chat.wallpost', 'Error', { error: e.message }); }
  });

  on('walllike', function (data) {
    try {
      if (!data || typeof data.id !== 'string') return;
      var user = state.users[socket.id];
      if (!user) return;
      for (var i = 0; i < wallPosts.length; i++) {
        if (wallPosts[i].id === data.id && wallPosts[i].likes.indexOf(socket.id) === -1) {
          wallPosts[i].likes.push(socket.id);
          io.emit('likes-updated', { id: data.id, likes: wallPosts[i].likes });
          break;
        }
      }
    } catch (e) {}
  });

  on('wallcomment', function (data) {
    try {
      if (!data || typeof data.id !== 'string' || typeof data.msg !== 'string') return;
      var user = state.users[socket.id];
      if (!user) return;
      for (var i = 0; i < wallPosts.length; i++) {
        if (wallPosts[i].id === data.id) {
          wallPosts[i].comments.push({ name: user.username, msg: helpers.escapeHtml(data.msg).substring(0, 200) });
          io.emit('wallcomment', { id: data.id, comments: wallPosts[i].comments });
          break;
        }
      }
    } catch (e) {}
  });

  on('delwall', function (data) {
    try {
      if (!data || typeof data.id !== 'string') return;
      var idx = wallPosts.findIndex(function (p) { return p.id === data.id; });
      if (idx >= 0) { wallPosts.splice(idx, 1); io.emit('delwall', { id: data.id }); }
    } catch (e) {}
  });

  on('getwall', function () {
    socket.emit('wall-stats', wallPosts.slice(0, 20));
  });

  // Group chat
  var groups = state.groups = state.groups || {};

  on('grp_msg', function (data) {
    try {
      if (!data || typeof data.grpId !== 'string' || typeof data.msg !== 'string') return;
      var user = state.users[socket.id];
      if (!user) return;
      var g = groups[data.grpId];
      if (!g) return;
      var msg = helpers.escapeHtml(data.msg.substring(0, 500));
      io.to('grp_' + data.grpId).emit('addGrMsg', { type: 'msg', grpId: data.grpId, name: user.username, msg: msg });
    } catch (e) { logger.error('chat.grp_msg', 'Error', { error: e.message }); }
  });

  on('addGr', function (data) {
    try {
      if (!data || typeof data.name !== 'string' || !data.name.trim()) return;
      var user = state.users[socket.id];
      if (!user) return;
      var gid = helpers.stringGen(8);
      groups[gid] = { id: gid, name: data.name.substring(0, 30), owner: socket.id, users: [socket.id], msgs: [] };
      socket.join('grp_' + gid);
      socket.emit('addGrMsg', { type: 'grp_created', grpId: gid, name: data.name });
      io.emit('grplist', { groups: groups });
    } catch (e) { logger.error('chat.addGr', 'Error', { error: e.message }); }
  });

  on('jogr', function (data) {
    try {
      if (!data || typeof data.grpId !== 'string') return;
      var user = state.users[socket.id];
      if (!user) return;
      var g = groups[data.grpId];
      if (!g) return;
      if (g.users.indexOf(socket.id) === -1) g.users.push(socket.id);
      socket.join('grp_' + data.grpId);
      io.to('grp_' + data.grpId).emit('addGrMsg', { type: 'jogr', grpId: data.grpId, user: user.username, uid: socket.id });
    } catch (e) {}
  });

  on('addUsersJoin', function (data) {
    try {
      if (!data || typeof data.grpId !== 'string' || !Array.isArray(data.users)) return;
      var user = state.users[socket.id];
      if (!user) return;
      var g = groups[data.grpId];
      if (!g || g.owner !== socket.id) return;
      data.users.forEach(function (uid) {
        if (g.users.indexOf(uid) === -1) g.users.push(uid);
        var s = io.sockets.sockets.get(uid);
        if (s) { s.join('grp_' + data.grpId); s.emit('addGrMsg', { type: 'addUsers', grpId: data.grpId, users: g.users }); }
      });
    } catch (e) {}
  });

  on('removUsers', function (data) {
    try {
      if (!data || typeof data.grpId !== 'string' || !Array.isArray(data.users)) return;
      var g = groups[data.grpId];
      if (!g || g.owner !== socket.id) return;
      data.users.forEach(function (uid) {
        g.users = g.users.filter(function (x) { return x !== uid; });
        var s = io.sockets.sockets.get(uid);
        if (s) s.leave('grp_' + data.grpId);
      });
    } catch (e) {}
  });

  on('closeGrupe', function (data) {
    try {
      if (!data || typeof data.grpId !== 'string') return;
      var g = groups[data.grpId];
      if (!g || g.owner !== socket.id) return;
      io.to('grp_' + data.grpId).emit('addGrMsg', { type: 'closeGrupe', grpId: data.grpId });
      delete groups[data.grpId];
    } catch (e) {}
  });

  on('leaveGrupe', function (data) {
    try {
      if (!data || typeof data.grpId !== 'string') return;
      var g = groups[data.grpId];
      if (!g) return;
      g.users = g.users.filter(function (x) { return x !== socket.id; });
      socket.leave('grp_' + data.grpId);
      if (g.users.length === 0) delete groups[data.grpId];
    } catch (e) {}
  });

  // User actions (kick, ban, like, mute, etc.)
  on('like-user', function (data) {
    try {
      if (!data || typeof data.name !== 'string') return;
      var tid = state.findSocketId(data.name);
      if (tid && state.users[tid]) { state.users[tid].rep = (state.users[tid].rep || 0) + 1; io.emit('user_updated', { id: tid, rep: state.users[tid].rep }); }
    } catch (e) {}
  });

  on('kick-user', function (data) {
    try {
      if (!data || typeof data.name !== 'string') return;
      var tid = state.findSocketId(data.name);
      if (tid) { var s = io.sockets.sockets.get(tid); if (s) s.emit('kicked', {}); }
    } catch (e) {}
  });

  on('ban-user', function (data) {
    try {
      if (!data || typeof data.name !== 'string') return;
      var tid = state.findSocketId(data.name);
      if (tid && state.users[tid]) {
        db.bands.create({ device_band: state.users[tid].fp || '', ip_band: state.users[tid].ip || '', date: new Date().toISOString(), name_band: typeof data.reason === 'string' ? data.reason.substring(0, 200) : 'مخالفة القوانين' });
        var s = io.sockets.sockets.get(tid); if (s) s.emit('kicked', {});
      }
    } catch (e) {}
  });

  on('delpic', function (data) {
    try {
      if (!data || typeof data.name !== 'string') return;
      var tid = state.findSocketId(data.name);
      if (tid && state.users[tid]) { state.users[tid].pic = 'pic.png'; io.emit('user_updated', { id: tid, pic: 'pic.png' }); var dbUser = db.users.findOne({ id: state.users[tid].uid }); if (dbUser) { dbUser.pic = 'pic.png'; db.users.updateOne({ id: state.users[tid].uid }, { $set: { pic: 'pic.png' } }); } }
    } catch (e) {}
  });

  on('mute', function (data) {
    try {
      if (!data || typeof data.name !== 'string') return;
      var tid = state.findSocketId(data.name);
      if (tid && state.users[tid]) { state.users[tid].ismuted = data.value !== false; var s = io.sockets.sockets.get(tid); if (s) s.emit('muted', { seconds: typeof data.seconds === 'number' ? data.seconds : 0, reason: typeof data.reason === 'string' ? data.reason : '' }); }
    } catch (e) {}
  });

  on('gift', function (data) {
    try {
      if (!data || typeof data.name !== 'string' || !data.gift) return;
      var user = state.users[socket.id];
      if (!user) return;
      var tid = state.findSocketId(data.name);
      if (tid) { io.emit('gift', { from: user.username, to: data.name, gift: data.gift }); }
    } catch (e) {}
  });

  on('roomkick', function (data) {
    try {
      if (!data || typeof data.name !== 'string') return;
      var tid = state.findSocketId(data.name);
      if (tid && state.users[tid]) {
        state.users[tid].roomid = DEFAULT_ROOM_ID;
        var s = io.sockets.sockets.get(tid);
        if (s) { s.join(DEFAULT_ROOM_ID); io.emit('room-changed', { roomId: DEFAULT_ROOM_ID }); }
      }
    } catch (e) {}
  });

  on('report', function (data) {
    logger.warn('chat.report', 'User reported', { target: data && typeof data.name === 'string' ? data.name : null, by: socket.id });
  });

  on('setpower', function (data) {
    try {
      if (!data || typeof data.name !== 'string' || typeof data.powerName !== 'string') return;
      var tid = state.findSocketId(data.name);
      if (tid && state.users[tid]) {
        state.users[tid].rank = data.powerName;
        io.emit('user_updated', { id: tid, power: data.powerName });
        var dbUser = db.users.findOne({ id: state.users[tid].uid });
        if (dbUser) { dbUser.power = data.powerName; db.users.updateOne({ id: dbUser.id }, { $set: { power: data.powerName } }); }
        for (var i = 0; i < state.online.length; i++) { if (state.online[i].id === tid) { state.online[i].power = data.powerName; break; } }
      }
    } catch (e) { logger.error('chat.setpower', 'Error', { error: e.message }); }
  });

  on('fltrAction', function (data) {
    try {
      if (!data || typeof data.type !== 'string' || typeof data.value !== 'string') return;
      var noletters = db.noletters.getAll() || [];
      noletters.push({ type: data.type, v: data.value });
      db.noletters.setAll(noletters);
      socket.emit('savedone', {});
    } catch (e) {}
  });

  on('delmsg', function (data) {
    try { if (!data || typeof data.id !== 'string') return; io.emit('delete-message', { id: data.id }); } catch (e) {}
  });

  on('top10', function () {
    var allUsers = db.users.find({});
    var sorted = allUsers.sort(function (a, b) { return (b.rep || 0) - (a.rep || 0); }).slice(0, 10);
    socket.emit('top10', sorted.map(function (u) { return { name: u.topic, rep: u.rep || 0 }; }));
  });
};
