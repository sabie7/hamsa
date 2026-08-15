const logger = require('../logger');
const MemoryDb = require('./memory');

// ── Repository / DAO layer ────────────────────────────────────────────────
// Two backends expose the SAME synchronous collection interface used by the
// rest of the app (find/findOne/create/updateOne/deleteOne/deleteMany/count/
// getAll/setAll/drop):
//
//   MongoRepository   — production. MongoDB is the durable source of truth.
//                       Documents are loaded from Mongo into an in-memory
//                       cache at connect; every mutation updates the cache
//                       synchronously and persists to Mongo with TARGETED
//                       writes (insertOne/updateOne/deleteOne), not the old
//                       full deleteMany+insertMany rewrite.
//   MemoryRepository  — dev without Mongo. Pure in-memory (temporary). It can
//                       bootstrap read-only from data/*.json so legacy data is
//                       carried into the ephemeral store, but it NEVER writes
//                       JSON files (no duplicated storage).
//
// Entity -> Mongoose schema map (see ./schemas).
const COLLECTION_MODEL = {
  users: 'User',
  rooms: 'Room',
  messages: 'Message',
  bands: 'Band',
  powers: 'Power',
  bans: 'Ban',
  subscriptions: 'Subscription',
  settings: 'Setting',
  logs: 'Log',
  states: 'State',
  noletters: 'NoLetter',
  names: 'Name',
  zakrfa: 'Zakrfa',
  bars: 'Bars',
  historyNoletter: 'HistoryNoLetter',
  auditlog: 'AuditLog',
};

function logPersistError(op, name) {
  return function (err) {
    if (err) logger.error('repository.write', op + ' failed', { collection: name, error: err.message });
  };
}

// Mongo-backed collection: sync reads/writes over a cache + async targeted Mongo writes.
function createMongoCollection(name, model, cache) {
  function persistUpdate(query, $set) {
    model.updateOne(query, { $set: $set }).exec().catch(logPersistError('updateOne', name));
  }
  return {
    _name: name,
    find: function (q) { return cache.find(q); },
    findOne: function (q) { return cache.findOne(q); },
    create: function (d) {
      const doc = cache.create(d);
      const plain = JSON.parse(JSON.stringify(doc));
      model.create(plain).catch(logPersistError('create', name));
      return doc;
    },
    updateOne: function (q, u) {
      const ok = cache.updateOne(q, u);
      if (ok) persistUpdate(q, u.$set || u);
      return ok;
    },
    deleteOne: function (q) {
      const ok = cache.deleteOne(q);
      if (ok) model.deleteOne(q).exec().catch(logPersistError('deleteOne', name));
      return ok;
    },
    deleteMany: function (q) {
      const n = cache.deleteMany(q);
      if (n > 0) model.deleteMany(q).exec().catch(logPersistError('deleteMany', name));
      return n;
    },
    count: function (q) { return cache.count(q); },
    getAll: function () { return cache.getAll(); },
    setAll: function (a) {
      cache.setAll(a);
      const plain = JSON.parse(JSON.stringify(Array.isArray(a) ? a : []));
      model.deleteMany({}).exec()
        .then(function () { if (plain.length > 0) return model.insertMany(plain); })
        .catch(logPersistError('setAll', name));
    },
    drop: function () {
      cache.drop();
      model.deleteMany({}).exec().catch(logPersistError('drop', name));
    },
    // Load the whole collection from Mongo into the cache (source of truth).
    load: function () {
      return model.find({}).lean().exec().then(function (docs) {
        cache.setAll(docs || []);
        return docs || [];
      }).catch(function (err) {
        logger.error('repository.load', 'Failed to load collection', { collection: name, error: err.message });
        return [];
      });
    },
  };
}

// Build Mongo-backed collections for every entity, reusing an in-memory cache
// per collection so the sync interface stays consistent.
function buildMongoRepository(mongoose, dataDir) {
  const memDb = MemoryDb(dataDir, { persist: false });
  const collections = {};
  Object.keys(COLLECTION_MODEL).forEach(function (name) {
    const model = mongoose.model(COLLECTION_MODEL[name]);
    if (!model) {
      logger.warn('repository.build', 'Model missing, skipping', { collection: name });
      return;
    }
    collections[name] = createMongoCollection(name, model, memDb.collection(name));
  });
  return collections;
}

// Pure in-memory repository (dev fallback). Optionally bootstraps read-only
// from <bootstrapDir>/<name>.json. Never persists to disk.
function buildMemoryRepository(bootstrapDir) {
  const memDb = MemoryDb(null, {
    persist: false,
    bootstrapFromDir: bootstrapDir || null,
  });
  const collections = {};
  Object.keys(COLLECTION_MODEL).forEach(function (name) {
    collections[name] = memDb.collection(name);
  });
  return collections;
}

module.exports = {
  COLLECTION_MODEL: COLLECTION_MODEL,
  buildMongoRepository: buildMongoRepository,
  buildMemoryRepository: buildMemoryRepository,
};
