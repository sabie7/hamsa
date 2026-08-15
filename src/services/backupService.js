var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var logger = require('../logger');
var config = require('../config');

// ── Backup service (Phase 5) ──────────────────────────────────────────────
// Replaces the ad-hoc manual JSON export with a reusable service that:
//   1. Runs a full `mongodump` dump when the server is Mongo-backed AND the
//      tool is installed (dump stored under <backupDir>/dump-<ts>).
//   2. Otherwise falls back to the legacy JSON export of every collection.
//   3. Rotates old backups so only `config.backupKeep` recent ones survive.
//
// Rotation applies to `backup-*.json` files and `dump-*` directories alike.

function getBackupDir() {
  if (!fs.existsSync(config.backupDir)) fs.mkdirSync(config.backupDir, { recursive: true });
  return config.backupDir;
}

function keepCount() {
  var n = parseInt(config.backupKeep, 10);
  return (n && n > 0) ? n : 20;
}

// Remove the oldest JSON backups so at most `keep` remain. Returns count removed.
function rotateJson() {
  var files = fs.readdirSync(getBackupDir()).filter(function (f) { return /^backup-\d+\.json$/.test(f); }).sort();
  var keep = keepCount();
  var removed = 0;
  if (files.length > keep) {
    files.slice(0, files.length - keep).forEach(function (f) {
      try { fs.unlinkSync(path.join(getBackupDir(), f)); removed++; } catch (e) { logger.warn('backup.rotate', 'Unlink failed', { file: f, error: e.message }); }
    });
  }
  return removed;
}

// Remove the oldest mongodump directories so at most `keep` remain.
function rotateDumps() {
  var dirs = fs.readdirSync(getBackupDir()).filter(function (f) { return /^dump-\d+$/.test(f); }).sort();
  var keep = keepCount();
  var removed = 0;
  if (dirs.length > keep) {
    dirs.slice(0, dirs.length - keep).forEach(function (f) {
      try { fs.rmSync(path.join(getBackupDir(), f), { recursive: true, force: true }); removed++; } catch (e) { logger.warn('backup.rotate', 'Remove dir failed', { dir: f, error: e.message }); }
    });
  }
  return removed;
}

// Locate the mongodump executable (env override, well-known install paths).
function findMongodump() {
  if (config.mongodumpPath && fs.existsSync(config.mongodumpPath)) return config.mongodumpPath;
  var candidates = ['mongodump', '/usr/bin/mongodump', '/usr/local/bin/mongodump', 'C:\\Program Files\\MongoDB\\Server'];
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (c === 'C:\\Program Files\\MongoDB\\Server' && fs.existsSync(c)) {
      try {
        var versions = fs.readdirSync(c).sort().reverse();
        for (var v = 0; v < versions.length; v++) {
          var p = path.join(c, versions[v], 'bin', 'mongodump.exe');
          if (fs.existsSync(p)) return p;
        }
      } catch (e) { /* ignore */ }
      continue;
    }
    try {
      var r = childProcess.spawnSync(c, ['--version'], { stdio: 'ignore', timeout: 5000 });
      if (r && r.status === 0) return c;
    } catch (e) { /* not on PATH */ }
  }
  return null;
}

// Full MongoDB dump via mongodump. Returns null when unavailable/failed.
function mongoDump(mongoUri) {
  var dump = findMongodump();
  if (!dump) return null;
  var ts = Date.now();
  var dumpDir = path.join(getBackupDir(), 'dump-' + ts);
  var args = ['--out', dumpDir];
  if (mongoUri) args = ['--uri', mongoUri, '--out', dumpDir];
  var r = childProcess.spawnSync(dump, args, { stdio: 'ignore', timeout: 120000 });
  if (!r || r.status !== 0) {
    try { fs.rmSync(dumpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    return null;
  }
  var removed = rotateDumps();
  return { mode: 'mongo', dumpDir: 'dump-' + ts, rotated: removed };
}

// Legacy JSON export of every collection.
function jsonBackup(db) {
  var data = {
    users: db.users.getAll(), rooms: db.rooms.getAll(), settings: db.settings.getAll(),
    bands: db.bands.getAll(), bars: db.bars.getAll(), powers: db.powers.getAll(),
    messages: db.messages.getAll(), noletters: db.noletters.getAll(),
    subscriptions: db.subscriptions.getAll(),
  };
  var filename = 'backup-' + Date.now() + '.json';
  fs.writeFileSync(path.join(getBackupDir(), filename), JSON.stringify(data, null, 2));
  var removed = rotateJson();
  return { mode: 'json', filename: filename, rotated: removed };
}

// Preferred: mongodump when Mongo-backed + tool present; JSON otherwise.
function createBackup(db) {
  try {
    var isMongo = false;
    try { isMongo = require('../db').isMongo(); } catch (e) { /* db not ready */ }
    if (isMongo) {
      var res = mongoDump(config.mongoUri);
      if (res) { logger.info('backup.service', 'Mongo dump created', res); return res; }
      logger.warn('backup.service', 'mongodump unavailable or failed — falling back to JSON export');
    }
    var j = jsonBackup(db);
    logger.info('backup.service', 'JSON backup created', j);
    return j;
  } catch (e) {
    logger.error('backup.service', 'Backup failed', { error: e.message });
    return null;
  }
}

module.exports = {
  createBackup: createBackup,
  jsonBackup: jsonBackup,
  mongoDump: mongoDump,
  rotateJson: rotateJson,
  rotateDumps: rotateDumps,
  findMongodump: findMongodump,
  getBackupDir: getBackupDir,
};
