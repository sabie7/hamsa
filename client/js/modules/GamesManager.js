export const GamesManager = {
  activeSpectateGames: [],
  activeGame: null,

  init() {
    if (GamesManager._inited) return GamesManager;
    GamesManager._inited = true;
    const socket = window.socket;
    if (!socket) return GamesManager;

    socket.on('game:spectate:list:update', (games) => {
      GamesManager.activeSpectateGames = Array.isArray(games) ? games : [];
      GamesManager.renderSpectateGamesList();
    });

    socket.on('battle:sync', (data) => {
      if (data && data.hasActiveBattle && data.battleId) {
        if (!GamesManager.activeGame || GamesManager.activeGame.battleId !== data.battleId) {
          GamesManager.activeGame = {
            gameId: data.battleId,
            battleId: data.battleId,
            roomId: data.roomId,
            status: data.status,
            player1: data.player1 || { username: data.player1Name || 'لاعب 1' },
            player2: data.player2 || { username: data.player2Name || 'لاعب 2' },
            state: { isSpectator: true },
          };
        }
      } else if (data && !data.hasActiveBattle) {
        GamesManager.activeGame = null;
      }
    });

    socket.on('battle:finished', (data) => {
      if (data && data.battleId && GamesManager.activeGame && GamesManager.activeGame.battleId === data.battleId) {
        GamesManager.activeGame = null;
      }
    });

    socket.on('battle:cancelled', (data) => {
      if (data && GamesManager.activeGame) GamesManager.activeGame = null;
    });

    return GamesManager;
  },

  loadGamesLobby() {
    const container = document.getElementById('sidebar-games-container');
    if (container) {
      const gamesList = GamesManager.activeSpectateGames || [];
      if (gamesList.length === 0) {
        container.innerHTML =
          '<div class="text-center text-muted p-4"><i class="fas fa-gamepad fa-2x mb-2 d-block"></i>لا توجد معارك جارية الآن.<br>ابدأ تحدي مع من تحب من القائمة الجانبية.</div>';
      } else {
        container.innerHTML = gamesList
          .map((g) => {
            const t1 = g.player1Name || (g.player1 && (g.player1.username || g.player1.topic)) || '';
            const t2 = g.player2Name || (g.player2 && (g.player2.username || g.player2.topic)) || '';
            return `<div class="border rounded p-2 mb-2 bg-white">
              <div class="small fw-bold text-center mb-1">${g.type === 'live' ? '📡 بث مباشر' : '⚔️ ملحمة'}</div>
              <div class="d-flex justify-content-between small bg-light rounded p-1">
                <span class="text-truncate ms-1">${escapeHtml(t1)}</span>
                <span class="text-muted">VS</span>
                <span class="text-truncate me-1">${escapeHtml(t2)}</span>
              </div>
            </div>`;
          })
          .join('');
      }
    }
    const socket = window.socket;
    if (socket) socket.emit('game:spectate:list');
  },

  renderSpectateGamesList() {
    const games = GamesManager.activeSpectateGames || [];
    const badge = document.getElementById('active-games-count-badge');
    if (badge) {
      badge.innerText = String(games.length);
      badge.classList.toggle('d-none', games.length === 0);
    }
    const btn = document.getElementById('active-games-floating-btn');
    if (btn) btn.classList.toggle('d-none', games.length === 0);

    const container = document.getElementById('sidebar-spectate-container') || document.getElementById('active-games-sidebar-container');
    if (!container) return;
    if (games.length === 0) {
      container.innerHTML = '<div class="text-center text-muted p-4"><i class="fas fa-tv fa-2x mb-2 d-block"></i>لا توجد ألعاب جارية للمشاهدة.</div>';
      return;
    }
    container.innerHTML = games
      .map(
        (g) => `<div class="border rounded p-2 mb-2 bg-white cursor-pointer" data-game-id="${escapeHtml(g.gameId || '')}">
          <div class="small fw-bold text-center mb-1">${g.type === 'live' ? '📡 بث مباشر' : '⚔️ ملحمة مباشرة'}</div>
          <div class="d-flex justify-content-between small bg-light rounded p-1">
            <span class="text-truncate ms-1">${escapeHtml(g.player1Name || (g.player1 && (g.player1.username || g.player1.topic)) || '')}</span>
            <span class="text-muted">VS</span>
            <span class="text-truncate me-1">${escapeHtml(g.player2Name || (g.player2 && (g.player2.username || g.player2.topic)) || '')}</span>
          </div>
          <div class="small text-center text-muted mt-1">${g.type === 'live' ? 'مباشر الآن' : 'جولة ' + (g.status || '')}</div>
        </div>`
      )
      .join('');

    container.querySelectorAll('[data-game-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const gid = el.getAttribute('data-game-id');
        const game = games.find((g) => String(g.gameId) === String(gid));
        if (!game) return;
        if (game.type === 'live') {
          if (typeof window.ensureLiveBroadcastLoaded === 'function') {
            window.ensureLiveBroadcastLoaded().then(() => {
              if (window.liveBroadcastManager && typeof window.liveBroadcastManager.watchBroadcast === 'function') {
                window.liveBroadcastManager.watchBroadcast(game.userId);
              }
            });
          }
          return;
        }
        GamesManager.activeGame = {
          gameId: game.gameId,
          battleId: game.gameId,
          roomId: game.roomId,
          status: game.status,
          player1: game.player1 || { username: game.player1Name || 'لاعب 1' },
          player2: game.player2 || { username: game.player2Name || 'لاعب 2' },
          state: { isSpectator: true },
        };
        if (window.socket) window.socket.emit('battle:syncState', { roomId: Number(game.roomId) });
      });
    });
  },

  closeActiveGame() {
    GamesManager.activeGame = null;
  },
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}