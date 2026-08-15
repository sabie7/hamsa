#!/usr/bin/env node
// Migrate data/*.json (and legacy *_list.json exports) into MongoDB.
//
// Usage:
//   node scripts/migrate-json-to-mongo.js            # migrate + archive data/
//   node scripts/migrate-json-to-mongo.js --dry-run  # only report what WOULD happen
//   node scripts/migrate-json-to-mongo.js --no-archive
//
// Behavior:
//   - Connects to MongoDB using config.mongoUri (required).
//   - For every entity in src/db/repository.js COLLECTION_MODEL, reads the
//     plain data/<name>.json (the active store used by the app) and upserts
//     each document into the matching Mongo collection, deduped by a natural
//     key (e.g. user.id, room.id, band.device_band|ip_band).
//   - Also scans data/<name>_list.json legacy exports. Documents there that
//     duplicate an already-migrated plain doc are skipped (logged). If the
//     plain file is missing/empty, the legacy list file is used as fallback.
//   - Renames data/ -> data/_legacy-backup/ on success (unless --no-archive).

var path = require('path');
var fs = require('fs');
var config = require('../src/config');
var logger = require('../src/logger');
var schemas = require('../src/db/schemas');
var repository = require('../src/db/repository');

var DATA_DIR = path.join(config.rootDir, 'data');
var ARCHIVE_DIR = path.join(config.rootDir, 'data', '_legacy-backup');
var DRY_RUN = process.argv.indexOf('--dry-run') !== -1;
var ARCHIVE = process.argv.indexOf('--no-archive') === -1;

var REPORT = [];

function readJson(file) {
  try {
    if (fs.existsSync(file)) {
      var raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      return Array.isArray(raw) ? raw : [];
    }
  } catch (e) {
    logger.warn('migrate.read', 'Failed to parse', { file: file, error: e.message });
  }
  return null;
}

// Natural key used to detect duplicates for each collection.
function naturalKey(collection, doc) {
  switch (collection) {
    case 'users': return 'id:' + (doc.id || '');
    case 'rooms': return 'id:' + (doc.id || '');
    case 'bands':
    case 'bars': return (doc.device_band ? 'fp:' + doc.device_band : 'ip:' + (doc.ip_band || ''));
    case 'messages': return 'k:' + (doc.category || '') + ':' + (doc.adresse || '') + ':' + (doc.msg || '');
    case 'powers': return 'powers';
    case 'settings': return 'settings';
    case 'subscriptions': return (doc.iduser || '') + ':' + (doc.topic || '') + ':' + (doc.sub || '');
    case 'noletters': return 'v:' + (doc.v || '') + ':' + (doc.type || '');
    case 'logs':
    case 'states': return 'i:' + (doc._id ? String(doc._id) : JSON.stringify(doc).slice(0, 120));
    case 'names': return 't:' + (doc.topic || '') + ':' + (doc.ip || '') + ':' + (doc.fp || '');
    default: return 'json:' + JSON.stringify(doc).slice(0, 200);
  }
}

function stripId(doc) {
  var clone = JSON.parse(JSON.stringify(doc));
  delete clone._id;
  delete clone.__v;
  return clone;
}

async function migrateCollection(model, name, plainDocs, legacyDocs, existing) {
  var stats = { collection: name, migrated: 0, skippedDuplicate: 0, skippedEmpty: 0, legacyUsed: 0 };
  var source = plainDocs && plainDocs.length > 0 ? plainDocs : (legacyDocs || []);
  if (legacyDocs && (!plainDocs || plainDocs.length === 0) && legacyDocs.length > 0) stats.legacyUsed = legacyDocs.length;
  if (!source || source.length === 0) { stats.skippedEmpty = 1; REPORT.push(stats); return; }

  var seen = new Set((existing || []).map(function (d) {
    return naturalKey(name, d);
  }).filter(Boolean));

  for (var i = 0; i < source.length; i++) {
    var doc = stripId(source[i]);
    var key = naturalKey(name, doc);
    if (seen.has(key)) { stats.skippedDuplicate++; continue; }
    if (DRY_RUN) { stats.migrated++; continue; }
    try {
      await model.create(doc);
      seen.add(key);
      stats.migrated++;
    } catch (e) {
      logger.error('migrate.doc', 'Insert failed', { collection: name, error: e.message });
    }
  }
  REPORT.push(stats);
}

async function main() {
  if (!config.mongoUri) {
    console.error('[migrate] MONGO_URI not set. Cannot run migration.');
    process.exit(1);
  }
  if (DRY_RUN) logger.info('migrate', 'DRY RUN — no documents will be written');

  var mongoose = null;
  if (!DRY_RUN) {
    logger.info('migrate', 'Connecting to MongoDB');
    mongoose = require('mongoose');
    mongoose.set('strictQuery', false);
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000, retryWrites: true, w: 'majority' });

    Object.keys(schemas).forEach(function (key) {
      if (!mongoose.models[key]) mongoose.model(key, schemas[key]);
    });
  }

  for (var name in repository.COLLECTION_MODEL) {
    var modelName = repository.COLLECTION_MODEL[name];
    var plain = readJson(path.join(DATA_DIR, name + '.json'));
    var legacy = readJson(path.join(DATA_DIR, name + '_list.json'));
    logger.info('migrate.collection', 'Processing', {
      collection: name,
      plain: plain ? plain.length : 0,
      legacyList: legacy ? legacy.length : 0,
    });
    var existing = [];
    if (!DRY_RUN && mongoose) {
      var Model = mongoose.model(modelName);
      existing = await Model.find({}).lean().exec();
    }
    await migrateCollection(mongoose ? mongoose.model(modelName) : null, name, plain, legacy, existing);
  }

  // Summary
  console.log('\n==== MIGRATION REPORT ====');
  var totalMigrated = 0, totalSkipped = 0;
  REPORT.forEach(function (s) {
    console.log('  ' + s.collection.padEnd(16) +
      ' migrated=' + s.migrated +
      ' skipDup=' + s.skippedDuplicate +
      (s.skippedEmpty ? ' EMPTY' : '') +
      (s.legacyUsed ? ' legacy=' + s.legacyUsed : ''));
    totalMigrated += s.migrated;
    totalSkipped += s.skippedDuplicate;
  });
  console.log('  TOTAL migrated=' + totalMigrated + ' skippedDuplicate=' + totalSkipped);

  if (DRY_RUN) { process.exit(0); }

  // Archive data/ -> data/_legacy-backup/
  if (ARCHIVE) {
    if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    var files = fs.readdirSync(DATA_DIR).filter(function (f) { return f !== '_legacy-backup' && f !== 'LEGACY_README.md'; });
    files.forEach(function (f) {
      var src = path.join(DATA_DIR, f);
      var dst = path.join(ARCHIVE_DIR, f);
      fs.renameSync(src, dst);
      logger.info('migrate.archive', 'Archived', { file: f });
    });
    fs.writeFileSync(path.join(ARCHIVE_DIR, 'LEGACY_README.md'),
      '# Legacy JSON storage\n\nThis folder is the archived data/ directory after migration to MongoDB.\n' +
      'It is kept for reference only; the app no longer reads or writes it.\n');
    logger.info('migrate.archive', 'data/ archived to data/_legacy-backup/');
  }

  if (mongoose) await mongoose.disconnect();
  logger.info('migrate', 'Done');
  process.exit(0);
}

main().catch(function (e) {
  logger.error('migrate', 'Migration failed', { error: e.message, stack: e.stack });
  process.exit(1);
});
