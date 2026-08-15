const fs = require('fs');

// Minimal DOM mock sufficient for classic-alert + public-online-users
function makeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    _children: [],
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(c) { this._children.push(c); return c; },
    insertBefore(c, ref) { const i = ref ? this._children.indexOf(ref) : -1; if (i >= 0) this._children.splice(i, 0, c); else this._children.push(c); return c; },
    replaceWith(c) { this._replaced = c; },
    remove() { this._removed = true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(v) { this._innerHTML = String(v); },
  });
  Object.defineProperty(el, 'textContent', {
    get() { return this._textContent || ''; },
    set(v) { this._textContent = String(v); },
  });
  Object.defineProperty(el, 'className', {
    get() { return this._className || ''; },
    set(v) { this._className = String(v); },
  });
  Object.defineProperty(el, 'outerHTML', {
    get() { return '<' + this.tagName + '>'; },
  });
  Object.defineProperty(el, 'firstElementChild', {
    get() { return this._children[0] || null; },
  });
  Object.defineProperty(el, 'children', {
    get() { return this._children; },
  });
  Object.defineProperty(el, 'value', {
    get() { return this._value || ''; },
    set(v) { this._value = String(v); },
  });
  return el;
}

function makeDom() {
  const elements = {};
  const body = makeElement('body');
  const document = {
    readyState: 'complete',
    body,
    _listeners: {},
    createElement: (t) => makeElement(t),
    getElementById: (id) => elements[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => { (document._listeners[ev] = document._listeners[ev] || []).push(fn); },
    insertAdjacentHTML() {},
  };
  // pre-seed overlay elements that the alert expects
  ['classic-alert-overlay', 'classic-alert-title', 'classic-alert-text', 'classic-alert-buttons'].forEach(id => {
    const el = makeElement('div');
    el.id = id;
    elements[id] = el;
  });
  const landingList = makeElement('div');
  landingList.id = 'landing-users-list';
  elements['landing-users-list'] = landingList;
  const landingCount = makeElement('span');
  landingCount.id = 'landing-users-count';
  elements['landing-users-count'] = landingCount;
  return { document, elements, body };
}

function runInSandbox(code) {
  const { document, elements, body } = makeDom();
  const window = {};
  window.window = window;
  window.document = document;
  window.sessionStorage = {
    getItem: () => null,
    setItem() {},
  };
  const timers = [];
  const context = {
    window, document, console,
    Object, Array, String, Number, Math, JSON, Promise,
    Map, Set, Error, isNaN, parseInt, parseFloat,
    fetch: () => Promise.reject(new Error('no net')),
    sessionStorage: window.sessionStorage,
  };
  context.setTimeout = (fn, ms) => { const t = setTimeout(fn, Math.min(ms || 0, 20)); timers.push(t); return t; };
  context.setInterval = (fn, ms) => { const t = setInterval(fn, Math.min(ms || 0, 20)); timers.push(t); return t; };
  context.clearInterval = (t) => { clearInterval(t); };
  context.clearTimeout = (t) => { clearTimeout(t); };
  context.globalThis = context;
  const vm = require('vm');
  vm.createContext(context);
  let result;
  try {
    vm.runInContext(code, context, { timeout: 3000 });
    result = { ok: true, window, context };
  } catch (e) {
    result = { ok: false, error: e, context };
  }
  // stop pending timers so process can exit
  setTimeout(() => { timers.forEach(t => { try { clearInterval(t); clearTimeout(t); } catch (e) {} }); }, 100);
  return result;
}

function snapshot(window) {
  const s = {};
  for (const k of Object.keys(window).sort()) {
    const v = window[k];
    s[k] = typeof v;
  }
  return s;
}

const orig1 = fs.readFileSync('F:\\hi-master\\scraped_decoded\\js-classic-alert.js', 'utf8');
const dec1 = fs.readFileSync('F:\\hi-master\\deobfuscated_source\\classic-alert.js.deobfuscated.js', 'utf8');
const orig2 = fs.readFileSync('F:\\hi-master\\scraped_decoded\\js-public-online-users.js', 'utf8');
const dec2 = fs.readFileSync('F:\\hi-master\\deobfuscated_source\\public-online-users.js.deobfuscated.js', 'utf8');

console.log('=== classic-alert ===');
const r1o = runInSandbox(orig1);
const r1d = runInSandbox(dec1);
console.log('original ok:', r1o.ok, r1o.ok ? '' : r1o.error.message);
console.log('deobf   ok:', r1d.ok, r1d.ok ? '' : r1d.error.message);
if (r1o.ok && r1d.ok) {
  const so = snapshot(r1o.window);
  const sd = snapshot(r1d.window);
  const onlyO = Object.keys(so).filter(k => !(k in sd));
  const onlyD = Object.keys(sd).filter(k => !(k in so));
  console.log('only in original:', onlyO.join(',') || '(none)');
  console.log('only in deobfuscated:', onlyD.join(',') || '(none)');
}

console.log('=== public-online-users ===');
const r2o = runInSandbox(orig2);
const r2d = runInSandbox(dec2);
console.log('original ok:', r2o.ok, r2o.ok ? '' : r2o.error.message);
console.log('deobf   ok:', r2d.ok, r2d.ok ? '' : r2d.error.message);
if (r2o.ok && r2d.ok) {
  const so = snapshot(r2o.window);
  const sd = snapshot(r2d.window);
  const onlyO = Object.keys(so).filter(k => !(k in sd));
  const onlyD = Object.keys(sd).filter(k => !(k in so));
  console.log('only in original:', onlyO.join(',') || '(none)');
  console.log('only in deobfuscated:', onlyD.join(',') || '(none)');
}
