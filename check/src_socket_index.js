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
  stateManager.getUserByToken = state.getUserByToken;

  var socketHandler = new SocketHandler(io, db, state, userManager, roomManager, rateLimiter);
  socketHandler.start();
};
