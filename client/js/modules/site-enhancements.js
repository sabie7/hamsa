/* ══════════════════════════════════════════════════════════════
   SITE ENHANCEMENTS
   Clean ES-module port of the owner's legacy patches (sor/) that
   were written against the original scraped DOM. These are the
   generic, DOM-independent parts: session keep-alive, clear-chat
   confirmation, and system-message prettifying.
   ══════════════════════════════════════════════════════════════ */

export function prettifySystemMessage(raw) {
  if (!raw) return raw;
  var t = String(raw);
  if (t.indexOf('دخل') !== -1 && t.indexOf('هذا المستخدم قد دخل') !== -1) {
    return t.replace(/هذا المستخدم قد دخل.*/g, '✨ هذا المستخدم نوّر المكـان');
  }
  if (t.indexOf('غادر') !== -1) {
    return t;
  }
  if (t.indexOf('إنتقل إلى') !== -1 || t.indexOf('انتقل إلى') !== -1) {
    return t.replace(/هذا المستخدم انتقل إلى غرفة اخرى.*/g, '🔄 هذا المستخدم انتقل إلى غرفة أخرى');
  }
  if (t.indexOf('تم طرده') !== -1 || t.indexOf('تم طرد') !== -1) {
    return t;
  }
  return t;
}

/* ─── Session keep-alive: silent background pulses to /keepalive ─── */
export function initKeepAlive() {
  var keepAlive = true;
  var reconnecting = false;
  var base = window.location.origin + '/keepalive';

  function pulse() {
    if (!keepAlive || reconnecting) return;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(base + '?_=' + Date.now());
      } else {
        fetch(base + '?_=' + Date.now(), { cache: 'no-store', mode: 'no-cors' });
      }
    } catch (e) {
      try { fetch(base + '?_=' + Date.now(), { cache: 'no-store', mode: 'no-cors' }); } catch (e2) {}
    }
  }

  setInterval(pulse, 30000);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      keepAlive = true;
      try { navigator.sendBeacon(base + '?hidden=' + Date.now()); } catch (e) {}
    } else {
      reconnecting = true;
      var steps = 0;
      var timer = setInterval(function () {
        steps++;
        pulse();
        if (steps >= 5) { clearInterval(timer); reconnecting = false; }
      }, 2500);
    }
  });

  window.addEventListener('beforeunload', function () {
    keepAlive = false;
    try { navigator.sendBeacon(base + '?logout=' + Date.now()); } catch (e) {}
  });
}

/* ─── Clear-chat confirmation guard ─── */
export function initClearConfirm() {
  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-action="clear-chat"]') : null;
    if (!target) return;
    if (!window.confirm('هل أنت متأكد أنك تريد مسح المحادثة؟')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}
