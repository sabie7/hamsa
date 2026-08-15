var logger = require('../logger');
var auth = require('../socket/auth');
var chat = require('../socket/chat');
var rooms = require('../socket/rooms');
var users = require('../socket/users');
var admin = require('../socket/admin');
var frontendBridge = require('../socket/frontend-bridge');
var voice = require('../socket/voice');
var games = require('../socket/games');

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
  var io = this.io;
  var db = this.db;
  var state = this.state;
  var userManager = this.userManager;
  var roomManager = this.roomManager;

  // Welcome/daily messages timer
  setInterval(function () {
    var msgs = db.messages.getAll() || [];
    var daily = msgs.filter(function (m) { return m.category === 'd'; });
    if (daily.length > 0) {
      var msg = daily[Math.floor(Math.random() * daily.length)];
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
  var io = this.io;
  var db = this.db;
  var state = this.state;
  var rateLimiter = this.rateLimiter;
  var userManager = this.userManager;

  logger.info('socket.connect', 'New connection', { id: socket.id, ip: socket.handshake.address });

  var ip = socket.handshake.address;
  var fp = socket.handshake.headers['user-agent'] || '';

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
  socket.on('ping', function () {
    userManager.touchHeartbeat(socket.id);
    socket.emit('pong', {});
  });

  // Disconnect
  socket.on('disconnect', function () {
    var user = userManager.get(socket.id);
    var username = user ? user.username : null;
    if (user) userManager.recordSession(user);
    userManager.remove(socket.id);
    io.emit('user-left', { name: username });
    logger.info('socket.disconnect', 'Disconnected', { id: socket.id });
  });
};

module.exports = SocketHandler;
