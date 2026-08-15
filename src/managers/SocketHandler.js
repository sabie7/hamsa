const logger = require('../logger');
const guard = require('../socket/guard');
const auth = require('../socket/auth');
const chat = require('../socket/chat');
const rooms = require('../socket/rooms');
const users = require('../socket/users');
const admin = require('../socket/admin');
const frontendBridge = require('../socket/frontend-bridge');
const voice = require('../socket/voice');
const games = require('../socket/games');

function SocketHandler(io, db, state, userManager, roomManager, rateLimiter) {
  this.io = io;
  this.db = db;
  this.state = state;
  this.userManager = userManager;
  this.roomManager = roomManager;
  this.rateLimiter = rateLimiter;
}

SocketHandler.prototype.start = function () {
  this.startTimers();
  this.io.on('connection', this.onConnection.bind(this));
};

SocketHandler.prototype.startTimers = function () {
  const io = this.io;
  const db = this.db;
  const state = this.state;
  const userManager = this.userManager;
  const roomManager = this.roomManager;

  // Welcome/daily messages timer
  setInterval(function () {
    const msgs = db.messages.getAll() || [];
    const daily = msgs.filter(function (m) { return m.category === 'd'; });
    if (daily.length > 0) {
      const msg = daily[Math.floor(Math.random() * daily.length)];
      io.emit('message', { type: 'broadcast', msg: msg.msg, user: '📢' });
    }
  }, 300000);

  // Heartbeat checker
  setInterval(function () {
    userManager.sweepHeartbeats(io);
  }, 30000);

  // Periodic room stats emitter (every 10s)
  setInterval(function () {
    io.emit('rooms-stats', { rooms: roomManager.stats(state.users) });
  }, 10000);

  // Periodic site appearance update
  setInterval(function () {
    io.emit('site_appearance_updated', state.settings && state.settings.siteweb ? { background: state.settings.siteweb.background, bg: state.settings.siteweb.bg, buttons: state.settings.siteweb.buttons } : {});
  }, 60000);

  // Periodic features update
  setInterval(function () {
    io.emit('features:updated', {});
    io.emit('filter:monitor-update', { noletters: db.noletters.getAll() || [] });
  }, 120000);

  // Periodic online count per room
  setInterval(function () {
    roomManager.updateOnlineCounts(state.users);
  }, 15000);
};

SocketHandler.prototype.onConnection = function (socket) {
  const io = this.io;
  const db = this.db;
  const state = this.state;
  const rateLimiter = this.rateLimiter;
  const userManager = this.userManager;
  const on = guard.on(socket, 'handler');

  logger.info('socket.connect', 'New connection', { id: socket.id, ip: socket.handshake.address });

  const ip = socket.handshake.address;
  const fp = socket.handshake.headers['user-agent'] || '';

  // Send initial config
  socket.emit('init-config', { ip: ip, fp: fp, rooms: state.rooms, settings: state.settings, siteweb: state.settings.siteweb || {} });

  // Send current online users immediately so sidebar/landing populate on join
  socket.emit('users-list', userManager.online || []);

  // Attach all handlers
  auth(io, socket, db, state, rateLimiter);
  chat(io, socket, db, state, rateLimiter);
  rooms(io, socket, db, state, rateLimiter);
  users(io, socket, db, state, rateLimiter);
  admin(io, socket, db, state, rateLimiter);
  frontendBridge(io, socket, db, state, rateLimiter);
  voice(io, socket, db, state, rateLimiter);
  games(io, socket, db, state, rateLimiter);

  // Heartbeat
  on('ping', function () {
    userManager.touchHeartbeat(socket.id);
    socket.emit('pong', {});
  });

  // Disconnect — fully clean the user out of the room/users-list and broadcast
  on('disconnect', function () {
    const user = userManager.get(socket.id);
    const username = user ? user.username : null;
    if (user) userManager.recordSession(user);

    // Remove the socket from any group-chat membership bookkeeping
    if (state.groups) {
      for (const gid in state.groups) {
        if (state.groups[gid].users) {
          state.groups[gid].users = state.groups[gid].users.filter(function (sid) { return sid !== socket.id; });
          if (state.groups[gid].users.length === 0) delete state.groups[gid];
        }
      }
    }

    userManager.remove(socket.id);

    // Remove any active voice speakers for this socket and tell each room
    const voiceRooms = state.voiceRemoveFromAll ? state.voiceRemoveFromAll(socket.id) : [];
    if (voiceRooms.length > 0 && username) {
      voiceRooms.forEach(function (rid) {
        io.to(rid).emit('voice:speaker-left', { name: username, roomId: rid });
      });
    }

    if (username) io.emit('user-left', { name: username });
    logger.info('socket.disconnect', 'Disconnected', { id: socket.id, username: username });
  });
};

module.exports = SocketHandler;
