var logger = require('../logger');
var guard = require('./guard');
var config = require('../config');

var DEFAULT_ROOM_ID = 'efOiAhhNdL';

// Maps client RTCPeerConnection.connectionState values to a stable UI state.
var STATE_MAP = {
  new: 'connecting',
  connecting: 'connecting',
  checking: 'connecting',
  connected: 'connected',
  completed: 'connected',
  disconnected: 'reconnecting',
  failed: 'failed',
  closed: 'disconnected',
};

module.exports = function (io, socket, db, state, rateLimiter) {
  var on = guard.on(socket, 'voice');

  function user() { return state.users[socket.id]; }
  function roomId() {
    var u = user();
    return (u && u.roomid) || DEFAULT_ROOM_ID;
  }

  // Send ICE/TURN config + speaker cap so the client can build its
  // RTCPeerConnection correctly (STUN alone fails behind strict NAT).
  socket.emit('voice:config', {
    iceServers: config.buildIceServers(),
    maxSpeakers: state.voiceMaxSpeakers,
  });

  // ── WebRTC signaling (mesh, room-scoped target) ──
  on('voice:offer', function (data) {
    var u = user();
    if (!u || !data || !data.target) return;
    var tid = state.findSocketId(data.target);
    if (tid) io.to(tid).emit('voice:offer', { from: u.username, sdp: data.sdp, roomId: roomId() });
  });

  on('voice:answer', function (data) {
    var u = user();
    if (!u || !data || !data.target) return;
    var tid = state.findSocketId(data.target);
    if (tid) io.to(tid).emit('voice:answer', { from: u.username, sdp: data.sdp });
  });

  on('voice:ice-candidate', function (data) {
    var u = user();
    if (!u || !data || !data.target) return;
    var tid = state.findSocketId(data.target);
    if (tid) io.to(tid).emit('voice:ice-candidate', { from: u.username, candidate: data.candidate });
  });

  // ── Speaker lifecycle (enforced cap) ──
  function joinSpeaker() {
    var u = user();
    if (!u) return;
    var rid = roomId();
    var res = state.voiceAddSpeaker(rid, socket.id);
    if (!res.ok) {
      if (res.code === 'SPEAKER_LIMIT') {
        socket.emit('voice:error', {
          code: 'SPEAKER_LIMIT',
          roomId: rid,
          limit: state.voiceMaxSpeakers,
          msg: 'لا يمكن فتح المايك، عدد المتحدثين في الغرفة بلغ الحد الأقصى (' + state.voiceMaxSpeakers + ')',
        });
      }
      return;
    }
    if (res.code !== 'ALREADY') {
      io.to(rid).emit('voice:speaker-joined', { name: u.username, roomId: rid });
    }
  }

  function leaveSpeaker() {
    var u = user();
    if (!u) return;
    var rid = roomId();
    if (state.voiceRemoveSpeaker(rid, socket.id)) {
      io.to(rid).emit('voice:speaker-left', { name: u.username, roomId: rid });
    }
  }

  // mic-toggle doubles as speaker join/leave so the existing client buttons
  // keep working while also enforcing the per-room speaker cap.
  on('voice:mic-toggle', function (data) {
    var u = user();
    if (!u) return;
    var enabled = !!(data && data.enabled);
    if (enabled) joinSpeaker();
    else leaveSpeaker();
    io.to(roomId()).emit('voice:mic-status', { name: u.username, enabled: enabled, roomId: roomId() });
  });

  on('voice:speaker-join', function () { joinSpeaker(); });
  on('voice:speaker-leave', function () { leaveSpeaker(); });

  // Speaker mute toggle — room-scoped
  on('voice:speaker-muted', function (data) {
    var u = user();
    if (!u) return;
    io.to(roomId()).emit('voice:speaker-muted', { name: u.username, muted: !!(data && data.muted), roomId: roomId() });
  });

  // ── Room voice broadcast (admin/moderator mic broadcast to room only) ──
  // Effective power comes from the numeric rank in the user's powers config
  // (guests have rank 0); CP-authenticated sockets bypass the gate.
  on('voice:broadcast', function (data) {
    var u = user();
    if (!u || !data || !data.audio) return;
    var rank = (u.powers && typeof u.powers.rank === 'number') ? u.powers.rank : 0;
    if (rank < 1 && !socket.isAdmin) { socket.emit('voice:error', { code: 'FORBIDDEN', msg: 'ليس لديك صلاحية البث الصوتي' }); return; }
    io.to(roomId()).emit('voice:broadcast', { from: u.username, audio: data.audio, roomId: roomId() });
  });

  // ── Connection-state indicators ──
  // Client reports its local RTCPeerConnection state; the server relays it to
  // the whole room so every participant can show connecting/connected/failed.
  on('voice:state', function (data) {
    var u = user();
    if (!u || !data || !data.state) return;
    var rid = roomId();
    io.to(rid).emit('voice:peer-state', {
      name: u.username,
      state: STATE_MAP[data.state] || String(data.state),
      target: data.target || null,
      roomId: rid,
    });
  });

  // Request active speakers list (scoped to the caller's room only)
  on('voice:active-users', function () {
    socket.emit('voice:active-users', {
      roomId: roomId(),
      speakers: state.voiceSpeakersInRoom(roomId()),
      max: state.voiceMaxSpeakers,
    });
  });
};
