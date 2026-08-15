function UserManager() {
  this.users = {};
  this.online = [];
  this.sessions = {};
  this.HEARTBEAT_TIMEOUT = 60000;
}

UserManager.prototype.get = function (socketId) {
  return this.users[socketId] || null;
};

UserManager.prototype.getByToken = function (token) {
  for (const sid in this.users) {
    if (this.users[sid].token === token) return this.users[sid];
  }
  return null;
};

UserManager.prototype.findSocketId = function (name) {
  for (const sid in this.users) {
    if (this.users[sid].username === name) return sid;
  }
  return null;
};

UserManager.prototype.findByUsername = function (username) {
  for (const sid in this.users) {
    if (this.users[sid].username && this.users[sid].username.toLowerCase() === String(username).toLowerCase()) return this.users[sid];
  }
  return null;
};

UserManager.prototype.add = function (user) {
  if (user && user.id) this.users[user.id] = user;
  return user || null;
};

UserManager.prototype.remove = function (socketId) {
  const user = this.users[socketId] || null;
  if (user) delete this.users[socketId];
  this.removeOnlineBySocketId(socketId);
  return user;
};

UserManager.prototype.recordSession = function (user) {
  if (user && user.uid && user.id) {
    this.sessions[user.uid] = { socketId: user.id, username: user.username, lid: user.lid, time: Date.now() };
  }
};

UserManager.prototype.touchHeartbeat = function (socketId) {
  if (this.users[socketId]) this.users[socketId]._lastHeartbeat = Date.now();
};

UserManager.prototype.sweepHeartbeats = function (io) {
  const now = Date.now();
  for (const sid in this.users) {
    if (this.users[sid]._lastHeartbeat && now - this.users[sid]._lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
      const s = io.sockets.sockets.get(sid);
      if (s) s.disconnect(true);
    }
  }
};

UserManager.prototype.addOnline = function (entry) {
  this.online.push(entry);
  return this.online[this.online.length - 1];
};

// Adds an online entry, first removing any previous entries that belong to
// the same socket id or the same account (lid). Prevents duplicate rows when
// a client reconnects quickly or the same account is used across tabs.
UserManager.prototype.addOrUpdateOnline = function (entry) {
  if (!entry || !entry.id) return entry;
  for (let i = this.online.length - 1; i >= 0; i--) {
    const o = this.online[i];
    if (o.id === entry.id || (o.lid && entry.lid && o.lid === entry.lid)) {
      this.online.splice(i, 1);
    }
  }
  this.online.push(entry);
  return entry;
};

UserManager.prototype.removeOnlineBySocketId = function (socketId) {
  for (let i = this.online.length - 1; i >= 0; i--) {
    if (this.online[i].id === socketId) { this.online.splice(i, 1); break; }
  }
};

UserManager.prototype.setOnlineRoom = function (socketId, roomId) {
  for (let i = 0; i < this.online.length; i++) {
    if (this.online[i].id === socketId) { this.online[i].roomid = roomId; break; }
  }
};

UserManager.prototype.countInRoom = function (roomId) {
  let cnt = 0;
  for (const sid in this.users) {
    if (this.users[sid].roomid === roomId) cnt++;
  }
  return cnt;
};

module.exports = UserManager;
