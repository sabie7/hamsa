var logger = require('../logger');
var guard = require('./guard');

module.exports = function (io, socket, db, state, rateLimiter) {
  var on = guard.on(socket, 'games');

  if (!state.games) state.games = [];
  if (!state.battles) state.battles = [];

  // ─═══ GAMES MANAGER ═══─

  // Game: create/start
  on('game:start', function (data) {
    if (!state.users[socket.id] || !data || !data.type) return;
    var user = state.users[socket.id];
    var game = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type: data.type,
      creator: user.username,
      state: 'playing',
      players: [{ name: user.username, id: socket.id }],
      spectators: [],
      createdAt: Date.now(),
    };
    state.games.unshift(game);
    if (state.games.length > 50) state.games.pop();
    io.emit('game:created', game);
    socket.join('game:' + game.id);
  });

  // Game: spectate
  on('game:spectate', function (data) {
    if (!data || !data.gameId) return;
    var user = state.users[socket.id];
    for (var i = 0; i < state.games.length; i++) {
      if (state.games[i].id === data.gameId) {
        state.games[i].spectators.push({ name: user ? user.username : 'مجهول', id: socket.id });
        socket.join('game:' + data.gameId);
        io.emit('game:spectate:update', state.games[i]);
        break;
      }
    }
  });

  // Game: action (move, input, etc.)
  on('game:action', function (data) {
    if (!state.users[socket.id] || !data || !data.gameId) return;
    var user = state.users[socket.id];
    io.to('game:' + data.gameId).emit('game:action', { from: user.username, action: data.action, payload: data.payload });
  });

  // Game: state sync
  on('game:sync', function (data) {
    if (!data || !data.gameId) return;
    io.to('game:' + data.gameId).emit('game:sync', { state: data.state, by: socket.id });
  });

  // Game: end
  on('game:end', function (data) {
    if (!data || !data.gameId) return;
    for (var i = 0; i < state.games.length; i++) {
      if (state.games[i].id === data.gameId) {
        state.games[i].state = 'ended';
        io.emit('game:ended', state.games[i]);
        state.games.splice(i, 1);
        break;
      }
    }
  });

  // Game: active games list
  on('game:active-list', function () {
    socket.emit('game:active-list', state.games);
  });

  // Game: spectate list (for sidebar)
  on('game:spectate:list', function () {
    socket.emit('game:spectate:list:update', state.games);
  });

  // ─═══ BATTLE SYSTEM ═══─

  // Battle: create challenge
  on('battle:create', function (data) {
    if (!state.users[socket.id] || !data || !data.target) return;
    var user = state.users[socket.id];
    var battle = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      creator: user.username,
      opponent: data.target,
      status: 'pending',
      rounds: [],
      currentRound: 0,
      totalRounds: data.rounds || 3,
      scores: {},
      createdAt: Date.now(),
    };
    battle.scores[user.username] = 0;
    battle.scores[data.target] = 0;
    state.battles.push(battle);
    io.emit('battle:created', { id: battle.id, creator: user.username, target: data.target });

    var tid = state.findSocketId(data.target);
    if (tid) {
      io.to(tid).emit('battle:invited', {
        id: battle.id,
        opponent: user.username,
        rounds: battle.totalRounds,
      });
    }
  });

  // Battle: accept challenge
  on('battle:accept', function (data) {
    if (!data || !data.id) return;
    for (var i = 0; i < state.battles.length; i++) {
      if (state.battles[i].id === data.id) {
        state.battles[i].status = 'active';
        io.emit('battle:started', state.battles[i]);
        break;
      }
    }
  });

  // Battle: decline challenge
  on('battle:decline', function (data) {
    if (!data || !data.id) return;
    for (var i = 0; i < state.battles.length; i++) {
      if (state.battles[i].id === data.id) {
        state.battles[i].status = 'declined';
        io.emit('battle:declined', state.battles[i]);
        state.battles.splice(i, 1);
        break;
      }
    }
  });

  // Battle: round action
  on('battle:round-action', function (data) {
    if (!state.users[socket.id] || !data || !data.id) return;
    var user = state.users[socket.id];
    for (var i = 0; i < state.battles.length; i++) {
      if (state.battles[i].id === data.id) {
        state.battles[i].rounds.push({ round: state.battles[i].currentRound, by: user.username, action: data.action });
        io.emit('battle:round-update', {
          id: data.id,
          round: state.battles[i].currentRound,
          by: user.username,
          action: data.action,
        });
        break;
      }
    }
  });

  // Battle: score update
  on('battle:score', function (data) {
    if (!data || !data.id || !data.player || data.score === undefined) return;
    for (var i = 0; i < state.battles.length; i++) {
      if (state.battles[i].id === data.id) {
        state.battles[i].scores[data.player] = data.score;
        io.emit('battle:score-update', { id: data.id, scores: state.battles[i].scores });
        break;
      }
    }
  });

  // Battle: end
  on('battle:end', function (data) {
    if (!data || !data.id) return;
    for (var i = 0; i < state.battles.length; i++) {
      if (state.battles[i].id === data.id) {
        state.battles[i].status = 'ended';
        io.emit('battle:ended', state.battles[i]);
        state.battles.splice(i, 1);
        break;
      }
    }
  });

  // Battle: sync state
  on('battle:sync', function () {
    socket.emit('battle:sync', { battles: state.battles });
  });
};
