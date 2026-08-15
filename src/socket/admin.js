var AdminController = require('../controllers/AdminController');

module.exports = function (io, socket, db, state, rateLimiter) {
  var controller = new AdminController(io, socket, db, state, rateLimiter);
  controller.attach();
};
