const path = require('path');
const fs = require('fs');
const os = require('os');
const repository = require('../../../src/db/repository');

describe('repository (unified storage layer)', function () {
  describe('COLLECTION_MODEL', function () {
    it('exposes the full entity map', function () {
      const keys = Object.keys(repository.COLLECTION_MODEL);
      ['users', 'rooms', 'messages', 'bands', 'powers', 'bans', 'subscriptions', 'settings', 'logs', 'states', 'noletters', 'names', 'zakrfa', 'bars', 'historyNoletter', 'auditlog'].forEach(function (k) {
        expect(keys).toContain(k);
      });
    });
  });

  describe('buildMemoryRepository', function () {
    let db;

    beforeEach(function () {
      db = repository.buildMemoryRepository(null);
    });

    it('returns every collection from the model map', function () {
      Object.keys(repository.COLLECTION_MODEL).forEach(function (name) {
        expect(typeof db[name].find).toBe('function');
        expect(typeof db[name].findOne).toBe('function');
        expect(typeof db[name].create).toBe('function');
        expect(typeof db[name].updateOne).toBe('function');
        expect(typeof db[name].deleteOne).toBe('function');
        expect(typeof db[name].deleteMany).toBe('function');
        expect(typeof db[name].count).toBe('function');
        expect(typeof db[name].getAll).toBe('function');
        expect(typeof db[name].setAll).toBe('function');
        expect(typeof db[name].drop).toBe('function');
      });
    });

    it('supports the full sync CRUD lifecycle', function () {
      db.users.create({ topic: 'alice', rep: 1 });
      db.users.create({ topic: 'bob', rep: 2 });
      expect(db.users.count()).toBe(2);
      expect(db.users.findOne({ topic: 'alice' }).rep).toBe(1);
      db.users.updateOne({ topic: 'bob' }, { $set: { rep: 5 } });
      expect(db.users.findOne({ topic: 'bob' }).rep).toBe(5);
      db.users.deleteOne({ topic: 'alice' });
      expect(db.users.count()).toBe(1);
      expect(db.users.deleteMany({})).toBe(1);
      expect(db.users.count()).toBe(0);
    });

    it('each collection is isolated', function () {
      db.users.create({ topic: 'alice' });
      db.rooms.create({ id: 'r1' });
      expect(db.rooms.count()).toBe(1);
      expect(db.users.count()).toBe(1);
    });

    it('does not persist to disk (no duplicated storage)', function () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-repo-'));
      const db2 = repository.buildMemoryRepository(dir);
      db2.users.create({ topic: 'alice' });
      expect(fs.readdirSync(dir).length).toBe(0);
    });
  });
});
