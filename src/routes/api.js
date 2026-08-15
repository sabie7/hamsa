var express = require('express');
var logger = require('../logger');

module.exports = function (router, dbRef, stateManagerRef, limiters) {
  var settingsLimiter = (limiters && limiters.settings) || function (req, res, next) { next(); };
  // X-Chat-Token auth middleware
  function authToken(req, res, next) {
    var token = req.headers['x-chat-token'] || (req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', ''));
    if (!token) return res.status(401).json({ error: 'Missing token' });
    var dbUser = dbRef.db.users.findOne({ token: token });
    if (!dbUser) return res.status(401).json({ error: 'Invalid token' });
    req.authUser = dbUser;
    next();
  }

  // GET /api/settings
  router.get('/settings', authToken, function (req, res) {
    var u = dbRef.db.users.findOne({ token: req.authUser.token });
    res.json({
      topic: req.authUser.topic || req.authUser.username,
      msg: req.authUser.msg || '',
      ucol: req.authUser.ucol || '#000000',
      fontColor: req.authUser.fontColor || '#000000',
      bg: req.authUser.bg || '#ffffff',
      mcol: req.authUser.mcol || '#000000',
      co: req.authUser.co || 'us',
      ico: req.authUser.ico || '',
      rep: req.authUser.rep || 0,
      likes: req.authUser.likes || 0,
    });
  });

  // POST /api/settings
  router.post('/settings', settingsLimiter, authToken, function (req, res) {
    var allowed = ['topic', 'msg', 'ucol', 'fontColor', 'bg', 'mcol', 'co', 'ico'];
    var updates = {};
    for (var k in req.body) {
      if (allowed.indexOf(k) >= 0) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' });
    dbRef.db.users.updateOne({ token: req.authUser.token }, { $set: updates });
    logger.info('api.settings', 'Updated', { user: req.authUser.username, fields: Object.keys(updates) });
    var sm = stateManagerRef.getUserByToken(req.authUser.token);
    if (sm) {
      for (var k in updates) sm[k] = updates[k];
    }
    res.json({ success: true, message: 'تم حفظ الإعدادات' });
  });

  // POST /api/profile/nickname
  router.post('/profile/nickname', authToken, function (req, res) {
    if (!req.body.nickname) return res.status(400).json({ error: 'Nickname required' });
    dbRef.db.users.updateOne({ token: req.authUser.token }, { $set: { topic: req.body.nickname } });
    res.json({ success: true });
  });

  // POST /api/profile/group
  router.post('/profile/group', authToken, function (req, res) {
    if (!req.body.group) return res.status(400).json({ error: 'Group required' });
    dbRef.db.users.updateOne({ token: req.authUser.token }, { $set: { group: req.body.group } });
    res.json({ success: true });
  });

  // POST /api/profile/rep
  router.post('/profile/rep', authToken, function (req, res) {
    var user = stateManagerRef.getUserByToken(req.authUser.token);
    if (!user) return res.status(404).json({ error: 'User offline' });
    var amount = parseInt(req.body.amount, 10) || 1;
    user.rep = (user.rep || 0) + amount;
    dbRef.db.users.updateOne({ token: req.authUser.token }, { $set: { rep: user.rep } });
    res.json({ success: true, rep: user.rep });
  });

  // POST /api/profile/wallpoints
  router.post('/profile/wallpoints', authToken, function (req, res) {
    res.json({ success: true, wallPoints: req.authUser.wallPoints || 0 });
  });

  // GET /api/public/online-users (public, no auth) — powers the pre-login
  // "online users" landing list. Restored from the legacy public-online-users
  // module (deobfuscated_source/public-online-users.js.deobfuscated.js).
  router.get('/public/online-users', function (req, res) {
    try {
      var users = stateManagerRef.getPublicOnlineUsers ? stateManagerRef.getPublicOnlineUsers() : [];
      res.json(users);
    } catch (e) {
      logger.error('api.publicOnlineUsers', 'Error', { error: e.message });
      res.status(500).json({ error: 'Failed to load online users' });
    }
  });

  // GET /api/health (no auth required) — verifies the real Mongo connection.
  // 200 + { status: 'ok' } only when the storage layer is healthy.
  // 503 + { status: 'degraded' } when running degraded (Mongo unreachable).
  router.get('/health', async function (req, res) {
    try {
      const health = await dbRef.healthCheck();
      const body = {
        status: health.connected ? 'ok' : 'degraded',
        db: health.mode,
        mongo: health.mongo,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
      if (health.mongo) {
        body.mongoLatencyMs = health.latencyMs;
        if (health.error) body.error = health.error;
        if (health.detail) body.detail = health.detail;
      }
      res.status(health.connected ? 200 : 503).json(body);
    } catch (e) {
      logger.error('api.health', 'Health check failed', { error: e.message });
      res.status(503).json({ status: 'error', error: e.message, uptime: process.uptime() });
    }
  });
};
