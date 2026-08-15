var helpers = require('../utils/helpers');
var logger = require('../logger');
var guard = require('./guard');

var DEFAULT_ROOM_ID = 'efOiAhhNdL';
var MAX_ROOM_NAME = 30;
var MAX_ROOM_PASS = 50;

module.exports = function (io, socket, db, state, rateLimiter) {
  var on = guard.on(socket, 'rooms');

  function roomExists(id) {
    if (id === DEFAULT_ROOM_ID) return true;
    if (!state.rooms) return false;
    for (var i = 0; i < state.rooms.length; i++) {
      if (state.rooms[i].id === id) return true;
    }
    return false;
  }

  function moveUser(u, roomId) {
    var oldRoom = u.roomid || DEFAULT_ROOM_ID;
    // If the mover was an active voice speaker, drop them from every room's
    // speaker list so they never hold a slot in the room they just left.
    if (state.voiceRemoveFromAll) {
      var evicted = state.voiceRemoveFromAll(socket.id);
      evicted.forEach(function (rid) {
        io.to(rid).emit('voice:speaker-left', { name: u.username, roomId: rid });
      });
    }
    socket.leave(oldRoom);
    u.roomid = roomId;
    socket.join(roomId);
    for (var i = 0; i < state.online.length; i++) {
      if (state.online[i].id === socket.id) { state.online[i].roomid = roomId; break; }
    }
    return oldRoom;
  }

  on('change-room', function (data) {
    try {
      if (!data || typeof data.roomId !== 'string') return;
      var u = state.users[socket.id];
      if (!u) return;
      if (!roomExists(data.roomId)) return;
      moveUser(u, data.roomId);
      io.emit('room-changed', { roomId: data.roomId });
      socket.emit('room:updated', {});
    } catch (e) { logger.error('rooms.change_room', 'Error', { error: e.message }); }
  });

  on('create_room', function (data) {
    try {
      if (!data || typeof data.name !== 'string' || !data.name.trim()) return;
      var u = state.users[socket.id];
      if (!u) return;
      var room = {
        id: helpers.stringGen(12),
        name: helpers.escapeHtml(data.name).substring(0, MAX_ROOM_NAME),
        owner: u.username, ownerId: u.uid || socket.id,
        password: typeof data.password === 'string' ? data.password.substring(0, MAX_ROOM_PASS) : '',
        created: new Date().toISOString(), online: 0,
      };
      db.rooms.create(room);
      if (!state.rooms) state.rooms = [];
      state.rooms.push(room);
      io.emit('rooms:full-list', state.rooms);
    } catch (e) { logger.error('rooms.create_room', 'Error', { error: e.message }); }
  });

  on('join_room', function (data) {
    try {
      if (!data || typeof data.roomId !== 'string') return;
      var u = state.users[socket.id];
      if (!u) return;
      var room = null;
      for (var i = 0; i < state.rooms.length; i++) {
        if (state.rooms[i].id === data.roomId) { room = state.rooms[i]; break; }
      }
      if (!room) return;
      var pass = typeof data.password === 'string' ? data.password : '';
      if (room.password && room.password !== pass) {
        socket.emit('error-msg', { msg: 'كلمة المرور غير صحيحة' });
        return;
      }
      moveUser(u, data.roomId);
      io.emit('room-changed', { roomId: data.roomId });
    } catch (e) { logger.error('rooms.join_room', 'Error', { error: e.message }); }
  });

  on('enterking', function () {
    try {
      var u = state.users[socket.id];
      if (!u) return;
      io.emit('enterking', { name: u.username });
    } catch (e) {}
  });

  on('getroomcount', function (data) {
    try {
      if (!data || typeof data.roomId !== 'string') return;
      var count = 0;
      for (var i = 0; i < state.online.length; i++) {
        if (state.online[i].roomid === data.roomId) count++;
      }
      socket.emit('updateOnline', { count: count });
    } catch (e) { logger.error('rooms.getroomcount', 'Error', { error: e.message }); }
  });
};


