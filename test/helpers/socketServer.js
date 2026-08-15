const http = require('http');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');

// Boot a real Socket.io server wired through the app's own attachSocket()
// pipeline, on an ephemeral port, so the integration tests exercise the true
// auth/chat/rooms/disconnect handlers. `db` is injected (memory or Mongo).
function startSocketServer(db) {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
    maxHttpBufferSize: 10 * 1024 * 1024,
  });

   
  const attachSocket = require('../../src/socket');
  attachSocket(io, db, { getUserByToken: function () { return null; } });

  return new Promise(function (resolve, reject) {
    httpServer.listen(0, '127.0.0.1', function () {
      const port = httpServer.address().port;
      resolve({
        url: 'http://127.0.0.1:' + port,
        io: io,
        httpServer: httpServer,
        db: db,
        close: function () {
          return new Promise(function (res) {
            io.close(function () {
              httpServer.close(function () { res(); });
            });
          });
        },
      });
    });
    httpServer.on('error', reject);
  });
}

// Connect a socket.io-client and resolve once connected. `opts.preEvents` is
// an optional list of event names captured from the very first packet (the
// server emits e.g. 'users-list' synchronously during connection handling, so
// a listener attached after `connect` resolves would miss it). Captured
// promises are exposed as `client.captured[name]`.
function connect(url, opts) {
  const preEvents = (opts && opts.preEvents) || [];
  const client = ioc(url, Object.assign({ transports: ['websocket'], forceNew: true, reconnection: false }, opts || {}));
  client.captured = {};
  const resolvers = {};
  preEvents.forEach(function (name) {
    client.captured[name] = new Promise(function (resolve) {
      resolvers[name] = resolve;
    });
    client.on(name, function (data) {
      if (resolvers[name]) {
        resolvers[name](data);
        resolvers[name] = null;
      }
    });
  });
  return new Promise(function (resolve, reject) {
    client.once('connect', function () { resolve(client); });
    client.once('connect_error', reject);
  });
}

// Resolve with the first emission of `event` (optionally filtering by fn).
function waitEvent(client, event, filter, timeout) {
  timeout = timeout || 5000;
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      client.off(event, handler);
      reject(new Error('Timed out waiting for event "' + event + '"'));
    }, timeout);
    function handler(data) {
      if (filter && !filter(data)) return;
      clearTimeout(timer);
      client.off(event, handler);
      resolve(data);
    }
    client.on(event, handler);
  });
}

// Seed the minimal settings + powers required for the auth flow. MUST run
// before startSocketServer() because the state reads settings at startup.
function seedBaseDb(db) {
  if (db.settings.count() === 0) {
    db.settings.create({
      siteweb: {
        allowg: true,
        allowreg: true,
        name: 'Test Chat',
        title: 'Test Chat',
        background: '#40404f',
        bg: '#40404f',
        buttons: '#f93634',
        msgst: '5',
        walllikes: { lengthUserReg: 50, lengthUserG: 50 },
      },
      dro3: [],
      emo: [],
      sico: [],
    });
  }
  if (db.powers.count() === 0) {
    db.powers.create({ powers: [] });
  }
}

// Seed an admin-style registered user (idempotent).
function seedAuthDb(db, admin) {
  if (!admin) return;
  if (db.users.findOne({ topic: admin.username })) return;
  db.users.create({
    topic: admin.username,
    topic1: admin.username,
    username: admin.username,
    password: bcrypt.hashSync(admin.password, 10),
    id: 'u-admin-1',
    lid: 'l-admin-1',
    idreg: '#1',
    token: 'tok-admin-1',
    fp: '', ip: '127.0.0.1',
    co: 'om', code: 'om',
    pic: 'pic.png',
    ucol: '#000000', mcol: '#000000', bg: '#ffffff',
    rep: 0, msg: '', power: 'admin', evaluation: 999, stat: 1,
    loginG: false, documentationc: 1,
    verified: true,
    isAdmin: true,
  });
}

module.exports = { startSocketServer, connect, waitEvent, seedBaseDb, seedAuthDb, ioc };
