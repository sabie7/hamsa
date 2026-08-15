const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// MemoryCollection
// opts:
//   persist:        false => never load from / write to disk (pure in-memory).
//   bootstrapFromDir: read-only seed directory. If set, items are loaded from
//                   <dir>/<name>.json at construction (used to carry legacy
//                   JSON data into the temporary store before Mongo migration).
//   debounceMs:     persist debounce window (default 200).
function MemoryCollection(name, dataDir, opts) {
  opts = opts || {};
  const persist = opts.persist !== false && !!dataDir;
  let items = [];
  let dirty = false;
  let saveTimer = null;
  const filePath = path.join(dataDir || '', name + '.json');

  function persistNow() {
    dirty = true;
    if (!persist) return;
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (!dirty) return;
      try {
        fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
        dirty = false;
      } catch (e) { logger.error('memory.persist', 'Write failed', { name: name, error: e.message }); }
    }, opts.debounceMs || 200);
  }

  function load() {
    if (opts.bootstrapFromDir) {
      try {
        const p = path.join(opts.bootstrapFromDir, name + '.json');
        if (fs.existsSync(p)) {
          const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(arr)) items = arr;
        }
      } catch (e) { logger.warn('memory.bootstrap', 'Bootstrap failed', { name: name, error: e.message }); }
      return;
    }
    if (!persist) return;
    try {
      if (fs.existsSync(filePath)) {
        items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(items)) items = [];
      }
    } catch (e) { logger.warn('memory.load', 'Load failed', { name: name, error: e.message }); items = []; }
  }

  function match(item, query) {
    if (!query || Object.keys(query).length === 0) return true;
    for (const key in query) {
      if (key === '$or') {
        let orMatch = false;
        for (let i = 0; i < query.$or.length; i++) {
          if (match(item, query.$or[i])) { orMatch = true; break; }
        }
        if (!orMatch) return false;
        continue;
      }
      if (key === '$and') {
        for (let i = 0; i < query.$and.length; i++) {
          if (!match(item, query.$and[i])) return false;
        }
        continue;
      }
      const val = query[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (val.$regex && !new RegExp(val.$regex, val.$options || '').test(String(item[key]))) return false;
        if (val.$gt !== undefined && !(item[key] > val.$gt)) return false;
        if (val.$lt !== undefined && !(item[key] < val.$lt)) return false;
        if (val.$ne !== undefined && item[key] === val.$ne) return false;
        if (val.$in && !val.$in.includes(item[key])) return false;
      } else if (item[key] !== val) {
        return false;
      }
    }
    return true;
  }

  load();

  return {
    find: function (query) {
      if (!query) return items.slice();
      return items.filter(function (item) { return match(item, query); });
    },
    findOne: function (query) {
      if (!query) return items.length > 0 ? items[0] : null;
      for (let i = 0; i < items.length; i++) { if (match(items[i], query)) return items[i]; }
      return null;
    },
    create: function (data) {
      const doc = JSON.parse(JSON.stringify(data));
      items.push(doc);
      persistNow();
      return doc;
    },
    updateOne: function (query, update) {
      for (let i = 0; i < items.length; i++) {
        if (match(items[i], query)) {
          const $set = update.$set || update;
          for (const key in $set) items[i][key] = $set[key];
          persistNow();
          return true;
        }
      }
      return false;
    },
    deleteOne: function (query) {
      for (let i = 0; i < items.length; i++) {
        if (match(items[i], query)) {
          items.splice(i, 1);
          persistNow();
          return true;
        }
      }
      return false;
    },
    deleteMany: function (query) {
      let count = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        if (match(items[i], query)) { items.splice(i, 1); count++; }
      }
      if (count > 0) persistNow();
      return count;
    },
    count: function (query) { return this.find(query).length; },
    getAll: function () { return items.slice(); },
    setAll: function (arr) { items = Array.isArray(arr) ? arr.slice() : []; persistNow(); },
    drop: function () { items = []; persistNow(); },
  };
}

function MemoryDb(dataDir, opts) {
  const collections = {};
  opts = opts || {};
  return {
    collection: function (name) {
      if (!collections[name]) collections[name] = MemoryCollection(name, dataDir, opts);
      return collections[name];
    },
    hasCollection: function (name) { return !!collections[name]; },
    listCollections: function () { return Object.keys(collections); },
    dropAll: function () { Object.keys(collections).forEach(function (k) { collections[k].drop(); }); },
  };
}

module.exports = MemoryDb;
