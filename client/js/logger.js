(function () {
  let DEBUG = false;

  try {
    DEBUG = localStorage.getItem('CHAT_DEBUG') === '1';
  } catch (e) {
    DEBUG = false;
  }

  const empty = function () {};

  window.AppLogger = {
    log: DEBUG ? console.log.bind(console) : empty,
    debug: DEBUG ? console.debug.bind(console) : empty,
    info: DEBUG ? console.info.bind(console) : empty,
    warn: DEBUG ? console.warn.bind(console) : empty,
    error: DEBUG ? console.error.bind(console) : empty,
  };
})();
