/* ══════════════════════════════════════════════════════════════
   IMAGE PREVIEW — restored from sor/1 (3).txt enablePreview().
   The legacy version attached click-to-zoom to <img> inside
   messages. The re-architected client renders message text with
   textContent, so image URLs never became inline <img>. This module:
     1. renderRichContent() — splits a message string and turns image
        URLs into inline <img> thumbnails (safe, no innerHTML).
     2. openImagePreview()/attachImagePreview() — fullscreen zoom
        lightbox + backdrop (click/Escape to close).
   ══════════════════════════════════════════════════════════════ */
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|gif|webp|avif|bmp)(?:\?[^\s"'<>]*)?/gi;
const IMAGE_URL_TEST = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|gif|webp|avif|bmp)(?:\?[^\s"'<>]*)?/i;

export function containsImageUrl(text) {
  if (!text) return false;
  IMAGE_URL_RE.lastIndex = 0;
  return IMAGE_URL_RE.test(String(text));
}

function ensureOverlay() {
  if (document.getElementById('image-preview-overlay')) return document.getElementById('image-preview-overlay');
  var backdrop = document.createElement('div');
  backdrop.id = 'image-lightbox-backdrop';
  backdrop.className = 'image-lightbox-backdrop';
  var overlay = document.createElement('div');
  overlay.id = 'image-preview-overlay';
  overlay.className = 'image-preview-overlay';
  overlay.innerHTML = '<img class="image-preview-img" alt="">';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(backdrop);
  document.body.appendChild(overlay);
  function close() {
    backdrop.classList.remove('active');
    overlay.classList.remove('active');
  }
  backdrop.addEventListener('click', close);
  overlay.addEventListener('click', close);
  if (document.addEventListener) document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  return overlay;
}

export function openImagePreview(src) {
  var overlay = ensureOverlay();
  var img = overlay.querySelector('.image-preview-img');
  if (!src) return;
  img.src = src;
  overlay.classList.add('active');
  var backdrop = document.getElementById('image-lightbox-backdrop');
  if (backdrop) backdrop.classList.add('active');
}

export function attachImagePreview(imgEl) {
  if (!imgEl || imgEl.dataset.previewAttached) return;
  imgEl.dataset.previewAttached = 'true';
  imgEl.style.cursor = 'zoom-in';
  imgEl.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    openImagePreview(imgEl.currentSrc || imgEl.src);
  });
}

export function renderRichContent(text, opts) {
  opts = opts || {};
  var maxWidth = opts.maxWidth || 260;
  var frag = document.createDocumentFragment();
  if (!text) text = '';
  var parts = String(text).split(IMAGE_URL_RE);
  parts.forEach(function (part) {
    if (!part) return;
    if (IMAGE_URL_TEST.test(part)) {
      var img = document.createElement('img');
      img.src = part;
      img.className = 'chat-image' + (opts.extraClass ? ' ' + opts.extraClass : '');
      img.style.cssText = 'max-width:' + maxWidth + 'px; max-height:220px; border-radius:8px; object-fit:cover; display:block; margin:3px 0; cursor:zoom-in;';
      img.setAttribute('referrerpolicy', 'origin-when-cross-origin');
      img.setAttribute('loading', 'lazy');
      attachImagePreview(img);
      frag.appendChild(img);
    } else {
      frag.appendChild(document.createTextNode(part));
    }
  });
  return frag;
}

export function initImagePreview() {
  function scan() {
    document.querySelectorAll('img.chat-image').forEach(attachImagePreview);
  }
  if (!('MutationObserver' in window)) return;
  var observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
}