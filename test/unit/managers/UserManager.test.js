const UserManager = require('../../../src/managers/UserManager');

describe('UserManager', function () {
  let um;

  beforeEach(function () {
    um = new UserManager();
  });

  function makeUser(id, username, extra) {
    return Object.assign({ id: id, username: username, token: 'tok-' + id, lid: 'lid-' + id, roomid: 'efOiAhhNdL' }, extra || {});
  }

  describe('add / get / remove', function () {
    it('add() indexes a user by socket id and get() retrieves them', function () {
      const u = makeUser('s1', 'alice');
      um.add(u);
      expect(um.get('s1')).toBe(u);
      expect(um.get('missing')).toBeNull();
    });

    it('remove() deletes the user and their online entry', function () {
      const u = makeUser('s1', 'alice');
      um.add(u);
      um.addOnline({ id: 's1', topic: 'alice' });
      expect(um.remove('s1')).toBe(u);
      expect(um.get('s1')).toBeNull();
      expect(um.online).toHaveLength(0);
    });

    it('add() ignores entries without an id', function () {
      um.add({ username: 'ghost' });
      expect(Object.keys(um.users)).toHaveLength(0);
    });
  });

  describe('lookup helpers', function () {
    beforeEach(function () {
      um.add(makeUser('s1', 'alice'));
      um.add(makeUser('s2', 'bob'));
    });

    it('getByToken() finds the matching user', function () {
      expect(um.getByToken('tok-s2').username).toBe('bob');
      expect(um.getByToken('nope')).toBeNull();
    });

    it('findSocketId() maps a name to its socket id', function () {
      expect(um.findSocketId('alice')).toBe('s1');
      expect(um.findSocketId('zzz')).toBeNull();
    });

    it('findByUsername() is case-insensitive', function () {
      expect(um.findByUsername('ALICE').username).toBe('alice');
      expect(um.findByUsername('bob')).not.toBeNull();
      expect(um.findByUsername('missing')).toBeNull();
    });
  });

  describe('sessions & heartbeats', function () {
    it('recordSession() stores reconnect metadata', function () {
      um.recordSession({ uid: 'u1', id: 's1', username: 'alice', lid: 'l1' });
      expect(um.sessions.u1).toMatchObject({ socketId: 's1', username: 'alice', lid: 'l1' });
      expect(um.sessions.u1.time).toEqual(expect.any(Number));
    });

    it('touchHeartbeat() records a timestamp', function () {
      const u = makeUser('s1', 'alice');
      um.add(u);
      um.touchHeartbeat('s1');
      expect(u._lastHeartbeat).toEqual(expect.any(Number));
    });

    it('sweepHeartbeats() disconnects stale sockets only', function () {
      const stale = makeUser('s1', 'stale');
      stale._lastHeartbeat = Date.now() - um.HEARTBEAT_TIMEOUT - 1000;
      const fresh = makeUser('s2', 'fresh');
      fresh._lastHeartbeat = Date.now();
      const noStamp = makeUser('s3', 'noheartbeat');
      um.add(stale);
      um.add(fresh);
      um.add(noStamp);

      const disconnected = [];
      const io = {
        sockets: {
          sockets: {
            get: function (id) {
              return { disconnect: function () { disconnected.push(id); } };
            },
          },
        },
      };
      um.sweepHeartbeats(io);
      expect(disconnected).toEqual(['s1']);
    });
  });

  describe('online list', function () {
    it('addOnline() appends and returns the new entry', function () {
      const e = um.addOnline({ id: 's1' });
      expect(um.online).toHaveLength(1);
      expect(e).toBe(um.online[0]);
    });

    it('addOrUpdateOnline() dedupes by socket id or lid', function () {
      um.addOnline({ id: 's1', lid: 'l1', topic: 'a' });
      um.addOrUpdateOnline({ id: 's1', lid: 'l1', topic: 'a2' });
      expect(um.online).toHaveLength(1);
      expect(um.online[0].topic).toBe('a2');

      um.addOnline({ id: 's9', lid: 'l2', topic: 'b' });
      um.addOrUpdateOnline({ id: 's10', lid: 'l1', topic: 'c' });
      expect(um.online).toHaveLength(2);
    });

    it('removeOnlineBySocketId() only removes the matching id', function () {
      um.addOnline({ id: 's1', topic: 'a' });
      um.addOnline({ id: 's2', topic: 'b' });
      um.removeOnlineBySocketId('s1');
      expect(um.online).toHaveLength(1);
      expect(um.online[0].id).toBe('s2');
    });

    it('setOnlineRoom() updates the roomid on the online entry', function () {
      um.addOnline({ id: 's1', roomid: 'r0' });
      um.setOnlineRoom('s1', 'r1');
      expect(um.online[0].roomid).toBe('r1');
    });
  });

  describe('countInRoom', function () {
    it('counts users whose roomid matches', function () {
      um.add(makeUser('s1', 'a', { roomid: 'r1' }));
      um.add(makeUser('s2', 'b', { roomid: 'r1' }));
      um.add(makeUser('s3', 'c', { roomid: 'r2' }));
      expect(um.countInRoom('r1')).toBe(2);
      expect(um.countInRoom('r2')).toBe(1);
      expect(um.countInRoom('r3')).toBe(0);
    });
  });
});
