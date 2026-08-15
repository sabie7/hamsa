const path = require('path');
const fs = require('fs');
const os = require('os');
const MemoryDb = require('../../../src/db/memory');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hi-master-test-'));
}

describe('MemoryCollection', function () {
  describe('CRUD', function () {
    let db;

    beforeEach(function () {
      db = MemoryDb(null, { persist: false });
    });

    it('create() deep-copies the caller payload, not the stored doc', function () {
      const col = db.collection('users');
      const payload = { topic: 'alice', rep: 1 };
      const doc = col.create(payload);
      // Mutating the caller's object must not affect the stored doc.
      payload.topic = 'mutated';
      expect(col.findOne({ topic: 'alice' })).not.toBeNull();
      expect(doc.topic).toBe('alice');
    });

    it('find() returns a copy, not the internal array', function () {
      const col = db.collection('users');
      col.create({ topic: 'alice' });
      const result = col.find({});
      result.push({ topic: 'bob' });
      expect(col.count()).toBe(1);
    });

    it('findOne() returns the first match or null', function () {
      const col = db.collection('users');
      col.create({ topic: 'a', id: 1 });
      col.create({ topic: 'b', id: 2 });
      expect(col.findOne({ topic: 'b' }).id).toBe(2);
      expect(col.findOne({ topic: 'zzz' })).toBeNull();
    });

    it('updateOne() applies $set semantics and returns boolean', function () {
      const col = db.collection('users');
      col.create({ topic: 'alice', rep: 1 });
      expect(col.updateOne({ topic: 'alice' }, { $set: { rep: 5 } })).toBe(true);
      expect(col.findOne({ topic: 'alice' }).rep).toBe(5);
      expect(col.updateOne({ topic: 'nobody' }, { $set: { rep: 1 } })).toBe(false);
    });

    it('deleteOne() removes a single matching doc', function () {
      const col = db.collection('users');
      col.create({ topic: 'a', id: 1 });
      col.create({ topic: 'b', id: 2 });
      expect(col.deleteOne({ topic: 'a' })).toBe(true);
      expect(col.count()).toBe(1);
      expect(col.deleteOne({ topic: 'a' })).toBe(false);
    });

    it('deleteMany() removes all matches and returns count', function () {
      const col = db.collection('users');
      col.create({ topic: 'a' });
      col.create({ topic: 'a' });
      col.create({ topic: 'b' });
      expect(col.deleteMany({ topic: 'a' })).toBe(2);
      expect(col.count()).toBe(1);
    });

    it('setAll() replaces the whole store; drop() empties it', function () {
      const col = db.collection('users');
      col.create({ topic: 'a' });
      col.setAll([{ topic: 'b' }, { topic: 'c' }]);
      expect(col.count()).toBe(2);
      col.drop();
      expect(col.count()).toBe(0);
    });

    it('getAll() returns the internal items snapshot', function () {
      const col = db.collection('users');
      col.create({ topic: 'a' });
      expect(col.getAll()).toHaveLength(1);
    });
  });

  describe('query operators', function () {
    let col;

    beforeEach(function () {
      col = MemoryDb(null, { persist: false }).collection('docs');
      col.create({ topic: 'abc', rep: 10, cat: 'x' });
      col.create({ topic: 'abd', rep: 20, cat: 'y' });
      col.create({ topic: 'zzz', rep: 30, cat: 'x' });
    });

    it('matches exact equality', function () {
      expect(col.find({ cat: 'x' })).toHaveLength(2);
      expect(col.find({ rep: 20 })).toHaveLength(1);
    });

    it('supports $regex', function () {
      expect(col.find({ topic: { $regex: '^ab' } })).toHaveLength(2);
    });

    it('supports $gt / $lt', function () {
      expect(col.find({ rep: { $gt: 15 } })).toHaveLength(2);
      expect(col.find({ rep: { $lt: 25 } })).toHaveLength(2);
    });

    it('supports $ne', function () {
      expect(col.find({ cat: { $ne: 'x' } })).toHaveLength(1);
    });

    it('supports $in', function () {
      expect(col.find({ cat: { $in: ['x', 'y'] } })).toHaveLength(3);
      expect(col.find({ cat: { $in: ['x'] } })).toHaveLength(2);
    });

    it('supports $or', function () {
      expect(col.find({ $or: [{ cat: 'y' }, { rep: 30 }] })).toHaveLength(2);
    });

    it('supports $and', function () {
      expect(col.find({ $and: [{ rep: { $gt: 5 } }, { cat: 'x' }] })).toHaveLength(2);
    });

    it('empty/absent query matches everything', function () {
      expect(col.find()).toHaveLength(3);
      expect(col.find({})).toHaveLength(3);
      expect(col.findOne()).not.toBeNull();
    });
  });

  describe('persistence & bootstrap', function () {
    it('does not write to disk when persist:false', function () {
      const dir = tempDir();
      const db = MemoryDb(dir, { persist: false });
      db.collection('users').create({ topic: 'alice' });
      expect(fs.existsSync(path.join(dir, 'users.json'))).toBe(false);
    });

    it('bootstraps read-only from a data dir', function () {
      const dir = tempDir();
      fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify([{ topic: 'seeded' }]));
      const db = MemoryDb(null, { bootstrapFromDir: dir });
      expect(db.collection('users').findOne({ topic: 'seeded' })).not.toBeNull();
    });

    it('persists to disk after the debounce window when persist enabled', function (done) {
      const dir = tempDir();
      const db = MemoryDb(dir, { persist: true, debounceMs: 20 });
      db.collection('users').create({ topic: 'alice' });
      setTimeout(function () {
        try {
          const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
          expect(onDisk).toHaveLength(1);
          done();
        } catch (e) {
          done(e);
        }
      }, 100);
    });
  });

  describe('MemoryDb facade', function () {
    it('collection() caches per-name instances', function () {
      const db = MemoryDb(null, { persist: false });
      expect(db.collection('users')).toBe(db.collection('users'));
      expect(db.hasCollection('users')).toBe(true);
      expect(db.hasCollection('nope')).toBe(false);
    });

    it('listCollections() and dropAll()', function () {
      const db = MemoryDb(null, { persist: false });
      db.collection('users').create({ topic: 'a' });
      db.collection('rooms').create({ id: 'r' });
      expect(db.listCollections()).toEqual(expect.arrayContaining(['users', 'rooms']));
      db.dropAll();
      expect(db.collection('users').count()).toBe(0);
    });
  });
});
