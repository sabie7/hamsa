const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { Server } = require('socket.io');

const config = require('./config');
const logger = require('./logger');
const helpers = require('./utils/helpers');
const { getDb, connect, getAdminCredentials, healthCheck, close } = require('./db');
const attachSocket = require('./socket');
const initApi = require('./routes/api');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || config.port || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      "font-src": ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      "img-src": ["'self'", "data:", "blob:", "https://picsum.photos", "https://cdn.jsdelivr.net"],
      "media-src": ["'self'", "blob:", "data:"],
      "connect-src": ["'self'", "wss:", "ws:"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "upgrade-insecure-requests": []
    }
  },
  crossOriginEmbedderPolicy: false
}));

const corsOrigin = config.corsOrigin || '*';
app.use(cors({
  origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(function (o) { return o.trim(); }),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, '/');
  next();
});

const globalLimiter = rateLimit({ windowMs: 60000, max: 1000, message: 'Too many requests' });
app.use('/api/', globalLimiter);

// Tighter dedicated limits for sensitive endpoints
const uploadLimiter = rateLimit({ windowMs: 60000, max: 15, message: 'Too many uploads, slow down' });
const loginLimiter = rateLimit({ windowMs: 60000, max: 10, message: 'Too many login attempts' });
const settingsLimiter = rateLimit({ windowMs: 60000, max: 60, message: 'Too many settings requests' });

const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const CP_HTML = path.join(ROOT_DIR, 'cp.html');

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(INDEX_HTML);
});

app.get(['/cp', '/cp.html', '/client/cp.html'], (req, res) => {
  res.sendFile(CP_HTML);
});

app.use('/client', express.static(CLIENT_DIR, { index: false }));
app.use('/js', express.static(path.join(CLIENT_DIR, 'js'), { index: false }));
app.use('/css', express.static(path.join(CLIENT_DIR, 'css'), { index: false, maxAge: '1h', setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate'); } }));
app.use('/dist', express.static(path.join(CLIENT_DIR, 'dist'), { index: false }));
app.use('/vendor', express.static(path.join(CLIENT_DIR, 'vendor'), { index: false }));
app.use('/uploads', express.static(path.join(CLIENT_DIR, 'uploads'), { index: false, maxAge: '7d', setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); } }));
app.get('/emoii.gif', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'emoii.gif')));
app.get('/mic.png', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'mic.png')));
app.get('/verified-badge.svg', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'verified-badge.svg')));
app.get('/keepalive', (req, res) => res.status(204).end());
app.get('/manifest.json', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'manifest.json')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'sw.js')));

app.use('/assets', express.static(path.join(config.rootDir, 'assets')));

const uploadDir = path.join(config.rootDir, 'assets', 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = config.allowedMimeTypes[file.mimetype] || path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes || 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (config.allowedMimeTypes[file.mimetype]) cb(null, true);
    else cb(new Error('Invalid file type'), false);
  }
});

app.post('/api/upload', uploadLimiter, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Validate actual content (magic bytes), not just the client-supplied mimetype.
  try {
    const fd = fs.openSync(req.file.path, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    const sniffed = helpers.sniffExt(buf);
    const expectedExt = config.allowedMimeTypes[req.file.mimetype];
    if (sniffed !== expectedExt) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File content does not match declared type' });
    }
  } catch (e) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Unable to validate file' });
  }
  res.json({ url: '/assets/uploads/' + req.file.filename, name: req.file.filename });
});

app.post('/api/uploadbase64', uploadLimiter, (req, res) => {
  if (!req.body || !req.body.image) return res.status(400).json({ error: 'No image data' });
  const matches = req.body.image.match(/^data:image\/([\w]+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Invalid image data' });
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  if (!config.allowedMimeTypes['image/' + ext] && !config.allowedMimeTypes[matches[1]]) {
    return res.status(400).json({ error: 'Invalid image type' });
  }
  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.length > (config.maxUploadBytes || 50 * 1024 * 1024)) {
    return res.status(400).json({ error: 'File too large' });
  }
  // Validate magic bytes for base64-uploaded images too.
  if (helpers.sniffExt(buffer) !== ext) {
    return res.status(400).json({ error: 'File content does not match declared type' });
  }
  const filename = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext;
  fs.writeFileSync(path.join(uploadDir, filename), buffer);
  res.json({ url: '/assets/uploads/' + filename, name: filename });
});

app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : 'Upload error';
    return res.status(400).json({ error: msg });
  }
  if (err && err.message === 'Invalid file type') {
    return res.status(400).json({ error: 'Invalid file type' });
  }
  next(err);
});

const apiRouter = express.Router();
let apiReady = false;
let apiDb = null;
const apiStateManager = { getUserByToken: () => null };

apiRouter.all('/*', (req, res, next) => {
  if (!apiReady) return res.status(503).json({ error: 'API not ready yet' });
  next();
});

app.use('/api', apiRouter);

const DEAD_ROUTES = ['/contact', '/rules', '/about', '/help', '/faq', '/terms', '/privacy', '/support'];
DEAD_ROUTES.forEach((route) => {
  app.get(route, (req, res) => {
    res.status(404).json({ error: 'Page not found', path: req.path });
  });
});

