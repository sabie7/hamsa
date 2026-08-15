/* ============================================================
   NJM CHAT — complete server, built from scratch.
   Stack: Node.js + Express + Socket.IO. Self-contained storage
   (JSON files), no external database required to run.

   Protocol (client <-> server):
     Client -> Server
       auth.token                       resume an existing session
       auth.register  {username, password, country}
       auth.login     {username, password, country}
       auth.guest     {nickname, country}
       room.join      {roomId}
       room.leave
       message.send   {roomId, text, replyTo}
       message.private{senderId, text, media}
       typing         {roomId, isTyping}
       profile.get    {userId}
       profile.update {data}
       wall.get       {page}
       wall.post      {text}
       wall.like      {postId}
       gift.send      {userId, giftId}
       admin.action   {action, targetId, reason}   (admin only)
       status.get
       history.get    {roomId}

     Server -> Client
       session        {ok, user, token, rooms}
       auth.error     {message}
       online.users   {roomId, users[]}
       room.users     {roomId, users[]}
       message.new    {message}
       message.private{conversation}
       user.joined / user.left
       profile.data   {user}
       wall.posts     {posts[]}
       typing         {roomId, userId, isTyping}
       system         {text, kind}
       error          {message}
   ============================================================ */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

const PORT = process.env.PORT || 3000;
const ROOM_LIMIT = 120;

/* ------------------------------------------------------------
   Storage layer (JSON file persistence)
   ------------------------------------------------------------ */
function ensureDirs() {
  for (const d of [DATA_DIR, UPLOAD_DIR, path.join(UPLOAD_DIR, 'avatars')]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}
ensureDirs();

function load(file, fallback) {
  const p = path.join(DATA_DIR, file);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return fallback; }
}
function save(file, data) {
  const p = path.join(DATA_DIR, file);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
}

/* ---- Feature content (الزجل، ردود سريعة) ---- */
const ZAJEL_IDEAS = [
  'من وين أجيب الزعل والعين بدمعة تسيل',
  'يا طيّب القلب ما ينفع اللي يبغيك ينساك',
  'أهل الغرام طلبوا عنّا ونحن ما درينا',
  'ليلٍ طوافٍ من أيام المحبّة والهوى',
  'يا ناس ودي أشتكي والناس ما تقصر',
  'قلبي على اللي هواه صار يرجف مثل رمح',
  'صوتك يسليني وعينك تغنّي لي أغاني',
  'غرامكم يا هون يا صاحبي له طعم',
  'يا من هوى بسمرة القضبان ميّال',
  'طير الحمروف قلّت أجنحته من طول الغياب',
];
const QUICK_CHAT = ['كيف حالك؟','مرحبا', 'أهلين وسهلين', 'وينك طويل الغياب؟', 'بغيت اسولف معاك', 'خذ راحتك', 'تحياتي', 'وش أخبارك؟', 'ما توقف لا تتأخر', 'أشتقت لك'];
const ANIMATIONS = ['slap', 'hug', 'kiss', 'clap'];

const store = {
  users: load('users.json', {}),       // id -> user
  rooms: load('rooms.json', []),       // array of rooms
  wall: load('wall.json', []),         // wall posts
  pm: load('pm.json', {}),             // "a_b" sorted pair -> [{msg}]
  history: load('history.json', {}),   // roomId -> [msg]
  bans: load('bans.json', []),         // array of banned identities
  stories: load('stories.json', []),   // stories array
  reports: load('reports.json', []),   // reports array
  zajel: load('zajel.json', []),       // zajel lines (seeded below)
  tokens: {},                          // token -> userId  (memory only)
};
// seed a default public room
if (!store.rooms.length) {
  store.rooms.push({ id: 'general', name: 'الغرفة العامة', thumb: '', order: 0 });
  save('rooms.json', store.rooms);
}
const persist = {
  users: () => save('users.json', store.users),
  rooms: () => save('rooms.json', store.rooms),
  wall: () => save('wall.json', store.wall),
  pm: () => save('pm.json', store.pm),
  history: () => save('history.json', store.history),
  bans: () => save('bans.json', store.bans),
  stories: () => save('stories.json', store.stories),
  reports: () => save('reports.json', store.reports),
  zajel: () => save('zajel.json', store.zajel),
};

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */
const uid = () => crypto.randomBytes(6).toString('hex');
const now = () => Date.now();

