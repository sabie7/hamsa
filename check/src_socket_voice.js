var logger = require('../logger');

module.exports = function (io, socket, db, state, rateLimiter) {

  // WebRTC signaling: offer
  socket.on('voice:offer', function (data) {
    if (!state.users[socket.id] || !data || !data.target) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.target);
    if (tid) {
      io.to(tid).emit('voice:offer', { from: user.username, sdp: data.sdp });
    }
  });

  // WebRTC signaling: answer
  socket.on('voice:answer', function (data) {
    if (!state.users[socket.id] || !data || !data.target) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.target);
    if (tid) {
      io.to(tid).emit('voice:answer', { from: user.username, sdp: data.sdp });
    }
  });

  // WebRTC signaling: ICE candidate
  socket.on('voice:ice-candidate', function (data) {
    if (!state.users[socket.id] || !data || !data.target) return;
    var user = state.users[socket.id];
    var tid = state.findSocketId(data.target);
    if (tid) {
      io.to(tid).emit('voice:ice-candidate', { from: user.username, candidate: data.candidate });
    }
  });

  // Mic toggle
  socket.on('voice:mic-toggle', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    var enabled = data && data.enabled;
    io.emit('voice:mic-status', { name: user.username, enabled: enabled });
  });

  // Speaker mute toggle
  socket.on('voice:speaker-muted', function (data) {
    if (!state.users[socket.id]) return;
    var user = state.users[socket.id];
    io.emit('voice:speaker-muted', { name: user.username, muted: data && data.muted });
  });

  // Room voice broadcast (admin/moderator mic broadcast to room)
  socket.on('voice:broadcast', function (data) {
    if (!state.users[socket.id] || !data || !data.audio) return;
    var user = state.users[socket.id];
    if (user.power < 1) return;
    if (user.roomid) {
      io.to(user.roomid).emit('voice:broadcast', { from: user.username, audio: data.audio });
    }
  });

  // Request active voice users list
  socket.on('voice:active-users', function () {
    var active = [];
    for (var sid in state.users) {
      if (state.users[sid]._voiceActive) {
        active.push({ name: state.users[sid].username, pic: state.users[sid].pic });
      }
    }
    socket.emit('voice:active-users', active);
  });
};
