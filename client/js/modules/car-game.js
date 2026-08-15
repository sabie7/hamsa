/* ══════════════════════════════════════════════════════════════
   CAR GAME — Car Dodger
   Clean ES-module rebuild of the legacy Car Dodger, rendered into
   the existing #game-stage canvas. Uses the game framework events:
   game:start / game:action / game:end (server: src/socket/games.js).
   The creator plays locally; spectators receive game:action moves.
   ══════════════════════════════════════════════════════════════ */

var api = { emit: null };
var canvas = null;
var ctx = null;
var raf = null;
var running = false;
var gameId = null;
var spectating = false;

var car = { x: 0.5, w: 0.1, speed: 0.045 };
var obstacles = [];
var score = 0;
var speed = 0.006;
var spawnTimer = 0;
var keys = {};

function stage() {
  return document.getElementById('game-stage');
}

function buildCanvas() {
  var el = stage();
  if (!el) return null;
  el.innerHTML = '';
  canvas = document.createElement('canvas');
  canvas.className = 'car-game-canvas';
  canvas.width = Math.max(280, el.clientWidth || 360);
  canvas.height = Math.max(420, el.clientHeight || 480);
  el.appendChild(canvas);
  ctx = canvas.getContext('2d');
  return canvas;
}

function reset() {
  car.x = 0.5;
  car.w = 0.1;
  obstacles = [];
  score = 0;
  speed = 0.006;
  spawnTimer = 0;
}

function draw() {
  if (!ctx) return;
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#222831';
  ctx.fillRect(0, 0, W, H);

  var laneW = W / 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 12]);
  for (var i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * laneW, 0);
    ctx.lineTo(i * laneW, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (var oi = 0; oi < obstacles.length; oi++) {
    var ob = obstacles[oi];
    var ox = ob.x * W - ob.w * W / 2;
    var oy = ob.y * H - ob.h * H;
    ctx.fillStyle = '#f05454';
    ctx.fillRect(ox, oy, ob.w * W, ob.h * H);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(ox + ob.w * W / 2 - W * 0.012, oy + ob.h * H * 0.15, W * 0.024, ob.h * H * 0.2);
  }

  var cx = car.x * W - car.w * W / 2;
  var cy = H - H * 0.14 - H * 0.09;
  ctx.fillStyle = '#4ecdc4';
  ctx.fillRect(cx, cy, car.w * W, H * 0.09);
  ctx.fillStyle = '#1a936f';
  ctx.fillRect(cx + car.w * W / 2 - W * 0.015, cy - H * 0.02, W * 0.03, H * 0.02);
}

function step() {
  if (keys.left) car.x -= car.speed;
  if (keys.right) car.x += car.speed;
  car.x = Math.max(0.03, Math.min(0.97, car.x));

  spawnTimer++;
  if (spawnTimer > Math.max(30, 70 - score * 0.8)) {
    spawnTimer = 0;
    var lane = Math.floor(Math.random() * 3);
    var laneCenter = (lane + 0.5) / 3;
    obstacles.push({ x: laneCenter + (Math.random() - 0.5) * 0.03, y: -0.1, w: 0.11, h: 0.12 });
  }

  for (var i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].y += speed + score * 0.00005;
    if (obstacles[i].y > 1.05) {
      obstacles.splice(i, 1);
      score++;
      speed = Math.min(0.022, speed + 0.0004);
    }
  }

  var carTop = 1 - 0.14 - 0.09;
  for (var j = 0; j < obstacles.length; j++) {
    var ob = obstacles[j];
    if (ob.y + ob.h > carTop && ob.y < carTop + 0.09 + 0.02) {
      if (Math.abs(ob.x - car.x) < (ob.w + car.w) / 2) {
        gameOver();
        return;
      }
    }
  }

  if (api.emit && gameId) {
    api.emit('game:action', { gameId: gameId, action: 'move', payload: { x: car.x, score: score } });
  }
}

function loop() {
  if (!running) return;
  step();
  draw();
  raf = requestAnimationFrame(loop);
}

function gameOver() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  if (api.emit && gameId) api.emit('game:end', { gameId: gameId });
  gameId = null;
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💥 انتهت اللعبة', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '18px sans-serif';
    ctx.fillText('نتيجتك: ' + score, canvas.width / 2, canvas.height / 2 + 26);
  }
  keys = {};
}

function onKey(e, down) {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = down;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = down;
}

export function initCarGame(deps) {
  api = deps || api;
}

export function launchCarGame() {
  if (running) return;
  if (!buildCanvas()) return;
  reset();
  spectating = false;
  running = true;
  if (api.emit) api.emit('game:start', { type: 'car-dodger' });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  loop();
}

function onKeyDown(e) { onKey(e, true); }
function onKeyUp(e) { onKey(e, false); }

export function onCarGameCreated(game) {
  if (!game || game.type !== 'car-dodger') return;
  if (gameId) return;
  if (!canvas) {
    if (!buildCanvas()) return;
    spectating = true;
    running = false;
    reset();
    drawSpectate();
  }
  gameId = game.id;
}

function drawSpectate() {
  if (!ctx) return;
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#222831';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('👁️ أنت تشاهد مباراة Car Dodger', W / 2, H / 2 - 8);
  ctx.font = '13px sans-serif';
  ctx.fillText('انتظر حركة اللاعب...', W / 2, H / 2 + 16);
}

export function onCarGameAction(data) {
  if (!data || !data.payload) return;
  if (spectating && ctx && canvas) {
    if (typeof data.payload.x === 'number') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawSpectate();
      var cx = data.payload.x * canvas.width;
      ctx.fillStyle = '#4ecdc4';
      ctx.fillRect(cx - canvas.width * 0.05, canvas.height - canvas.height * 0.23, canvas.width * 0.1, canvas.height * 0.09);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((data.from || 'لاعب') + ' يلعب', canvas.width / 2, canvas.height - 12);
    }
  }
}

export function closeCarGame() {
  running = false;
  spectating = false;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  gameId = null;
  keys = {};
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  var el = stage();
  if (el) el.innerHTML = '';
  canvas = null;
  ctx = null;
}
