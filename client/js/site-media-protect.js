/* ══════════════════════════════════════════════════════════════
   SITE-MEDIA-PROTECT — global screenshot/media-save protection.
   Applies to everything EXCEPT the wall file-sharing posts:
     1) Blur all media whenever the window/tab loses focus
        (stops phone/screenshot apps capturing readable content).
     2) Block context-menu save / "open image in new tab".
     3) Block drag-to-save and HTML5 drag.
     4) Disable iOS/Android long-press & drag chrome (CSS).
   The wall posts area — where members share files with each other —
   stays fully open (right-click save, drag, long-press, no blur).
   Purely additive + lightweight. No per-image markup changes.
   ══════════════════════════════════════════════════════════════ */

(function () {
  var STYLE_ID = 'site-media-protect-style';

  // Wall posts area (file sharing between members) is NOT protected.
  var EXEMPT_SELECTOR =
    '#wall-posts-container, #wall-posts-inner-container, ' +
    '.wall-post-media, .wall-post-media-clear, .wall-container, ' +
    '#wall-media-preview-container';

  function isExempt(t) {
    if (t && t.closest) return !!t.closest(EXEMPT_SELECTOR);
    return false;
  }

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    var exemptParts = EXEMPT_SELECTOR.split(',');
    function exemptDesc(desc) {
      return exemptParts.map(function (p) { return p.trim() + ' ' + desc; }).join(', ');
    }

    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      /* Default: block save / long-press / drag chrome on all media */
      'img, video { -webkit-touch-callout: none !important; -webkit-user-drag: none !important; user-drag: none !important; touch-callout: none !important; }' +
      /* …but re-enable it inside the exempt wall (file sharing stays free) */
      exemptDesc('img, video') + '{ -webkit-touch-callout: auto !important; -webkit-user-drag: auto !important; user-drag: auto !important; touch-callout: auto !important; }' +
      /* Blur everything on focus loss, except the exempt wall */
      'html.site-media-protected img, html.site-media-protected video {' +
      '  filter: blur(16px) opacity(0.32) !important;' +
      '  transition: filter .12s ease, opacity .12s ease;' +
      '}' +
      'html.site-media-protected ' + exemptDesc('img') + ',' +
      'html.site-media-protected ' + exemptDesc('video') +
      '{ filter: none !important; }' +
      'html.site-media-protected .message-avatar,' +
      'html.site-media-protected .user-avatar,' +
      'html.site-media-protected .wall-post-avatar,' +
      'html.site-media-protected .story-avatar,' +
      'html.site-media-protected .mention-avatar,' +
      'html.site-media-protected .sidebar-notification-avatar,' +
      'html.site-media-protected .quoted-avatar,' +
      'html.site-media-protected .private-alert-avatar,' +
      'html.site-media-protected .filter-toast-avatar,' +
      'html.site-media-protected .preview-avatar,' +
      'html.site-media-protected .preview-frame,' +
      'html.site-media-protected .classic-avatar-small,' +
      'html.site-media-protected .room-card-img,' +
      'html.site-media-protected .room-card-thumbnail,' +
      'html.site-media-protected .yt-result-thumb,' +
      'html.site-media-protected .placeholder-thumb,' +
      'html.site-media-protected .report-alert-image,' +
      'html.site-media-protected .chat-cleared-avatar,' +
      'html.site-media-protected .chat-cleared-banner,' +
      'html.site-media-protected .emoji,' +
      'html.site-media-protected img[src*="/flags/"],' +
      'html.site-media-protected img[src*="emoii"],' +
      'html.site-media-protected img[src*="/emojis/"]' +
      '{ filter: none !important; }';
    document.head.appendChild(st);
  }

  function isMedia(t) {
    return !!t && t.nodeType === 1 && (t.tagName === 'IMG' || t.tagName === 'VIDEO');
  }

  // Right-click / long-press "Save image" & "open in new tab"
  document.addEventListener('contextmenu', function (e) {
    if (isMedia(e.target) && !isExempt(e.target)) e.preventDefault();
  }, true);

  // Drag out / drag-to-save
  document.addEventListener('dragstart', function (e) {
    if (isMedia(e.target) && !isExempt(e.target)) e.preventDefault();
  }, true);

  function lock() {
    document.documentElement.classList.add('site-media-protected');
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      if (isExempt(v)) continue;
      if (!v.paused && !v.ended) {
        v.setAttribute('data-site-media-resume', '1');
        try { v.pause(); } catch (e) {}
      }
    }
  }

  function unlock() {
    document.documentElement.classList.remove('site-media-protected');
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      if (v.getAttribute && v.getAttribute('data-site-media-resume') === '1') {
        v.removeAttribute('data-site-media-resume');
        try { v.play().catch(function () {}); } catch (e) {}
      }
    }
  }

  window.addEventListener('blur', lock);
  window.addEventListener('focus', unlock);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) lock(); else unlock();
  });

  injectStyle();
})();