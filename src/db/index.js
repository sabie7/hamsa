const path = require('path');
const logger = require('../logger');
const config = require('../config');
const repository = require('./repository');
const schemas = require('./schemas');

const fs = require('fs');
const DATA_DIR = path.join(config.rootDir, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let mongoose = null;
let mongoMode = false;
let collections = null;

const defaultPowers = [
  { rank: 999, name: "admin", ico: "", kick: 1, delbc: 1, alert: 1, mynick: 1, unick: 1, ban: 1, publicmsg: 1, forcepm: 1, roomowner: 1, createroom: 1, rooms: 1, edituser: 1, setpower: 1, upgrades: 1, history: 1, cp: 1, stealth: 1, owner: 1, meiut: 1, loveu: 1, ulike: 1, flter: 1, subs: 1, shrt: 1, msgs: 1, bootedit: 1, grupes: 1, delmsg: 1, delpic: 1 },
  { rank: 100, name: "vip", ico: "", kick: 0, delbc: 0, alert: 0, mynick: 0, unick: 0, ban: 0, publicmsg: 0, forcepm: 0, roomowner: 0, createroom: 1, rooms: 0, edituser: 0, setpower: 0, upgrades: 0, history: 0, cp: 0, stealth: 0, owner: 0, meiut: 0, loveu: 0, ulike: 0, flter: 0, subs: 0, shrt: 0, msgs: 0, bootedit: 0, grupes: 0, delmsg: 0, delpic: 0 },
  { rank: 0, name: "user", ico: "", kick: 0, delbc: 0, alert: 0, mynick: 0, unick: 0, ban: 0, publicmsg: 0, forcepm: 0, roomowner: 0, createroom: 0, rooms: 0, edituser: 0, setpower: 0, upgrades: 0, history: 0, cp: 0, stealth: 0, owner: 0, meiut: 0, loveu: 0, ulike: 0, flter: 0, subs: 0, shrt: 0, msgs: 0, bootedit: 0, grupes: 0, delmsg: 0, delpic: 0 },
];

const defaultSettings = {
  siteweb: { allowg: true, allowreg: true, name: "TigerHost Chat", title: "TigerHost Chat", background: "#40404f", bg: "#40404f", buttons: "#f93634", msgst: "5", walllikes: { lengthUserReg: 50, lengthUserG: 50 } },
  dro3: [], emo: [], sico: [],
};

let ADMIN_SEEDED = null;

function seedDefaults() {
  if (!collections) return;
  if (collections.powers.count() === 0) {
    collections.powers.create({ powers: defaultPowers });
    logger.info('db.seed', 'Seeded', { collection: 'powers', count: 1 });
  }
  if (collections.settings.count() === 0) {
    collections.settings.create(defaultSettings);
    logger.info('db.seed', 'Seeded', { collection: 'settings', count: 1 });
  }
  seedAdmin(collections.users);
}

function seedAdmin(col) {
  try {
    const helpers = require('../utils/helpers');
    const bcrypt = require('bcryptjs');
    // If ADMIN_PASS is unset, generate a strong random one so a public default
    // can never be used. An explicitly-configured ADMIN_PASS (e.g. via .env) is
    // honored even if it happens to be "admin123".
    let adminPass = config.adminPass;
    if (!adminPass || adminPass === 'require-ADMIN_PASS') {
      adminPass = require('crypto').randomBytes(16).toString('base64url');
      console.log('[WARN] ADMIN_PASS not set — generated a random admin password for this boot only: ' + adminPass);
      logger.warn('db.seed', 'ADMIN_PASS unset; generated temporary random password', { adminPass });
    }
    const existing = col.findOne({ topic: config.adminUser }) || col.findOne({ topic: { $regex: '^' + config.adminUser + '$', $options: 'i' } });
    if (existing) {
      if (existing.password && (existing.password.slice(0, 4) === '$2a$' || existing.password.slice(0, 4) === '$2b$')) {
        if (!bcrypt.compareSync(adminPass, existing.password)) {
          existing.password = bcrypt.hashSync(adminPass, 10);
          col.updateOne({ topic: existing.topic }, { $set: { password: existing.password } });
        }
      } else {
        existing.password = bcrypt.hashSync(adminPass, 10);
        col.updateOne({ topic: existing.topic }, { $set: { password: existing.password } });
      }
      ADMIN_SEEDED = { username: existing.topic || config.adminUser, password: adminPass, existed: true };
      return;
    }
    const hash = bcrypt.hashSync(adminPass, 10);
    const allUsers = col.find({});
    const adminDoc = {
      topic: config.adminUser,
      topic1: config.adminUser,
      username: config.adminUser,
      password: hash,
      id: helpers.stringGen(15),
      lid: helpers.stringGen(31),
      idreg: '#' + (allUsers.length + 1),
      token: helpers.stringGen(177),
      fp: '', ip: '',
      co: 'om', code: 'om',
      pic: 'pic.png',
      ucol: '#000000', mcol: '#000000', bg: '#ffffff', fontColor: '#000000',
      rep: 0, msg: '', power: 'admin', evaluation: 999, stat: 1,
      loginG: false, documentationc: 1,
      verified: true,
      isAdmin: true,
      created: new Date().toISOString(),
    };
    col.create(adminDoc);
    ADMIN_SEEDED = { username: config.adminUser, password: config.adminPass, existed: false };
    logger.info('db.seed', 'Root admin account created', { username: config.adminUser });
  } catch (e) {
    logger.error('db.seedAdmin', 'Failed to seed admin', { error: e.message });
  }
}

function getAdminCredentials() {
  return ADMIN_SEEDED ? { username: ADMIN_SEEDED.username, password: ADMIN_SEEDED.password, existed: ADMIN_SEEDED.existed } : null;
}

function normalizePowers() {
  if (!collections) return;
  const pwDocs = collections.powers.getAll();
  if (pwDocs.length > 0 && !pwDocs.some(function (d) { return Array.isArray(d.powers); })) {
    collections.powers.setAll([{ powers: pwDocs }]);
    logger.info('db.migrate', 'Powers normalized to { powers: [] } shape', { count: pwDocs.length });
  }
}

// Build the Mongo-backed repository from the schema models and load all data
// from Mongo (source of truth) into the caches.
function buildMongo() {
  if (!mongoose) return false;
  Object.keys(schemas).forEach(function (key) {
    const Schema = schemas[key];
    if (!mongoose.models[key]) mongoose.model(key, Schema);
  });
  try {
    const cols = repository.buildMongoRepository(mongoose, DATA_DIR);
    return Object.keys(cols).length > 0 ? cols : null;
  } catch (e) {
    logger.error('db.buildMongo', 'Failed to build mongo repository', { error: e.message });
    return null;
  }
}

function getDb() {
  if (!collections) {
    collections = repository.buildMemoryRepository(DATA_DIR);
    mongoMode = false;
    seedDefaults();
    normalizePowers();
  }
  return collections;
}

async function loadFromMongo() {
  if (!mongoMode || !collections) return;
  const keys = Object.keys(collections);
  for (let i = 0; i < keys.length; i++) {
    const col = collections[keys[i]];
    if (col && typeof col.load === 'function') {
      const docs = await col.load();
      logger.info('db.load', 'Loaded from MongoDB', { collection: keys[i], count: docs.length });
    }
  }
}

async function connect() {
  if (config.mongoUri) {
    try {
      mongoose = require('mongoose');
      mongoose.set('strictQuery', false);
      mongoose.connection.on('disconnected', function () {
        logger.warn('db.mongo', 'Disconnected');
        mongoMode = false;
      });
      mongoose.connection.on('reconnected', function () {
        logger.info('db.mongo', 'Reconnected');
        mongoMode = true;
      });
      mongoose.connection.on('error', function (err) {
        logger.error('db.mongo', 'Connection error', { error: err.message });
      });
      await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        w: 'majority',
      });
      mongoMode = true;
      logger.info('db.connect', 'MongoDB connected');
      collections = buildMongo();
      if (!collections) { mongoose = null; mongoMode = false; }
      else {
        await loadFromMongo();
        seedDefaults();
        normalizePowers();
        return;
      }
    } catch (e) {
      logger.warn('db.connect', 'MongoDB failed, falling back to in-memory', { error: e.message });
      try { if (mongoose) await mongoose.disconnect(); } catch { /* already disconnected */ }
      mongoose = null;
    }
  }
  mongoMode = false;
  logger.info('db.connect', 'Using in-memory database');
  collections = repository.buildMemoryRepository(DATA_DIR);
  seedDefaults();
  normalizePowers();
}

