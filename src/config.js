var path = require('path');
var crypto = require('crypto');
var fs = require('fs');

// ── Minimal .env loader (no external dependency) ──
(function loadEnv() {
  try {
    var envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    var lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var eq = line.indexOf('=');
      if (eq < 1) return;
      var key = line.slice(0, eq).trim();
      var val = line.slice(eq + 1).trim();
      if (process.env[key] === undefined) process.env[key] = val;
    });
  } catch (e) { /* ignore */ }
})();

// ── Fail fast in production when critical secrets are missing ──
if (process.env.NODE_ENV === 'production') {
  var missing = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.ADMIN_PASS) missing.push('ADMIN_PASS');
  if (missing.length > 0) {
    console.error('[FATAL] Missing required environment variables in production: ' + missing.join(', ') + '. Set them in .env (see .env.example).');
    process.exit(1);
  }
}

var config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  rootDir: process.cwd(),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/njmoman',
  // JWT_SECRET defaults to a random per-boot value in dev; MUST be set in production.
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex'),
  adminUser: process.env.ADMIN_USER || 'admin',
  // No hardcoded default password. In dev, require an explicit ADMIN_PASS so a
  // known default can never ship; the CP login + bootstrap admin will refuse
  // the well-known "admin123" value.
  adminPass: process.env.ADMIN_PASS || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES, 10) || 50 * 1024 * 1024,
  // WebRTC voice (Phase 4): STUN/TURN + speaker cap. TURN_URL should be a
  // "turn:" or "turns:" URI (e.g. turn:turn.example.com:3478). Leave
  // TURN_URL empty to fall back to public STUN only.
  turnUrl: process.env.TURN_URL || '',
  turnUser: process.env.TURN_USER || '',
  turnPass: process.env.TURN_PASS || '',
  stunUrls: process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
  maxVoiceSpeakers: parseInt(process.env.MAX_VOICE_SPEAKERS, 10) || 4,
  // Scheduled backups (Phase 5): JSON export fallback + mongodump when the
  // Mongo tool is available. Rotation keeps only the `backupKeep` most recent.
  backupKeep: parseInt(process.env.BACKUP_KEEP, 10) || 20,
  backupIntervalMs: parseInt(process.env.BACKUP_INTERVAL_MS, 10) || 6 * 60 * 60 * 1000,
  backupDir: process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'),
  mongodumpPath: process.env.MONGODUMP_PATH || '',
  allowedMimeTypes: {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav'
  }
};

// Builds the ICE server list handed to every client via the `voice:config`
// event. Includes the self-hosted TURN relay when configured.
config.buildIceServers = function () {
  var servers = [];
  var stuns = String(config.stunUrls || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (stuns.length > 0) servers.push({ urls: stuns.length === 1 ? stuns[0] : stuns });
  if (config.turnUrl) {
    var turn = { urls: config.turnUrl };
    if (config.turnUser) { turn.username = config.turnUser; turn.credential = config.turnPass; }
    servers.push(turn);
  }
  return servers;
};

module.exports = config;