// seed zajel lines if the store is empty (needs uid/now available)
if (!store.zajel.length) {
  store.zajel = ZAJEL_IDEAS.map((t, i) => ({ id: 'z' + i + '_' + uid(), text: t, userId: null, at: now() }));
  persist.zajel();
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}
function makeSalt() { return crypto.randomBytes(8).toString('hex'); }
function verifyPassword(password, salt, hash) {
  return hashPassword(password, salt) === hash;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname || u.username,
    country: u.country || 'us',
    avatar: u.avatar || '',
    topic: u.topic || '',
    msg: u.msg || '',
    ucol: u.ucol || '#444444',
    fontcol: u.fontcol || '#444444',
    bg: u.bg || '#ffffff',
    verified: !!u.verified,
    role: u.role || 'user',
    points: u.points || 0,
    coins: u.coins || 0,
    rep: u.rep || 0,
    okStatus: u.okStatus || '',
  };
}

function roomById(id) { return store.rooms.find(r => r.id === id) || null; }
function addToHistory(roomId, msg) {
  const arr = store.history[roomId] || (store.history[roomId] = []);
  arr.push(msg);
  while (arr.length > ROOM_LIMIT) arr.shift();
}

/* ---- Ban helpers ---- */
function isBanned(key) {
  if (!key) return null;
  const k = String(key).toLowerCase();
  return store.bans.find(b => b.key.toLowerCase() === k) || null;
}
function addBan(key, name, reason) {
  const k = String(key || '').toLowerCase();
  if (!k) return;
  store.bans = store.bans.filter(b => b.key.toLowerCase() !== k);
  store.bans.push({ key: k, name, reason: reason || '', at: now() });
  persist.bans();
}
function removeBan(key) {
  const k = String(key || '').toLowerCase();
  store.bans = store.bans.filter(b => b.key.toLowerCase() !== k);
  persist.bans();
}

// seed a default admin account for the control panel
const hasAdmin = Object.values(store.users).some(u => u && !u.isGuest && u.role === 'admin');
if (!hasAdmin) {
  const salt = makeSalt();
  const adminId = 'u_admin_' + uid();
  store.users[adminId] = {
    id: adminId, username: 'admin', nickname: 'المدير', country: 'om', role: 'admin',
    salt, pass: hashPassword('admin123', salt), avatar: '', topic: '', msg: '',
    ucol: '#000000', fontcol: '#000000', bg: '#ffffff', points: 0, coins: 1000, createdAt: now(),
  };
  persist.users();
}

/* ------------------------------------------------------------
   HTTP app
   ------------------------------------------------------------ */
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/client', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
}, express.static(path.join(ROOT, 'client')));

// simple JSON upload endpoint (avatar / cover / media)
app.post('/api/upload', (req, res) => {
  try {
    const b64 = String(req.body && req.body.data || '').replace(/^data:[^;]+;base64,/, '');
    if (!b64) return res.status(400).json({ ok: false, message: 'no data' });
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return res.status(400).json({ ok: false, message: 'bad data' });
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ ok: false, message: 'too large' });
    const ext = (req.body.ext === 'png') ? 'png' : 'jpg';
    const name = uid() + '.' + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    res.json({ ok: true, url: '/uploads/' + name });
  } catch (e) { res.status(400).json({ ok: false, message: 'bad upload' }); }
});

app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(ROOT, 'index.html'));
});
app.get('/cp', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(ROOT, 'cp.html'));
});
app.get('/status', (req, res) => {
  res.json({ ok: true, online: io.engine.clientsCount, rooms: store.rooms.length });
});

/* ------------------------------------------------------------
   Admin Control Panel (HTTP API)
   ------------------------------------------------------------ */
const cpSessions = new Map(); // cpToken -> {username, role, at}
const cpToken = () => crypto.randomBytes(24).toString('hex');

function cpAuthed(req) {
  const t = (req.headers.cookie || '')
    .split(';').map(s => s.trim())
    .find(c => c.startsWith('cp_token='));
  if (!t) return null;
  const token = decodeURIComponent(t.slice('cp_token='.length));
  return cpSessions.get(token) || null;
}

