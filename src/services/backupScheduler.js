var logger = require('../logger');
var config = require('../config');
var backup = require('./backupService');

// ── Scheduled backup (Phase 5) ────────────────────────────────────────────
// Internal cron: every `BACKUP_INTERVAL_MS` (default 6h) a full backup is
// produced via the backupService (mongodump when Mongo-backed, JSON otherwise)
// and old backups are rotated to `BACKUP_KEEP`.
var started = false;

function start(db) {
  if (started) return;
  started = true;
  var interval = config.backupIntervalMs || 6 * 60 * 60 * 1000;
  var bootDelay = parseInt(process.env.BACKUP_BOOT_DELAY_MS, 10);
  var run = function () {
    logger.info('backup.scheduler', 'Scheduled backup starting');
    backup.createBackup(db);
  };
  if (bootDelay && bootDelay > 0) setTimeout(run, bootDelay);
  setInterval(run, interval);
  logger.info('backup.scheduler', 'Scheduled every ' + interval + 'ms, keeping ' + config.backupKeep);
}

module.exports = { start: start };
