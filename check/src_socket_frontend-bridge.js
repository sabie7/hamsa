var logger = require('../logger');

module.exports = function (io, socket, db, state, rateLimiter) {

  /* ─═══ HANDLERS: client → server ═══─ */

  // Clear chat (admin/mod)
  socket.on('clear-room-chat', function () {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 1) { socket.emit('msg:error', { msg: 'ليس لديك صلاحية' }); return; }
    io.emit('room-chat-cleared', { username: user.username, global: true });
  });

  // Quick chat
  socket.on('quick-chat:send', function (data) {
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
  socket.on('zajel:send', function (data) {
    if (!state.users[socket.id]) { socket.emit('msg:error', { msg: 'يجب تسجيل الدخول أولاً' }); return; }
    var user = state.users[socket.id];
    if (!data || !data.msg) return;
    if (!state.zajelMessages) state.zajelMessages = [];
    var msgObj = { id: Date.now().toString(), sender: user.username || 'مجهول', text: data.msg.substring(0, 150) };
    state.zajelMessages.unshift(msgObj);
    if (state.zajelMessages.length > 30) state.zajelMessages.pop();
    io.emit('zajel:new', msgObj);
  });

  socket.on('remove_zajel', function (data) {
    if (!data || !data.id) return;
    if (state.zajelMessages) {
      state.zajelMessages = state.zajelMessages.filter(function (m) { return m.id !== data.id; });
    }
    io.emit('zajel:delete', { id: data.id });
  });

  // Get zajel messages after login
  socket.on('getzajel', function () {
    socket.emit('zajel:list', state.zajelMessages || []);
  });

  // Get quick chat history after login
  socket.on('getquickchat', function () {
    socket.emit('quick-chat:history', state.quickChatHistory || []);
  });

  socket.on('clear_quickchat', function () {
    state.quickChatHistory = [];
    io.emit('quick-chat:clear', {});
  });

  socket.on('quick-chat:clear', function () {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 1) return;
    state.quickChatHistory = [];
    io.emit('quick-chat:clear', {});
  });

  // Get extras (news ticker, admin ads)
  socket.on('getextras', function () {
    socket.emit('news_ticker_updated', { text: (state.settings && state.settings.siteweb && state.settings.siteweb.newsTicker) || '' });
    socket.emit('admin_ads:updated', (state.settings && state.settings.ads) || []);
  });

  // Wall posts (handled in chat.js)
  socket.on('wall_clear', function () {
    state.wallPosts = [];
    io.emit('wall_cleared', {});
  });

  // Like user
  socket.on('like-user', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (!data || !data.name) return;
    io.emit('likes-updated', { target: data.name, likes: 1, from: user.username });
    socket.emit('like-success', { target: data.name, likes: 1, from: user.username });
  });

  // User interactions
  socket.on('hug', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('hug-received', { from: user.username }); }
  });

  socket.on('slap', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('slap-received', { from: user.username }); }
  });

  socket.on('clap', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('clap-received', { from: user.username }); }
  });

  // Kiss (client emits 'kiss' directly, not via send_animation)
  socket.on('kiss', function (data) {
    if (!state.users[socket.id] || !data || !data.name) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('kiss-animation', { from: user.username }); }
  });

  // Animation broadcasts
  socket.on('send_animation', function (data) {
    if (!state.users[socket.id] || !data || !data.type) return;
    if (data.type === 'hearts') io.emit('animation:hearts', data.data || {});
    else if (data.type === 'gift') io.emit('animation:gift', data.data || {});
    else if (data.type === 'kiss') io.emit('kiss-animation', data.data || {});
    else io.emit('animation', data.data || {});
  });

  // Special entry
  socket.on('special_entry', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('special-entry', { name: user.username, type: data && data.type, data: data });
  });

  // profile request (edit own profile)
  socket.on('profile', function (data) {
    if (!data || !data.name) return;
    var target = null;
    for (var sid in state.users) {
      if (state.users[sid].username === data.name) { target = state.users[sid]; break; }
    }
    if (!target) { socket.emit('profile', { error: 'المستخدم غير موجود' }); return; }
    var online = state.online.find(function (o) { return o.id === target.id; });
    var dbUser = db.users.findOne({ id: target.uid });
    var isGuest = !target.uid;
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
  socket.on('user:set-status', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    var status = (data && data.status) || 'online';
    io.emit('user:online-status', { name: user.username, status: status });
  });

  // User profile update notification
  socket.on('user:profile-changed', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('user:profile-update', { name: user.username, changes: data || {} });
  });

  // Muted users list
  socket.on('get_muted_users', function () {
    var muted = [];
    for (var sid in state.users) {
      if (state.users[sid].ismuted) muted.push(state.users[sid].username);
    }
    socket.emit('muted:users-list', muted);
  });

  // Nicknames list
  socket.on('get_nicknames', function () {
    socket.emit('nicknames:list', []); // stub
  });

  // Room full list
  socket.on('get_rooms_full', function () {
    socket.emit('rooms:full-list', state.rooms || []);
    socket.emit('rooms:list-updated', {});
  });

  // Activity / heartbeat
  socket.on('activity', function () {
    if (state.users[socket.id]) state.users[socket.id]._lastHeartbeat = Date.now();
  });

  socket.on('presence:idle', function (data) {
    if (state.users[socket.id]) state.users[socket.id].idle = !!(data && data.reason);
  });

  // ─═══ Stories ═══─
  if (!state.stories) state.stories = [];

  socket.on('story:add', function (data) {
    if (!state.users[socket.id] || !data || !data.image) return;
    var user = state.users[socket.id];
    var story = { id: Date.now().toString(), user: user.username, pic: user.pic || 'pic.png', image: data.image, text: data.text || '', time: Date.now(), expires: Date.now() + 86400000 };
    state.stories.unshift(story);
    if (state.stories.length > 50) state.stories.pop();
    io.emit('story:instant', { user: user.username, image: data.image, text: data.text });
    io.emit('stories:updated', { stories: state.stories.slice(0, 20) });
  });

  socket.on('stories:get', function () {
    socket.emit('stories:updated', { stories: state.stories.slice(0, 20) });
  });

  socket.on('stories:clear', function () {
    state.stories = [];
    io.emit('stories_cleared', {});
  });

  // ─═══ Battles ═══─
  if (!state.battles) state.battles = [];

  socket.on('battle:create', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    var battle = { id: Date.now().toString(), creator: user.username, status: 'waiting', opponent: null };
    state.battles.push(battle);
    io.emit('battle:created', { id: battle.id, creator: user.username, data: data });
  });

  socket.on('battle:invite', function (data) {
    if (!state.users[socket.id] || !data || !data.target) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.target);
    if (tid) { io.to(tid).emit('battle:invited', { opponent: user.username, id: data.id }); }
  });

  socket.on('battle:sync', function () {
    var user = state.users[socket.id];
    if (!user) return;
    socket.emit('battle:sync', { battles: state.battles, user: user.username });
  });

  socket.on('battle:syncState', function () { /* stub */ });

  // ─═══ Admin extensions ═══─
  socket.on('admin:alert', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 5) return;
    io.emit('admin:alert', { msg: data && data.msg, title: data && data.title });
  });

  socket.on('banned:notify', function (data) {
    if (!data || !data.name) return;
    var tid = state.findSocketId(data.name);
    if (tid) { io.to(tid).emit('banned', { reason: data.reason || '', duration: data.duration || 0 }); }
  });

  socket.on('report-user', function (data) {
    logger.warn('frontend-bridge.report', 'User report', { target: data ? data.name : null, by: socket.id });
    socket.emit('report:submitted', {});
  });

  // Ban from room
  socket.on('ban-room', function (data) {
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
  socket.on('manage_room', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    socket.emit('msg:error', { msg: 'طلب إدارة الغرفة - قيد التطوير' });
  });

  // Send ad
  socket.on('send_ad', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('message', { type: 'msg', user: '🔊 إعلان', msg: 'إعلان من ' + user.username + ' - شكراً لاستخدامك شات نجم عمان', color: '#ff9800', pic: 'pic.png', room: user.roomid });
  });

  socket.on('broadcast:system', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 5) return;
    io.emit('system-message', { msg: data && data.msg, type: data && data.type || 'info' });
  });

  socket.on('broadcast:live', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    if (user.power < 5) return;
    io.emit('broadcast:live', { msg: data && data.msg, from: user.username });
  });

  socket.on('presence:room-history', function () {
    var roomUsers = [];
    for (var sid in state.users) {
      if (state.users[sid].roomid) {
        roomUsers.push({ id: sid, name: state.users[sid].username, pic: state.users[sid].pic, status: state.users[sid].idle ? 'idle' : 'online' });
      }
    }
    socket.emit('presence:room-history', { users: roomUsers });
  });

  // Notification stubs
  socket.on('send:notification', function (data) {
    if (!state.users[socket.id] || !data || !data.to) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.to);
    if (tid) { io.to(tid).emit('private-notification', { from: user.username, text: data.text || '', type: data.type || 'info' }); }
  });

  socket.on('send:public-notification', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('notification', { from: user.username, text: data && data.text, type: (data && data.type) || 'info' });
  });

  // Reputation update request
  socket.on('rep:update', function (data) {
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
  socket.on('admin', function (data) {
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