app.post('/cp/login', (req, res) => {
  const username = String((req.body || {}).username || '').trim();
  const password = String((req.body || {}).password || '');
  const u = Object.values(store.users).find(x => x && !x.isGuest && String(x.username || '').toLowerCase() === username.toLowerCase());
  if (!u || u.role !== 'admin' || !u.salt || !verifyPassword(password, u.salt, u.pass)) {
    return res.status(401).json({ ok: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة أو لا تملك صلاحية الإدارة' });
  }
  const token = cpToken();
  cpSessions.set(token, { username: u.username, role: u.role, at: now() });
  res.setHeader('Set-Cookie', 'cp_token=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400');
  res.json({ ok: true });
});

app.post('/cp/logout', (req, res) => {
  const s = cpAuthed(req);
  if (s) for (const [k, v] of cpSessions) if (v.username === s.username) cpSessions.delete(k);
  res.setHeader('Set-Cookie', 'cp_token=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/cp/data', (req, res) => {
  const s = cpAuthed(req);
  if (!s) return res.status(401).json({ ok: false, message: 'غير مصرح' });
  const users = Object.values(store.users).filter(u => !u.isGuest).map(u => ({
    id: u.id, username: u.username, nickname: u.nickname, country: u.country, role: u.role,
    online: userSockets.has(u.id), points: u.points || 0, coins: u.coins || 0, createdAt: u.createdAt,
  }));
  res.json({
    ok: true,
    admin: s,
    stats: { users: users.length, online: userSockets.size, rooms: store.rooms.length, messages: Object.values(store.history).reduce((a, b) => a + b.length, 0) },
    rooms: store.rooms.map(r => ({ id: r.id, name: r.name, order: r.order || 0 })),
    users,
    bans: store.bans,
  });
});

app.post('/cp/room', (req, res) => {
  const s = cpAuthed(req);
  if (!s) return res.status(401).json({ ok: false, message: 'غير مصرح' });
  const b = req.body || {};
  const action = b.action;
  if (action === 'add') {
    const name = String(b.name || '').trim().slice(0, 30);
    if (!name) return res.json({ ok: false, message: 'أدخل اسم الغرفة' });
    const id = 'room_' + uid();
    store.rooms.push({ id, name, thumb: '', order: store.rooms.length });
    persist.rooms();
    return res.json({ ok: true, room: { id, name } });
  }
  if (action === 'rename') {
    const room = store.rooms.find(r => r.id === b.id);
    if (!room) return res.json({ ok: false, message: 'الغرفة غير موجودة' });
    room.name = String(b.name || '').trim().slice(0, 30) || room.name;
    persist.rooms();
    return res.json({ ok: true, name: room.name });
  }
  if (action === 'delete') {
    const room = store.rooms.find(r => r.id === b.id);
    if (!room) return res.json({ ok: false, message: 'الغرفة غير موجودة' });
    if (room.id === 'general') return res.json({ ok: false, message: 'لا يمكن حذف الغرفة العامة' });
    store.rooms = store.rooms.filter(r => r.id !== room.id);
    delete store.history[room.id];
    persist.rooms(); persist.history();
    return res.json({ ok: true });
  }
  res.json({ ok: false, message: 'إجراء غير معروف' });
});

app.post('/cp/user', (req, res) => {
  const s = cpAuthed(req);
  if (!s) return res.status(401).json({ ok: false, message: 'غير مصرح' });
  const b = req.body || {};
  const target = store.users[b.targetId];
  if (!target) return res.json({ ok: false, message: 'المستخدم غير موجود' });
  const reason = String(b.reason || '').slice(0, 120);

  if (b.action === 'kick') {
    const sk = userSockets.get(target.id);
    if (sk) for (const id of sk) io.to(id).emit('kicked', { reason });
    return res.json({ ok: true });
  }
  if (b.action === 'ban') {
    addBan(target.id, target.username, reason);
    const sk = userSockets.get(target.id);
    if (sk) for (const id of sk) io.to(id).emit('kicked', { reason: 'تم حظرك: ' + reason });
    return res.json({ ok: true });
  }
  if (b.action === 'banName') {
    addBan(target.username, target.username, reason);
    return res.json({ ok: true });
  }
  if (b.action === 'unban') {
    removeBan(String(b.key || ''));
    return res.json({ ok: true });
  }
  if (b.action === 'setrole') {
    if (s.username === target.username && b.role !== 'admin') {
      return res.json({ ok: false, message: 'لا يمكن إزالة صلاحية الأدمن من نفسك' });
    }
    target.role = b.role;
    persist.users();
    // broadcast updated room.users so roles/names refresh
    for (const [roomId, m] of roomUsers) {
      if (m.has(target.id)) io.to(roomId).emit('room.users', { roomId, users: [...m.values()] });
    }
    return res.json({ ok: true });
  }
  res.json({ ok: false, message: 'إجراء غير معروف' });
});

/* ------------------------------------------------------------
   Socket.IO core
   ------------------------------------------------------------ */
const io = new Server(server, {
  maxHttpBufferSize: 1e6,
  cors: { origin: true, credentials: true },
});

// socket state
const socketUser = new Map();   // socket.id -> userId
const socketRoom = new Map();   // socket.id -> roomId
const userSockets = new Map();  // userId -> Set<socketId>
const roomUsers = new Map();    // roomId -> Map<userId, user>

function joinRoom(socket, roomId) {
  const room = roomById(roomId);
  if (!room) return false;
  const prev = socketRoom.get(socket.id);
  if (prev === roomId) return true;
  if (prev) leaveRoom(socket);
  const u = store.users[socketUser.get(socket.id)];
  if (!u) return false;
  socket.join(roomId);
  socketRoom.set(socket.id, roomId);
  let m = roomUsers.get(roomId);
  if (!m) { m = new Map(); roomUsers.set(roomId, m); }
  m.set(u.id, publicUser(u));
  io.to(roomId).emit('room.users', { roomId, users: [...m.values()] });
  io.to(roomId).emit('user.joined', { roomId, user: publicUser(u) });
  socket.emit('history.get', { roomId, messages: store.history[roomId] || [] });
  broadcastOnline();
  broadcastPublicOnline();
  return true;
}

function leaveRoom(socket) {
  const roomId = socketRoom.get(socket.id);
  if (!roomId) return;
  const u = store.users[socketUser.get(socket.id)];
  socket.leave(roomId);
  socketRoom.delete(socket.id);
  const m = roomUsers.get(roomId);
  if (m && u) {
    m.delete(u.id);
    io.to(roomId).emit('room.users', { roomId, users: [...m.values()] });
    io.to(roomId).emit('user.left', { roomId, user: publicUser(u) });
  }
  broadcastOnline();
  broadcastPublicOnline();
}

function trackSocket(userId, socketId) {
  let s = userSockets.get(userId);
  if (!s) { s = new Set(); userSockets.set(userId, s); }
  s.add(socketId);
}
function untrackSocket(userId, socketId) {
  const s = userSockets.get(userId);
  if (s) {
    s.delete(socketId);
    if (!s.size) userSockets.delete(userId);
  }
}
function emitToUser(userId, event, payload) {
  const s = userSockets.get(userId);
  if (s) for (const id of s) io.to(id).emit(event, payload);
}

function makeSession(user) {
  const token = uid() + uid();
  store.tokens[token] = user.id;
  return token;
}
function getByToken(token) { return store.users[store.tokens[token]] || null; }

function broadcastOnline() {
  let online = 0;
  for (const m of roomUsers.values()) online += m.size;
  io.emit('online.count', online);
}

function publicOnlineList() {
  const users = [];
  for (const m of roomUsers.values()) {
    for (const u of m.values()) {
      if (u && u.nickname) users.push({ nickname: u.nickname, country: u.country || 'us', role: u.role || 'user', verified: !!u.verified });
    }
  }
  return users.slice(0, 200);
}
function broadcastPublicOnline() {
  io.emit('public.online', { count: publicOnlineList().length, users: publicOnlineList() });
}

/* ------------------------------------------------------------
   Socket handlers
   ------------------------------------------------------------ */
io.on('connection', (socket) => {
  let guestId = null;

  function bindUser(user) {
    if (socketUser.has(socket.id)) return;
    socketUser.set(socket.id, user.id);
    trackSocket(user.id, socket.id);
    socket.emit('session', { ok: true, user: publicUser(user), token: store.tokens[user.id] || makeSession(user), rooms: store.rooms.map(r => ({ id: r.id, name: r.name })) });
    broadcastOnline();
  }

  socket.emit('public.online', { count: publicOnlineList().length, users: publicOnlineList() });

  socket.on('auth.token', (token) => {
    const u = getByToken(String(token || ''));
    if (!u) return socket.emit('auth.error', { message: 'الجلسة منتهية، سجل الدخول من جديد' });
    if (isBanned(u.id) || isBanned(u.username)) {
      return socket.emit('auth.error', { message: 'تم حظر حسابك' });
    }
    bindUser(u); socket.emit('system', { text: 'تم تسجيل الدخول', kind: 'success' });
  });

  socket.on('auth.guest', (data) => {
    data = data || {};
    const nickname = String(data.nickname || '').trim().slice(0, 20);
    if (!nickname) return socket.emit('auth.error', { message: 'اكتب اسماً أولاً' });
    if (isBanned(nickname)) return socket.emit('auth.error', { message: 'هذا الاسم محظور من الشات' });
    if (/^[\s\S]*\b(admin|mod|مشرف)\b/i.test(nickname)) {
      return socket.emit('auth.error', { message: 'الاسم محظور' });
    }
    const id = 'g_' + uid();
    const user = {
      id, username: nickname, nickname,
      country: String(data.country || 'us').slice(0, 2),
      role: 'guest', avatar: '', topic: '', msg: '',
      ucol: '#444444', fontcol: '#444444', bg: '#ffffff',
      points: 0, coins: 20, createdAt: now(), isGuest: true,
    };
    store.users[id] = user;
    persist.users();
    bindUser(user);
  });

  socket.on('auth.register', (data) => {
    data = data || {};
    const username = String(data.username || '').trim().slice(0, 20);
    const password = String(data.password || '');
    if (username.length < 3) return socket.emit('auth.error', { message: 'اسم المستخدم قصير جداً (3 أحرف على الأقل)' });
    if (password.length < 4) return socket.emit('auth.error', { message: 'كلمة المرور قصيرة (4 أحرف على الأقل)' });
    const existing = Object.values(store.users).find(u => u && !u.isGuest && String(u.username || '').toLowerCase() === username.toLowerCase());
    if (existing) return socket.emit('auth.error', { message: 'هذا الاسم مستخدم من قبل' });
    const salt = makeSalt();
    const id = 'u_' + uid();
    const user = {
      id, username, nickname: username, country: String(data.country || 'us').slice(0, 2),
      role: 'user', salt, pass: hashPassword(password, salt),
      avatar: '', topic: '', msg: '', ucol: '#444444', fontcol: '#444444', bg: '#ffffff',
      points: 0, coins: 100, createdAt: now(),
    };
    store.users[id] = user;
    persist.users();
    bindUser(user);
  });

  socket.on('auth.login', (data) => {
    data = data || {};
    const username = String(data.username || '').trim();
    const password = String(data.password || '');
    const u = Object.values(store.users).find(x => x && !x.isGuest && String(x.username || '').toLowerCase() === username.toLowerCase());
    if (!u || !u.salt || !verifyPassword(password, u.salt, u.pass)) {
      return socket.emit('auth.error', { message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    if (isBanned(u.id) || isBanned(u.username)) {
      return socket.emit('auth.error', { message: 'تم حظر حسابك' });
    }
    bindUser(u);
  });

  socket.on('room.join', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    if (!joinRoom(socket, String(data && data.roomId || 'general'))) {
      socket.emit('error', { message: 'الغرفة غير موجودة' });
    }
  });

  socket.on('room.leave', () => leaveRoom(socket));

  socket.on('rooms.get', () => {
    socket.emit('rooms.list', { rooms: store.rooms.map(r => ({ id: r.id, name: r.name, users: roomUsers.has(r.id) ? roomUsers.get(r.id).size : 0 })) });
  });

  socket.on('message.send', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    const roomId = socketRoom.get(socket.id);
    if (!u || !roomId) return socket.emit('error', { message: 'انضم إلى غرفة أولاً' });
    data = data || {};
    const text = String(data.text || '').trim().slice(0, 1000);
    const media = data.media || null;
    if (!text && !media) return;
    if (/^\s*\/clear\s*$/i.test(text)) {
      store.history[roomId] = [];
      persist.history();
      io.to(roomId).emit('messages.clear', { roomId });
      return;
    }
    const msg = {
      id: uid(), userId: u.id, user: publicUser(u),
      text, roomId, replyTo: data.replyTo || null,
      media: data.media || null, at: now(),
    };
    addToHistory(roomId, msg);
    persist.history();
    io.to(roomId).emit('message.new', msg);
  });

  socket.on('message.private', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    data = data || {};
    const target = store.users[data.userId];
    if (!target || target.isGuest) return;
    const text = String(data.text || '').trim().slice(0, 1000);
    if (!text) return;
    const key = [u.id, target.id].sort().join('_');
    const arr = store.pm[key] || (store.pm[key] = []);
    const msg = { id: uid(), fromId: u.id, toId: target.id, from: publicUser(u), text, at: now() };
    arr.push(msg);
    while (arr.length > 200) arr.shift();
    persist.pm();
    emitToUser(u.id, 'message.private', { msg });
    emitToUser(target.id, 'message.private', { msg });
    emitToUser(u.id, 'pm.unread', { fromId: u.id, toId: target.id, count: arr.filter(m => m.fromId === target.id).length });
  });

  socket.on('pm.list', () => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    const conversations = [];
    Object.keys(store.pm).forEach((key) => {
      if (key.split('_').indexOf(u.id) >= 0) {
        conversations.push(store.pm[key].slice(-50));
      }
    });
    socket.emit('pm.list', { conversations });
  });

  socket.on('typing', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    const roomId = socketRoom.get(socket.id);
    if (!u || !roomId) return;
    socket.to(roomId).emit('typing', { roomId, userId: u.id, nickname: u.nickname, isTyping: !!data.isTyping });
  });

  socket.on('profile.get', (data) => {
    const u = store.users[data && data.userId];
    if (!u) return socket.emit('error', { message: 'المستخدم غير موجود' });
    socket.emit('profile.data', { user: publicUser(u) });
  });

  socket.on('profile.update', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    data = data || {};
    if (typeof data.topic === 'string') u.topic = data.topic.slice(0, 30);
    if (typeof data.msg === 'string') u.msg = data.msg.slice(0, 200);
    if (typeof data.country === 'string') u.country = data.country.slice(0, 2);
    if (typeof data.ucol === 'string') u.ucol = data.ucol.slice(0, 7);
    if (typeof data.fontcol === 'string') u.fontcol = data.fontcol.slice(0, 7);
    if (typeof data.bg === 'string') u.bg = data.bg.slice(0, 7);
    if (typeof data.avatar === 'string') u.avatar = data.avatar.slice(0, 300);
    persist.users();
    for (const m of roomUsers.values()) {
      if (m.has(u.id)) m.set(u.id, publicUser(u));
    }
    socket.emit('session', { ok: true, user: publicUser(u), token: store.tokens[u.id] || makeSession(u), rooms: store.rooms.map(r => ({ id: r.id, name: r.name })) });
    for (const [rid, m] of roomUsers) {
      if (m.has(u.id)) io.to(rid).emit('room.users', { roomId: rid, users: [...m.values()] });
    }
  });

  /* ---- Wall ---- */
  socket.on('wall.get', () => {
    const posts = store.wall.slice(-50).reverse().map(p => ({ ...p, liked: false }));
    socket.emit('wall.posts', { posts });
  });
  socket.on('wall.post', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    const text = String(data && data.text || '').trim().slice(0, 500);
    if (!text) return;
    const post = { id: uid(), userId: u.id, user: publicUser(u), text, likes: [], at: now() };
    store.wall.push(post);
    while (store.wall.length > 500) store.wall.shift();
    persist.wall();
    io.emit('wall.new', { post });
  });
  socket.on('wall.like', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    const post = store.wall.find(p => p.id === (data && data.postId));
    if (!u || !post) return;
    const i = post.likes.indexOf(u.id);
    if (i >= 0) post.likes.splice(i, 1); else post.likes.push(u.id);
    persist.wall();
    io.emit('wall.updated', { postId: post.id, likes: post.likes });
  });

  /* ---- Gifts ---- */
  const GIFTS = [
    { id: 'rose', name: 'وردة', icon: '🌹', cost: 1 },
    { id: 'star', name: 'نجمة', icon: '⭐', cost: 2 },
    { id: 'cake', name: 'كيكة', icon: '🎂', cost: 3 },
    { id: 'heart', name: 'قلب', icon: '💖', cost: 5 },
  ];
  socket.on('gift.send', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    data = data || {};
    const gift = GIFTS.find(g => g.id === data.giftId);
    const target = store.users[data.userId];
    if (!u || !gift || !target) return socket.emit('error', { message: 'بيانات الهدية غير صحيحة' });
    if ((u.coins || 0) < gift.cost) return socket.emit('error', { message: 'رصيدك لا يكفي لإرسال هدية' });
    u.coins -= gift.cost;
    target.coins = (target.coins || 0) + gift.cost;
    persist.users();
    emitToUser(u.id, 'gift.sent', { gift, user: publicUser(target) });
    emitToUser(target.id, 'gift.received', { gift, user: publicUser(u) });
  });

  /* ---- Zajel (الزجل) & Quick Chat ---- */
  socket.on('zajel.get', () => {
    socket.emit('zajel.list', { lines: store.zajel.slice(-60).reverse() });
  });
  socket.on('zajel.send', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    const text = String(data && data.msg || '').trim().slice(0, 200);
    if (!text) return;
    const line = { id: uid(), text, userId: u.id, user: publicUser(u), at: now() };
    store.zajel.push(line);
    while (store.zajel.length > 200) store.zajel.shift();
    persist.zajel();
    io.emit('zajel.new', { line });
  });
  socket.on('quickchat.get', () => socket.emit('quickchat.list', { list: QUICK_CHAT }));
  socket.on('quickchat.send', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    const roomId = socketRoom.get(socket.id);
    if (!u || !roomId) return;
    const text = String(data && data.text || '').trim().slice(0, 120);
    if (!text) return;
    const msg = { id: uid(), userId: u.id, user: publicUser(u), text, roomId, replyTo: null, media: null, at: now(), system: true };
    io.to(roomId).emit('message.new', msg);
  });

  /* ---- Animations (صفع، عناق، بوس، تصفيق) ---- */
  socket.on('send_animation', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    const roomId = socketRoom.get(socket.id);
    if (!u || !roomId) return;
    const type = ANIMATIONS.indexOf(data && data.type) >= 0 ? data.type : 'clap';
    io.to(roomId).emit('animation', { type, from: publicUser(u), at: now() });
  });

  /* ---- Likes / Reputation / Top 10 ---- */
  socket.on('like-user', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    const target = store.users[data && data.userId];
    if (!u || !target || u.id === target.id) return;
    target.rep = (target.rep || 0) + 1;
    u.repGiven = (u.repGiven || 0) + 1;
    persist.users();
    emitToUser(target.id, 'rep:update', { rep: target.rep, from: publicUser(u) });
  });
  socket.on('top10', () => {
    const list = Object.values(store.users).filter(x => x && !x.isGuest)
      .map(x => ({ nickname: x.nickname, country: x.country, rep: x.rep || 0, points: x.points || 0, role: x.role }))
      .sort((a, b) => (b.rep + b.points) - (a.rep + a.points)).slice(0, 10);
    socket.emit('top10.data', { list });
  });

  /* ---- Wall comments + delete ---- */
  socket.on('wallcomment', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    const post = store.wall.find(p => p.id === (data && data.postId));
    const text = String(data && data.text || '').trim().slice(0, 300);
    if (!post || !text) return;
    post.comments = post.comments || [];
    post.comments.push({ id: uid(), user: publicUser(u), text, at: now() });
    persist.wall();
    io.emit('wall.updated', { postId: post.id, likes: post.likes, comments: post.comments });
  });
  socket.on('delwall', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    const post = store.wall.find(p => p.id === (data && data.postId));
    if (!u || !post) return;
    if (post.userId !== u.id && u.role !== 'admin') return;
    store.wall = store.wall.filter(p => p.id !== post.id);
    persist.wall();
    io.emit('wall.deleted', { postId: post.id });
  });

  /* ---- Reports ---- */
  socket.on('report', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    const target = store.users[data && data.userId];
    if (!target) return;
    const reason = String(data && data.reason || '').slice(0, 200);
    store.reports.push({ id: uid(), by: u.id, byName: u.nickname, targetId: target.id, targetName: target.nickname, reason, at: now() });
    while (store.reports.length > 500) store.reports.shift();
    persist.reports();
    io.emit('system', { text: 'تم رفع بلاغ على ' + target.nickname, kind: 'success' });
  });

  /* ---- Stories ---- */
  socket.on('stories.get', () => socket.emit('stories.list', { stories: store.stories }));
  socket.on('story.add', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    const text = String(data && data.text || '').trim().slice(0, 200);
    const img = String(data && data.img || '').slice(0, 300);
    if (!text && !img) return;
    store.stories.push({ id: uid(), userId: u.id, user: publicUser(u), text, img, at: now() });
    while (store.stories.length > 100) store.stories.shift();
    persist.stories();
    io.emit('story.new', { story: store.stories[store.stories.length - 1] });
  });
  socket.on('stories.clear', () => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    store.stories = store.stories.filter(s => s.userId !== u.id);
    persist.stories();
    io.emit('stories.list', { stories: store.stories });
  });

  /* ---- Status / presence ---- */
  socket.on('user:set-status', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u) return;
    u.okStatus = String(data && data.status || '').slice(0, 60);
    persist.users();
    for (const [rid, m] of roomUsers) if (m.has(u.id)) io.to(rid).emit('room.users', { roomId: rid, users: [...m.values()] });
  });

  /* ---- Rooms management ---- */
  socket.on('create_room', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u || (u.role !== 'admin' && u.role !== 'mod' && (u.points || 0) < 100)) {
      return socket.emit('error', { message: 'تحتاج إلى صلاحية أو نقاط لإنشاء غرفة' });
    }
    const name = String(data && data.name || '').trim().slice(0, 30);
    if (!name) return socket.emit('error', { message: 'أدخل اسم الغرفة' });
    const room = { id: 'room_' + uid(), name, thumb: '', order: store.rooms.length };
    store.rooms.push(room);
    persist.rooms();
    io.emit('rooms.list', { rooms: store.rooms.map(r => ({ id: r.id, name: r.name })) });
    socket.emit('create_room.ok', { room });
  });
  socket.on('change-room', (data) => {
    joinRoom(socket, String(data && data.roomId || 'general'));
  });
  socket.on('getroomcount', () => {
    const counts = {};
    for (const r of store.rooms) counts[r.id] = roomUsers.has(r.id) ? roomUsers.get(r.id).size : 0;
    socket.emit('roomcounts', { counts });
  });

  /* ---- Account: change password / delete ---- */
  socket.on('setpass', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u || u.isGuest || !u.salt) return socket.emit('error', { message: 'غير متاح للزائر' });
    const cur = String(data && data.cur || '');
    const next = String(data && data.next || '');
    if (!verifyPassword(cur, u.salt, u.pass)) return socket.emit('error', { message: 'كلمة المرور الحالية غير صحيحة' });
    if (next.length < 4) return socket.emit('error', { message: 'كلمة المرور الجديدة قصيرة' });
    u.salt = makeSalt();
    u.pass = hashPassword(next, u.salt);
    persist.users();
    socket.emit('system', { text: 'تم تغيير كلمة المرور', kind: 'success' });
  });
  socket.on('delete_account', (data) => {
    const u = store.users[socketUser.get(socket.id)];
    if (!u || u.isGuest) return socket.emit('error', { message: 'غير متاح للزائر' });
    const pw = String(data && data.password || '');
    if (!verifyPassword(pw, u.salt, u.pass)) return socket.emit('error', { message: 'كلمة المرور غير صحيحة' });
    delete store.users[u.id];
    persist.users();
    const sk = userSockets.get(u.id);
    if (sk) for (const id of sk) io.to(id).emit('kicked', { reason: 'تم حذف حسابك' });
    socket.emit('account.deleted');
  });

  /* ---- Admin ---- */
  function isAdmin(socket) {
    const u = store.users[socketUser.get(socket.id)];
    return u && (u.role === 'admin' || u.role === 'mod');
  }
  socket.on('admin.action', (data) => {
    if (!isAdmin(socket)) return socket.emit('error', { message: 'غير مصرح' });
    data = data || {};
    const target = store.users[data.targetId];
    if (!target) return;
    const reason = String(data.reason || '').slice(0, 100);
    if (data.action === 'kick') {
      const s = userSockets.get(target.id);
      if (s) for (const id of s) io.to(id).emit('kicked', { reason });
      store.history = store.history || {};
      for (const rid of Object.keys(store.history)) {
        io.to(rid).emit('system', { text: `تم طرد ${target.nickname} ${reason ? 'سبب: ' + reason : ''}`, kind: 'danger' });
      }
    } else if (data.action === 'ban') {
      target.banned = true;
      persist.users();
      const s = userSockets.get(target.id);
      if (s) for (const id of s) io.to(id).emit('kicked', { reason: 'تم حظرك' });
    } else if (data.action === 'mute') {
      target.mutedUntil = now() + (data.durationMs || 60 * 60 * 1000);
      persist.users();
    } else if (data.action === 'unmute') {
      delete target.mutedUntil;
      persist.users();
    }
  });

  socket.on('disconnect', () => {
    leaveRoom(socket);
    const uid_ = socketUser.get(socket.id);
    if (uid_) untrackSocket(uid_, socket.id);
    socketUser.delete(socket.id);
    broadcastOnline();
    broadcastPublicOnline();
    if (guestId) {
      const g = store.users[guestId];
      if (g && g.isGuest) { delete store.users[guestId]; persist.users(); }
    }
  });

  // default: put fresh guests into the general room automatically
  socket.on('_enter', (data) => {
    if (socketUser.has(socket.id)) joinRoom(socket, String(data && data.roomId || 'general'));
  });
});

server.listen(PORT, () => {
  console.log('NJM CHAT server running at http://localhost:' + PORT);
});
