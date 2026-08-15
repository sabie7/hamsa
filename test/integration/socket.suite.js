const { startSocketServer, connect, waitEvent, seedBaseDb, seedAuthDb } = require('../helpers/socketServer');

// Shared integration suite exercised against both the in-memory repository and
// the real mongodb-memory-server backend. Covers the four core Socket.io flows
// required by PROMPT 7: auth, join-room, send message, disconnect cleanup.
function runSocketIntegrationSuite(describeLabel, makeDb) {
  describe(describeLabel, function () {
    let db;
    let server;

    beforeEach(async function () {
      db = await makeDb();
      seedBaseDb(db);
      server = await startSocketServer(db);
    });

    afterEach(async function () {
      if (server) await server.close();
      if (db && typeof db.cleanup === 'function') await db.cleanup();
      server = null;
      db = null;
    });

    // ── AUTH ────────────────────────────────────────────────────────────────
    describe('auth', function () {
      it('guest login succeeds and joins the default room', async function () {
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        const joinedP = waitEvent(client, 'user-joined');
        client.emit('guest', { name: 'guest_alice', ip: '10.0.0.1', fp: 'Chrome Windows', code: 'us' });
        const login = await loginP;
        expect(login.user.name).toBe('guest_alice');
        expect(login.token).toBe('');
        expect(login.adminPower).toBe(0);

        const joined = await joinedP;
        expect(joined.topic).toBe('guest_alice');
        client.close();
      });

      it('guest login is rejected for a reserved (registered) username', async function () {
        seedAuthDb(db, { username: 'admin', password: 'admin123' });
        const client = await connect(server.url);
        const errP = waitEvent(client, 'error-msg');
        let loginCount = 0;
        client.on('login', function () { loginCount++; });
        client.emit('guest', { name: 'admin', ip: '10.0.0.2', fp: 'Chrome Windows' });
        const err = await errP;
        expect(err.msg).toBeTruthy();
        expect(loginCount).toBe(0);
        client.close();
      });

      it('register creates an account, then login authenticates it', async function () {
        seedAuthDb(db);
        const client = await connect(server.url);

        const regP = waitEvent(client, 'error-msg', function (d) { return d.color === 'success'; });
        client.emit('register', { name: 'reg_user', password: 'secret123', ip: '10.0.0.3', fp: 'Firefox Windows' });
        const reg = await regP;
        expect(reg.msg).toContain('تم تسجيل العضويه بنجاح');

        const loginP = waitEvent(client, 'login', function (d) { return d.user && d.user.name === 'reg_user'; });
        const tokenP = waitEvent(client, 'savetoken');
        client.emit('login', { name: 'reg_user', password: 'secret123', ip: '10.0.0.3', fp: 'Firefox Windows' });
        const login = await loginP;
        expect(login.user.name).toBe('reg_user');
        expect(login.adminPower).toBe(0);
        const saved = await tokenP;
        expect(saved.token).toBeTruthy();
        client.close();
      });

      it('login rejects a wrong password', async function () {
        seedAuthDb(db, { username: 'admin', password: 'admin123' });
        const client = await connect(server.url);
        const errP = waitEvent(client, 'error-msg', function (d) { return d.msg && d.msg.indexOf('كلمة المرور') !== -1; });
        client.emit('login', { name: 'admin', password: 'wrongpass', ip: '10.0.0.4', fp: 'Chrome Windows' });
        const err = await errP;
        expect(err.msg).toBeTruthy();
        client.close();
      });

      it('login succeeds for the admin and grants adminPower', async function () {
        seedAuthDb(db, { username: 'admin', password: 'admin123' });
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        client.emit('login', { name: 'admin', password: 'admin123', ip: '10.0.0.5', fp: 'Chrome Windows' });
        const login = await loginP;
        expect(login.user.name).toBe('admin');
        expect(login.adminPower).toBe(999);
        client.close();
      });
    });

    // ── JOIN ROOM ───────────────────────────────────────────────────────────
    describe('join-room', function () {
      it('change-room moves the user into the target room', async function () {
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        client.emit('guest', { name: 'room_guest', ip: '10.0.0.10', fp: 'Chrome Windows' });
        await loginP;

        const changedP = waitEvent(client, 'room-changed');
        client.emit('change-room', { roomId: 'efOiAhhNdL' });
        const changed = await changedP;
        expect(changed.roomId).toBe('efOiAhhNdL');
        client.close();
      });

      it('change-room to a non-existent room is ignored', async function () {
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        client.emit('guest', { name: 'room_guest2', ip: '10.0.0.11', fp: 'Chrome Windows' });
        await loginP;

        let fired = false;
        client.on('room-changed', function (d) { if (d && d.roomId === 'definitely-not-real') fired = true; });
        client.emit('change-room', { roomId: 'definitely-not-real' });
        await new Promise(function (r) { setTimeout(r, 800); });
        expect(fired).toBe(false);
        client.close();
      });

      it('create_room + join_room broadcasts the updated room list', async function () {
        const clientA = await connect(server.url);
        const clientB = await connect(server.url);
        const loginA = waitEvent(clientA, 'login');
        const loginB = waitEvent(clientB, 'login');
        clientA.emit('guest', { name: 'creator_a', ip: '10.0.0.12', fp: 'Chrome Windows' });
        clientB.emit('guest', { name: 'viewer_b', ip: '10.0.0.13', fp: 'Chrome Windows' });
        await loginA;
        await loginB;

        const listP = waitEvent(clientB, 'rooms:full-list');
        clientA.emit('create_room', { name: 'Integration Room', password: 'pwd' });
        const list = await listP;
        const created = list.filter(function (r) { return r.name === 'Integration Room'; });
        expect(created.length).toBe(1);

        const changedP = waitEvent(clientA, 'room-changed');
        clientA.emit('join_room', { roomId: created[0].id, password: 'pwd' });
        const changed = await changedP;
        expect(changed.roomId).toBe(created[0].id);

        clientA.close();
        clientB.close();
      });

      it('join_room rejects a wrong password', async function () {
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        client.emit('guest', { name: 'pass_guest', ip: '10.0.0.14', fp: 'Chrome Windows' });
        await loginP;

        const listP = waitEvent(client, 'rooms:full-list');
        client.emit('create_room', { name: 'Locked Room', password: 'correct' });
        const list = await listP;
        const room = list.filter(function (r) { return r.name === 'Locked Room'; })[0];

        const errP = waitEvent(client, 'error-msg');
        client.emit('join_room', { roomId: room.id, password: 'wrong' });
        const err = await errP;
        expect(err.msg).toBeTruthy();
        client.close();
      });
    });

    // ── SEND MESSAGE ────────────────────────────────────────────────────────
    describe('send message', function () {
      it('broadcasts a public message to the sender room', async function () {
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        client.emit('guest', { name: 'msg_guest', ip: '10.0.0.20', fp: 'Chrome Windows' });
        await loginP;

        const msgP = waitEvent(client, 'message', function (m) { return m && m.type === 'msg'; });
        client.emit('message', { msg: 'hello from tests' });
        const item = await msgP;
        expect(item.user).toBe('msg_guest');
        expect(item.msg).toBe('hello from tests');
        expect(item.room).toBe('efOiAhhNdL');
        client.close();
      });

      it('strips HTML from message content', async function () {
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        client.emit('guest', { name: 'xss_guest', ip: '10.0.0.21', fp: 'Chrome Windows' });
        await loginP;

        const msgP = waitEvent(client, 'message', function (m) { return m && m.type === 'msg'; });
        client.emit('message', { msg: '<script>alert(1)</script> hi' });
        const item = await msgP;
        expect(item.msg).not.toContain('<script>');
        expect(item.msg).toContain('hi');
        client.close();
      });

      it('a muted user is blocked from sending', async function () {
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        client.emit('guest', { name: 'muted_guest', ip: '10.0.0.22', fp: 'Chrome Windows' });
        await loginP;

        // The chat handler reads ismuted from the live state user (state.users),
        // which is only mutated through the 'mute' socket event.
        const mutedP = waitEvent(client, 'muted');
        client.emit('mute', { name: 'muted_guest' });
        await mutedP;

        const alertP = waitEvent(client, 'alert');
        let delivered = false;
        client.on('message', function (m) { if (m && m.type === 'msg') delivered = true; });
        client.emit('message', { msg: 'should be blocked' });
        const alert = await alertP;
        expect(alert.msg).toBeTruthy();
        expect(delivered).toBe(false);
        client.close();
      });
    });

    // ── DISCONNECT CLEANUP ──────────────────────────────────────────────────
    describe('disconnect cleanup', function () {
      it('broadcasts user-left and removes the user from state', async function () {
        const clientA = await connect(server.url);
        const loginA = waitEvent(clientA, 'login');
        clientA.emit('guest', { name: 'leaver', ip: '10.0.0.30', fp: 'Chrome Windows' });
        const login = await loginA;

        const clientB = await connect(server.url);
        const loginB = waitEvent(clientB, 'login');
        clientB.emit('guest', { name: 'observer', ip: '10.0.0.31', fp: 'Chrome Windows' });
        await loginB;

        const leftP = waitEvent(clientB, 'user-left');
        clientA.close();
        const left = await leftP;
        expect(left.name).toBe('leaver');

        // A fresh client's online list (sent on connect) must no longer
        // contain the leaver.
        const clientC = await connect(server.url, { preEvents: ['users-list'] });
        const list = await clientC.captured['users-list'];
        expect(list.some(function (o) { return o.topic === 'leaver'; })).toBe(false);
        expect(login.user.id).toBeTruthy();
        clientB.close();
        clientC.close();
      });

      it('disconnecting a user frees their name for reuse', async function () {
        const client = await connect(server.url);
        const loginP = waitEvent(client, 'login');
        client.emit('guest', { name: 'reusable', ip: '10.0.0.32', fp: 'Chrome Windows' });
        await loginP;
        client.close();
        await new Promise(function (r) { setTimeout(r, 300); });

        const client2 = await connect(server.url);
        const loginP2 = waitEvent(client2, 'login');
        client2.emit('guest', { name: 'reusable', ip: '10.0.0.33', fp: 'Chrome Windows' });
        const login2 = await loginP2;
        expect(login2.user.name).toBe('reusable');
        client2.close();
      });
    });
  });
}

module.exports = { runSocketIntegrationSuite };
