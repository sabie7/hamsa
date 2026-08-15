var logger = require('../logger');
var guard = require('./guard');

module.exports = function (io, socket, db, state, rateLimiter) {
  var on = guard.on(socket, 'bridge');

  /* ─═══ HANDLERS: client → server ═══─ */

  // Clear chat (admin/mod)
  on('clear-room-chat', function () {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 1) { socket.emit('msg:error', { msg: 'ليس لديك صلاحية' }); return; }
    io.emit('room-chat-cleared', { username: user.username, global: true });
  });

  // Quick chat
  on('quick-chat:send', function (data) {
    if (!state.users[socket.id]) { socket.emit('msg:error', { msg: 'يجب تسجيل الدخول أولاً' }); return; }
    var user = state.users[socket.id];
    if (!data || !data.msg) return;
    if (!state.quickChatHistory) state.quickChatHistory = [];
    var msgObj = { id: Date.now().toString(), user: user.username || 'مجهول', text: data.msg.substring(0, 500), time: new Date().toISOString() };
    state.quickChatHistory.unshift(msgObj);
    if (state.quickChatHistory.length > 100) state.quickChatHistory.pop();
    io.emit('quick-chat:new', msgObj);
  });

  // Zajel
  on('zajel:send', function (data) {
    if (!state.users[socket.id]) { socket.emit('msg:error', { msg: 'يجب تسجيل الدخول أولاً' }); return; }
    var user = state.users[socket.id];
    if (!data || !data.msg) return;
    if (!state.zajelMessages) state.zajelMessages = [];
    var msgObj = { id: Date.now().toString(), sender: user.username || 'مجهول', text: data.msg.substring(0, 150) };
    state.zajelMessages.unshift(msgObj);
    if (state.zajelMessages.length > 30) state.zajelMessages.pop();
    io.emit('zajel:new', msgObj);
  });

  on('remove_zajel', function (data) {
    if (!data || !data.id) return;
    if (state.zajelMessages) {
      state.zajelMessages = state.zajelMessages.filter(function (m) { return m.id !== data.id; });
    }
    io.emit('zajel:delete', { id: data.id });
  });

  // Get zajel messages after login
  on('getzajel', function () {
    socket.emit('zajel:list', state.zajelMessages || []);
  });

  // Get quick chat history after login
  on('getquickchat', function () {
    socket.emit('quick-chat:history', state.quickChatHistory || []);
  });

  on('clear_quickchat', function () {
    state.quickChatHistory = [];
    io.emit('quick-chat:clear', {});
  });

  on('quick-chat:clear', function () {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 1) return;
    state.quickChatHistory = [];
    io.emit('quick-chat:clear', {});
  });

  // Get extras (news ticker, admin ads)
  on('getextras', function () {
    socket.emit('news_ticker_updated', { text: (state.settings && state.settings.siteweb && state.settings.siteweb.newsTicker) || '' });
    socket.emit('admin_ads:updated', (state.settings && state.settings.ads) || []);
  });

  // Wall posts (handled in chat.js)
  on('wall_clear', function () {
    state.wallPosts = [];
    io.emit('wall_cleared', {});
  });

  // Like user
  on('like-user', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (!data || !data.name) return;
    io.emit('likes-updated', { target: data.name, likes: 1, from: user.username });
    socket.emit('like-success', { target: data.name, likes: 1, from: user.username });
  });

  // User interactions
  on('hug', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('hug-received', { from: user.username }); }
  });

  on('slap', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('slap-received', { from: user.username }); }
  });

  on('clap', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('clap-received', { from: user.username }); }
  });

  // Kiss (client emits 'kiss' directly, not via send_animation)
  on('kiss', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('kiss-animation', { from: user.username }); }
  });

  // Animation broadcasts
  on('send_animation', function (data) {
    if (!state.users[socket.id] || !data || !data.type) return;
    if (data.type === 'hearts') io.emit('animation:hearts', data.data || {});
    else if (data.type === 'gift') io.emit('animation:gift', data.data || {});
    else if (data.type === 'kiss') io.emit('kiss-animation', data.data || {});
    else io.emit('animation', data.data || {});
  });

  // Special entry
  on('special_entry', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('special-entry', { name: user.username, type: data && data.type, data: data });
  });

  // profile request (edit own profile or view a member)
  on('profile', function (data) {
    if (!data || !data.name) return;
    var name = String(data.name);
    // Resolve the target from the online registry first (match topic OR username,
    // since the client sends the display name which may differ from the login).
    var target = null;
    var lname = name.toLowerCase();
    for (var sid in state.users) {
      var u = state.users[sid];
      if (u.username && String(u.username).toLowerCase() === lname ||
          u.topic && String(u.topic).toLowerCase() === lname) { target = u; break; }
    }
    var isGuest = false;
    var dbUser = null;
    // Fall back to the DB so registered members resolve even when offline.
    if (!target) {
      dbUser = db.users.findOne({ $or: [{ topic: name }, { username: name }] });
      if (!dbUser) { socket.emit('profile', { error: 'المستخدم غير موجود' }); return; }
      isGuest = false;
      var online = null;
      for (var i = 0; i < state.online.length; i++) {
        if (state.online[i].lid === dbUser.id) { online = state.online[i]; break; }
      }
      socket.emit('profile', {
        name: dbUser.topic || dbUser.username, topic: dbUser.topic || dbUser.username,
        pic: dbUser.pic || 'pic.png', rep: dbUser.rep || 0,
        room: (online && online.roomid) || '', roomId: (online && online.roomid) || '',
        money: 0, about: dbUser.msg || '', msg: dbUser.msg || '',
        lastSeen: online ? 'متصل' : 'غير معروف', visitors: 0, power: dbUser.power || '',
        bg: dbUser.bg || '#ffffff', ucol: dbUser.ucol || '#000000',
        mcol: dbUser.mcol || '#000000', ico: dbUser.ico || '',
        co: dbUser.co || dbUser.code || 'us', idreg: dbUser.idreg || '',
        isGuest: false, wallPoints: 0, likes: dbUser.likes || 0,
        countryName: dbUser.location || '',
      });
      return;
    }
    var online = state.online.find(function (o) { return o.id === target.id; });
    dbUser = db.users.findOne({ id: target.uid });
    isGuest = !target.uid;
    socket.emit('profile', {
      name: target.username, topic: target.username, pic: target.pic || 'pic.png',
      rep: target.rep || 0, room: target.roomid || '', roomId: target.roomid || '',
      money: 0, about: dbUser ? dbUser.msg : '', msg: dbUser ? dbUser.msg : '',
      lastSeen: online ? 'متصل' : 'غير معروف', visitors: 0, power: target.rank || '',
      bg: target.bg || '#ffffff', ucol: target.ucol || '#000000',
      mcol: target.mcol || '#000000', ico: target.ico || '',
      co: target.code || 'us', idreg: target.idreg || '',
      isGuest: isGuest, wallPoints: 0, likes: target.likes || 0,
      countryName: target.location || '',
    });
  });

  // User online-status update
  on('user:set-status', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    var status = (data && data.status) || 'online';
    io.emit('user:online-status', { name: user.username, status: status });
  });

  // User profile update notification
  on('user:profile-changed', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('user:profile-update', { name: user.username, changes: data || {} });
  });

  // Muted users list
  on('get_muted_users', function () {
    var muted = [];
    for (var sid in state.users) {
      if (state.users[sid].ismuted) muted.push(state.users[sid].username);
    }
    socket.emit('muted:users-list', muted);
  });

  // Nicknames list
  on('get_nicknames', function () {
    socket.emit('nicknames:list', []); // stub
  });

  // Room full list
  on('get_rooms_full', function () {
    socket.emit('rooms:full-list', state.rooms || []);
    socket.emit('rooms:list-updated', {});
  });

  // Activity / heartbeat
  on('activity', function () {
    if (state.users[socket.id]) state.users[socket.id]._lastHeartbeat = Date.now();
  });

  on('presence:idle', function (data) {
    if (state.users[socket.id]) state.users[socket.id].idle = !!(data && data.reason);
  });

  // ─═══ Stories ═══─
  if (!state.stories) state.stories = [];

  on('story:add', function (data) {
    if (!state.users[socket.id] || !data || !data.image) return;
    var user = state.users[socket.id];
    var story = { id: Date.now().toString(), user: user.username, pic: user.pic || 'pic.png', image: data.image, text: data.text || '', time: Date.now(), expires: Date.now() + 86400000 };
    state.stories.unshift(story);
    if (state.stories.length > 50) state.stories.pop();
    io.emit('story:instant', { user: user.username, image: data.image, text: data.text });
    io.emit('stories:updated', { stories: state.stories.slice(0, 20) });
  });

  on('stories:get', function () {
    socket.emit('stories:updated', { stories: state.stories.slice(0, 20) });
  });

  on('stories:clear', function () {
    state.stories = [];
    io.emit('stories_cleared', {});
  });

  // ─═══ Battles ═══─
  if (!state.battles) state.battles = [];

  on('battle:create', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    var battle = { id: Date.now().toString(), creator: user.username, status: 'waiting', opponent: null };
    state.battles.push(battle);
    io.emit('battle:created', { id: battle.id, creator: user.username, data: data });
  });

  on('battle:invite', function (data) {
    if (!state.users[socket.id] || !data || !data.target) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.target);
    if (tid) { io.to(tid).emit('battle:invited', { opponent: user.username, id: data.id }); }
  });

  on('battle:sync', function () {
    var user = state.users[socket.id];
    if (!user) return;
    socket.emit('battle:sync', { battles: state.battles, user: user.username });
  });

  on('battle:syncState', function () { /* stub */ });

  // ─═══ Admin extensions ═══─
  on('admin:alert', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 5) return;
    io.emit('admin:alert', { msg: data && data.msg, title: data && data.title });
  });

  on('banned:notify', function (data) {
    if (!data || !data.name) return;
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('banned', { reason: data.reason || '', duration: data.duration || 0 }); }
  });

  on('report-user', function (data) {
    logger.warn('frontend-bridge.report', 'User report', { target: data ? data.name : null, by: socket.id });
    socket.emit('report:submitted', {});
  });

  // Ban from room
  on('ban-room', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    if (user.power < 1) { socket.emit('msg:error', { msg: 'ليس لديك صلاحية' }); return; }
    var tid = state.findSocketId(data.name);
    if (tid) {
      io.to(tid).emit('kicked', { reason: 'تم حظرك من الغرفة', by: user.username });
      io.to(tid).emit('room-chat-cleared', { username: data.name, global: false });
    }
  });

  // Manage room request
  on('manage_room', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    socket.emit('msg:error', { msg: 'طلب إدارة الغرفة - قيد التطوير' });
  });

  // Send ad
  on('send_ad', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('message', { type: 'msg', user: '🔊 إعلان', msg: 'إعلان من ' + user.username + ' - شكراً لاستخدامك شات نجم عمان', color: '#ff9800', pic: 'pic.png', room: user.roomid });
  });

  on('broadcast:system', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 5) return;
    io.emit('system-message', { msg: data && data.msg, type: data && data.type || 'info' });
  });

  on('broadcast:live', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 5) return;
    io.emit('broadcast:live', { msg: data && data.msg, from: user.username });
  });

  on('presence:room-history', function () {
    var roomUsers = [];
    for (var sid in state.users) {
      if (state.users[sid].roomid) {
        roomUsers.push({ id: sid, name: state.users[sid].username, pic: state.users[sid].pic, status: state.users[sid].idle ? 'idle' : 'online' });
      }
    }
    socket.emit('presence:room-history', { users: roomUsers });
  });

  // Notification stubs
  on('send:notification', function (data) {
    if (!state.users[socket.id] || !data || !data.to) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.to);
    if (tid) { io.to(tid).emit('private-notification', { from: user.username, text: data.text || '', type: data.type || 'info' }); }
  });

  on('send:public-notification', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('notification', { from: user.username, text: data && data.text, type: (data && data.type) || 'info' });
  });

  // Reputation update request
  on('rep:update', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid && state.users[tid]) {
      state.users[tid].rep = (state.users[tid].rep || 0) + (data.amount || 1);
      io.emit('rep-updated', { name: data.name, rep: state.users[tid].rep, by: user.username });
      io.emit('user_updated', { id: tid, rep: state.users[tid].rep });
    }
  });

  // ─═══ Admin command handler ═══─
  on('admin', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 5) { socket.emit('msg:error', { msg: 'ليس لديك صلاحية إدارية' }); return; }
    var cmd = data && data.cmd;
    var d = data && data.data;
    if (cmd === 'backup') {
      socket.emit('savedone', {});
    } else if (cmd === 'reload') {
      io.emit('reload_site', {});
    } else if (cmd === 'broadcast') {
      io.emit('admin:broadcast', { msg: d && d.msg });
    } else if (cmd === 'alert') {
      io.emit('alert:show', { title: d && d.title, text: d && d.text, icon: 'info' });
    } else if (cmd === 'restart') {
      io.emit('server_restarting', { msg: d && d.msg || 'سيتم إعادة تشغيل السيرفر' });
    }
  });

  // ─═══ Helpers ═══─
};