async function reconnect() {
  if (!config.mongoUri || mongoMode) return;
  try {
    if (!mongoose) mongoose = require('mongoose');
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    mongoMode = true;
    logger.info('db.reconnect', 'MongoDB reconnected');
    collections = buildMongo();
    if (collections) {
      await loadFromMongo();
      seedDefaults();
      normalizePowers();
    }
  } catch (e) {
    logger.warn('db.reconnect', 'MongoDB still unavailable', { error: e.message });
  }
}

function isMongo() { return mongoMode; }

// Real health check: verifies the actual Mongo connection (not a hardcoded
// status). Returns a promise of { mongo, connected, mode, latencyMs }.
async function healthCheck() {
  const result = {
    mongo: mongoMode,
    mode: mongoMode ? 'mongo' : 'memory',
    connected: mongoMode,
    latencyMs: 0,
  };
  if (!mongoMode || !mongoose) {
    result.detail = 'Running on the in-memory storage layer (no Mongo)';
    return result;
  }
  try {
    const started = Date.now();
    if (mongoose.connection.readyState !== 1) {
      result.connected = false;
      result.detail = 'Mongo connection not ready (state=' + mongoose.connection.readyState + ')';
      return result;
    }
    // Real round-trip to the database, not just readyState.
    await mongoose.connection.db.admin().command({ ping: 1 });
    result.latencyMs = Date.now() - started;
    result.connected = true;
  } catch (e) {
    result.connected = false;
    result.latencyMs = -1;
    result.error = e && e.message;
  }
  return result;
}

// Graceful teardown (Phase 8): close the Mongo connection so the process can
// exit cleanly on SIGTERM/SIGINT without dropping buffered writes.
async function close() {
  if (mongoose) {
    try { await mongoose.disconnect(); } catch (e) {
      logger.warn('db.close', 'Mongoose disconnect failed', { error: e.message });
    }
    mongoose = null;
  }
  mongoMode = false;
  collections = null;
  logger.info('db.close', 'Database closed');
}

module.exports = { getDb, connect, reconnect, isMongo, getAdminCredentials, healthCheck, close };
