var UserManager = require('../managers/UserManager');
var RoomManager = require('../managers/RoomManager');
var SocketHandler = require('../managers/SocketHandler');
var config = require('../config');

var RATE_WINDOW = 1000;
var rateCounts = {};

function rateLimiter(key, maxPerSecond) {
  if (!maxPerSecond) maxPerSecond = 3;
  var now = Date.now();
  if (!rateCounts[key]) rateCounts[key] = [];
  rateCounts[key] = rateCounts[key].filter(function (t) { return now - t < RATE_WINDOW; });
  if (rateCounts[key].length >= maxPerSecond) return true;
  rateCounts[key].push(now);
  return false;
}

module.exports = function (io, db, stateManager) {
  var userManager = new UserManager();
  var roomManager = new RoomManager(db);
  roomManager.seedDefault();

  var state = {
    users: userManager.users,
    online: userManager.online,
    rooms: roomManager.rooms,
    groups: {},
    settings: db.settings.find({})[0] || { siteweb: {}, dro3: [], emo: [], sico: [] },
    adminPass: config.adminPass,
    adminUser: config.adminUser,
    bans: {},
    wallPosts: [],
  };
  state.getUserByToken = function (token) {
    return userManager.getByToken(token);
  };
  state.findSocketId = function (name) {
    return userManager.findSocketId(name);
  };
  state.findUserByUsername = function (username) {
    return userManager.findByUsername(username);
  };
  state.addOnline = function (entry) {
    return userManager.addOrUpdateOnline(entry);
  };

  // ── Public online-users snapshot (legacy feature restored) ──
  // Serializes the live online registry for the public (pre-login) landing
  // list. Deliberately strips private fields (token, fp, ip, room passwords
  // are already absent from the online entries) and only exposes rendering
  // data. Mirrors the fields the legacy public-online-users module consumes.
  state.publicOnlineUsers = function () {
    return state.online.map(function (o) {
      return {
        id: o.id,
        userId: o.idreg || o.lid || o.id,
        username: o.topic || o.topic1 || o.username || o.id,
        topic: o.topic || o.topic1 || o.username || o.id,
        pic: o.pic || 'pic.png',
        ucol: o.ucol || '#000000',
        mcol: o.mcol || '#6c757d',
        msg: o.msg || '',
        bg: o.bg || '#ffffff',
        power: o.power || '',
        rep: o.rep || 0,
        likes: o.likes || 0,
        co: o.co || 'us',
        country: o.co || '',
        isOnline: true,
        isGhost: !!o.stealth,
        roomid: o.roomid || '',
      };
    });
  };
  stateManager.getPublicOnlineUsers = state.publicOnlineUsers;

  // ── Voice speaker registry (Phase 4) ──
  // Maps roomId -> array of active speaker socket ids. Enforced server-side so
  // a mesh room never exceeds the simultaneous-speaker cap.
  state.voiceSpeakers = state.voiceSpeakers || {};
  state.voiceMaxSpeakers = config.maxVoiceSpeakers || 4;
  state.voiceSpeakerCount = function (roomId) {
    return (state.voiceSpeakers[roomId] || []).length;
  };
  state.voiceAddSpeaker = function (roomId, socketId) {
    if (!roomId || !socketId) return { ok: false, code: 'BAD_ARG' };
    if (!state.voiceSpeakers[roomId]) state.voiceSpeakers[roomId] = [];
    if (state.voiceSpeakers[roomId].indexOf(socketId) !== -1) return { ok: true, code: 'ALREADY' };
    if (state.voiceSpeakers[roomId].length >= state.voiceMaxSpeakers) return { ok: false, code: 'SPEAKER_LIMIT' };
    state.voiceSpeakers[roomId].push(socketId);
    if (state.users[socketId]) state.users[socketId]._voiceActive = true;
    return { ok: true, code: 'OK' };
  };
  state.voiceRemoveSpeaker = function (roomId, socketId) {
    var removed = false;
    if (state.voiceSpeakers[roomId]) {
      var idx = state.voiceSpeakers[roomId].indexOf(socketId);
      if (idx !== -1) { state.voiceSpeakers[roomId].splice(idx, 1); removed = true; }
      if (state.voiceSpeakers[roomId].length === 0) delete state.voiceSpeakers[roomId];
    }
    if (removed && state.users[socketId]) state.users[socketId]._voiceActive = false;
    return removed;
  };
  // Removes a socket from every room it was speaking in. Returns the list of
  // roomIds it was removed from (so callers can broadcast the departure).
  state.voiceRemoveFromAll = function (socketId) {
    var removedRooms = [];
    for (var rid in state.voiceSpeakers) {
      var idx = state.voiceSpeakers[rid].indexOf(socketId);
      if (idx !== -1) {
        state.voiceSpeakers[rid].splice(idx, 1);
        removedRooms.push(rid);
      }
      if (state.voiceSpeakers[rid].length === 0) delete state.voiceSpeakers[rid];
    }
    if (removedRooms.length > 0 && state.users[socketId]) state.users[socketId]._voiceActive = false;
    return removedRooms;
  };
  state.voiceSpeakersInRoom = function (roomId) {
    var names = [];
    (state.voiceSpeakers[roomId] || []).forEach(function (sid) {
      if (state.users[sid]) names.push({ name: state.users[sid].username, pic: state.users[sid].pic || 'pic.png' });
    });
    return names;
  };
  stateManager.getUserByToken = state.getUserByToken;

  var socketHandler = new SocketHandler(io, db, state, userManager, roomManager, rateLimiter);
  socketHandler.start();
};
