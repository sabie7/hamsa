const helpers = require('../utils/helpers');

const DEFAULT_ROOM_ID = 'efOiAhhNdL';

function RoomManager(db) {
  this.db = db;
  this.rooms = db.rooms.getAll();
  this.DEFAULT_ROOM_ID = DEFAULT_ROOM_ID;
}

RoomManager.prototype.seedDefault = function () {
  if (this.rooms.length === 0) {
    this.db.rooms.create({ id: DEFAULT_ROOM_ID, name: 'الساحة الرئيسية', owner: 'system', password: '', created: new Date().toISOString(), online: 0 });
    this.rooms = this.db.rooms.getAll();
  }
  return this.rooms;
};

RoomManager.prototype.reload = function () {
  this.rooms = this.db.rooms.getAll();
  return this.rooms;
};

RoomManager.prototype.get = function (id) {
  for (let i = 0; i < this.rooms.length; i++) {
    if (this.rooms[i].id === id) return this.rooms[i];
  }
  return null;
};

RoomManager.prototype.stats = function (users) {
  const roomStats = {};
  for (let ri = 0; ri < this.rooms.length; ri++) {
    const r = this.rooms[ri];
    roomStats[r.id] = { id: r.id, name: r.name, online: 0 };
  }
  for (const si in users) {
    const uid = users[si].roomid || DEFAULT_ROOM_ID;
    if (roomStats[uid]) roomStats[uid].online++;
  }
  return Object.keys(roomStats).map(function (k) { return roomStats[k]; });
};

RoomManager.prototype.updateOnlineCounts = function (users) {
  for (let ri = 0; ri < this.rooms.length; ri++) {
    const r = this.rooms[ri];
    let cnt = 0;
    for (const si in users) { if (users[si].roomid === r.id) cnt++; }
    this.rooms[ri].online = cnt;
  }
};

RoomManager.prototype.create = function (name, password, owner) {
  const room = {
    id: helpers.stringGen(12),
    name: helpers.escapeHtml(name || '').substring(0, 30),
    owner: owner || 'guest', ownerId: '',
    password: password || '', created: new Date().toISOString(), online: 0,
  };
  this.db.rooms.create(room);
  this.rooms = this.db.rooms.getAll();
  return room;
};

RoomManager.prototype.delete = function (id) {
  this.db.rooms.deleteOne({ id: id });
  this.reload();
};

module.exports = RoomManager;
