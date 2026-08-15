var logger = require('../logger');

// Shared wrapper for every Socket.io event handler. An unexpected exception
// inside any handler is caught and logged here so it can never crash the
// whole connection or the process. `tag` is used for the log prefix.
function guard(tag, fn) {
  if (typeof fn !== 'function') return fn;
  return function () {
    try {
      return fn.apply(this, arguments);
    } catch (e) {
      logger.error('socket.' + tag, 'Unhandled exception in handler', { error: e && e.message });
    }
  };
}

// Returns an `on(event, handler)` bound to `socket` that wraps every handler
// with guard(). The event name is used as the log tag.
guard.on = function (socket, prefix) {
  return function (event, handler) {
    var tag = prefix + '.' + event;
    socket.on(event, guard(tag, handler));
  };
};

module.exports = guard;