app.use(['/js/*', '/css/*', '/images/*'], (req, res) => {
  res.status(404).json({ error: 'Asset not found' });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found' });
  if (req.path.startsWith('/assets/') || req.path.startsWith('/uploads/')) return res.status(404).send('Not found');
  if (/\.(js|css|json|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|mp3|mp4|webm)$/i.test(req.path)) return res.status(404).send('Not found');
  res.sendFile(INDEX_HTML);
});

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

// Optional horizontal-scaling support: attach the @socket.io/redis-adapter
// only when REDIS_URL is set. Single-instance operation is unaffected when
// the variable is absent (and the packages are never required).
if (process.env.REDIS_URL) {
  let setupRedis = null;
  try {
    const redis = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    setupRedis = function () {
      const pubClient = redis.createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      return Promise.all([pubClient.connect(), subClient.connect()])
        .then(function () {
          io.adapter(createAdapter(pubClient, subClient));
          logger.info('socket.redis', 'Redis adapter attached');
        })
        .catch(function (e) { logger.error('socket.redis', 'Failed to attach adapter', { error: e && e.message }); });
    };
  } catch (e) {
    logger.warn('socket.redis', 'REDIS_URL set but redis adapter packages are not installed', { error: e && e.message });
    setupRedis = function () { return Promise.resolve(); };
  }
  setupRedis();
}

async function start() {
  await connect();
  const db = getDb();
  const stateManager = { getUserByToken: () => null };
  const dbRef = { db, healthCheck };
  apiReady = true;
  apiDb = db;
  apiStateManager.getUserByToken = stateManager.getUserByToken;
  initApi(apiRouter, dbRef, apiStateManager, { settings: settingsLimiter });
  attachSocket(io, db, stateManager);
  apiStateManager.getPublicOnlineUsers = stateManager.getPublicOnlineUsers || function () { return []; };
  require('./services/backupScheduler').start(db);

  // ── Listen with graceful EADDRINUSE handling ────────────────────────────────
  // A stale TIME_WAIT socket (e.g. from a previous crashed launch) can leave the
  // port briefly occupied on Windows. Instead of dying on an unhandled 'error'
  // event, retry with a short backoff so a normal restart survives it.
  var LISTEN_RETRIES = 5;
  var LISTEN_RETRY_MS = 1000;
  var listenAttempts = 0;

  function printBanner() {
    logger.info('server.start', 'Running', { port: PORT });
    const adminCred = getAdminCredentials();
    if (adminCred) {
      const banner = [
        '',
        '══════════════════════════════════════════════',
        '  Control Panel Login  (لوحة التحكم)',
        '  URL:      http://localhost:' + PORT + '/cp',
        '  Username: ' + adminCred.username,
        '  Password: ' + adminCred.password,
        '  Status:   ' + (adminCred.existed ? 'Existing account (password from env)' : 'Auto-created on first boot'),
        '══════════════════════════════════════════════',
        ''
      ].join('\n');
      console.log(banner);
    }
  }

  function bindServer() {
    server.once('error', function (err) {
      if (err && err.code === 'EADDRINUSE' && listenAttempts < LISTEN_RETRIES) {
        listenAttempts += 1;
        logger.warn('server.listen', 'Port busy, retrying', { port: PORT, attempt: listenAttempts });
        setTimeout(bindServer, LISTEN_RETRY_MS);
        return;
      }
      logger.error('server.listen', 'Fatal listen error', { error: err && err.stack || err });
      process.exit(1);
    });
    server.listen(PORT, printBanner);
  }

  bindServer();
}

// ── Graceful shutdown (Phase 8) ─────────────────────────────────────────────
// On SIGTERM/SIGINT stop accepting new connections, let in-flight requests
// drain, disconnect every Socket.io client, and close the Mongo connection
// before exiting. A hard timeout force-exits if anything hangs.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server.shutdown', 'Shutting down', { signal: signal });

  const forceTimer = setTimeout(() => {
    logger.error('server.shutdown', 'Forced exit after timeout');
    process.exit(1);
  }, 15000);
  forceTimer.unref();

  server.close(() => {
    logger.info('server.shutdown', 'HTTP server closed');
  });

  // Disconnect all sockets cleanly (flushes queued packets).
  try { io.disconnectSockets(true); } catch (e) { /* ignore */ }

  Promise.resolve()
    .then(() => new Promise((resolve) => {
      io.close(() => resolve());
    }))
    .then(() => close())
    .then(() => new Promise((resolve) => {
      // Let buffered stdout/stderr writes drain before exit so the final
      // "shutdown complete" record is not truncated from the container log.
      setTimeout(resolve, 250);
    }))
    .then(() => {
      clearTimeout(forceTimer);
      logger.info('server.shutdown', 'Shutdown complete');
      setTimeout(() => process.exit(0), 150);
    })
    .catch((err) => {
      logger.error('server.shutdown', 'Shutdown error', { error: err && err.message });
      setTimeout(() => process.exit(1), 150);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
