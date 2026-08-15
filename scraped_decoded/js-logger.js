(function () {
  let DEBUG = false;

  try {
    DEBUG = localStorage.getItem('CHAT_DEBUG') === '1';
  } catch (_) {}

  const noop = function () {};

  // حفظ دوال Console الأصلية قبل تعطيلها
  const nativeConsole = {
    log: console.log.bind(console),
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  window.CHAT_DEBUG = DEBUG;

  window.AppLogger = Object.freeze({
    log: DEBUG ? nativeConsole.log : noop,
    debug: DEBUG ? nativeConsole.debug : noop,
    info: DEBUG ? nativeConsole.info : noop,
    warn: DEBUG ? nativeConsole.warn : noop,

    // إبقاء الأخطاء الحقيقية ظاهرة دائمًا
    error: nativeConsole.error,
  });

  // تعطيل سجلات جميع الملفات دفعة واحدة عند إغلاق Debug
  if (!DEBUG) {
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    console.warn = noop;
  }
})();
