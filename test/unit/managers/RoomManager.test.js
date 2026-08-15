const repository = require('../../../src/db/repository');
const RoomManager = require('../../../src/managers/RoomManager');

describe('RoomManager', function () {
  let db;
  let rm;

  beforeEach(function () {
    db = repository.buildMemoryRepository(null);
    rm = new RoomManager(db);
  });

  describe('seedDefault', function () {
    it('creates the default room when the store is empty', function () {
      rm.seedDefault();
      expect(rm.rooms).toHaveLength(1);
      expect(rm.rooms[0].id).toBe('efOiAhhNdL');
      expect(rm.rooms[0].name).toBeTruthy();
    });

    it('does not duplicate the default room on repeat calls', function () {
      rm.seedDefault();
      rm.seedDefault();
      expect(rm.rooms).toHaveLength(1);
    });
  });

  describe('get', function () {
    it('returns the room by id or null', function () {
      rm.seedDefault();
      expect(rm.get('efOiAhhNdL').id).toBe('efOiAhhNdL');
      expect(rm.get('nope')).toBeNull();
    });
  });

  describe('create', function () {
    it('persists a new room with generated id and escaped name', function () {
      const room = rm.create('<script>alert(1)</script>', 'secret', 'alice');
      expect(room.id).toHaveLength(12);
      expect(room.name).not.toContain('<');
      expect(room.password).toBe('secret');
      expect(room.owner).toBe('alice');
      expect(db.rooms.findOne({ id: room.id })).not.toBeNull();
      expect(rm.rooms.some(function (r) { return r.id === room.id; })).toBe(true);
    });

    it('truncates long names to 30 chars', function () {
      const room = rm.create('x'.repeat(100), '', 'alice');
      expect(room.name).toHaveLength(30);
    });
  });

  describe('delete', function () {
    it('removes the room from db and reloads', function () {
      const room = rm.create('Room', '', 'alice');
      expect(rm.get(room.id)).not.toBeNull();
      rm.delete(room.id);
      expect(rm.get(room.id)).toBeNull();
      expect(db.rooms.count()).toBe(0);
    });
  });

  describe('stats / updateOnlineCounts', function () {
    it('stats() reports per-room online counts from users map', function () {
      rm.seedDefault();
      const room = rm.create('Custom', '', 'alice');
      const users = {
        s1: { roomid: 'efOiAhhNdL' },
        s2: { roomid: 'efOiAhhNdL' },
        s3: { roomid: room.id },
      };
      const stats = rm.stats(users);
      const byId = {};
      stats.forEach(function (s) { byId[s.id] = s; });
      expect(byId['efOiAhhNdL'].online).toBe(2);
      expect(byId[room.id].online).toBe(1);
    });

    it('stats() attributes users without a room to the default room', function () {
      rm.seedDefault();
      const stats = rm.stats({ s1: {}, s2: { roomid: 'efOiAhhNdL' } });
      expect(stats[0].online).toBe(2);
    });

    it('updateOnlineCounts() writes counts onto the room objects', function () {
      rm.seedDefault();
      const users = { s1: { roomid: 'efOiAhhNdL' } };
      rm.updateOnlineCounts(users);
      expect(rm.get('efOiAhhNdL').online).toBe(1);
    });
  });
});
