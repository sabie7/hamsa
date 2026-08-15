/* ══════════════════════════════════════════════════════════════
   GIFTS SYSTEM
   Clean ES-module rebuild of the legacy gifts system: a gift
   picker (grid) that sends the existing `gift` socket event, plus
   a nicer received-gift announcement.
   ══════════════════════════════════════════════════════════════ */

export var GIFTS = [
  { name: 'وردة', icon: '🌹' },
  { name: 'قلب', icon: '💖' },
  { name: 'بوسة', icon: '💋' },
  { name: 'قهوة', icon: '☕' },
  { name: 'شوكولاتة', icon: '🍫' },
  { name: 'كعكة', icon: '🎂' },
  { name: 'سيارة', icon: '🏎️' },
  { name: 'طائرة', icon: '✈️' },
  { name: 'يخت', icon: '🛥️' },
  { name: 'قصر', icon: '🏰' },
  { name: 'تاج', icon: '👑' },
  { name: 'ماس', icon: '💎' },
  { name: 'ذهب', icon: '💰' },
  { name: 'نجمة', icon: '⭐' },
  { name: 'شمعة', icon: '🕯️' },
  { name: 'زهرة', icon: '🌸' }
];

var api = { emit: null, showToast: null };
var targetName = '';
var pickerModal = null;

function buildPicker() {
  var overlay = document.createElement('div');
  overlay.className = 'gifts-picker-overlay';
  overlay.id = 'gifts-picker-overlay';
  overlay.innerHTML =
    '<div class="gifts-picker">' +
    '  <div class="gifts-picker-header">' +
    '    <span>🎁 إرسال هدية إلى <b class="gifts-picker-target"></b></span>' +
    '    <button type="button" class="gifts-picker-close" data-gifts-close>&times;</button>' +
    '  </div>' +
    '  <div class="gifts-picker-grid"></div>' +
    '</div>';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.getAttribute('data-gifts-close') !== null) closePicker();
  });
  var grid = overlay.querySelector('.gifts-picker-grid');
  GIFTS.forEach(function (g) {
    var cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'gifts-picker-item';
    cell.innerHTML = '<span class="gifts-picker-icon">' + g.icon + '</span><span class="gifts-picker-name">' + g.name + '</span>';
    cell.addEventListener('click', function () {
      if (api.emit) api.emit('gift', { name: targetName, gift: g.name });
      closePicker();
    });
    grid.appendChild(cell);
  });
  document.body.appendChild(overlay);
}

export function initGifts(deps) {
  api = deps || api;
}

export function openGiftPicker(name) {
  targetName = name || '';
  var overlay = document.getElementById('gifts-picker-overlay');
  if (!overlay) buildPicker();
  overlay = document.getElementById('gifts-picker-overlay');
  var targetEl = overlay.querySelector('.gifts-picker-target');
  if (targetEl) targetEl.textContent = targetName;
  overlay.classList.add('open');
}

export function closePicker() {
  var overlay = document.getElementById('gifts-picker-overlay');
  if (overlay) overlay.classList.remove('open');
}

export function announceGift(data) {
  if (!data) return;
  var gift = GIFTS.filter(function (g) { return g.name === data.gift; })[0];
  var icon = gift ? gift.icon : '🎁';
  if (api.showToast) {
    api.showToast(data.from + ' أرسل هدية إلى ' + data.to + ' ' + icon + ' ' + data.gift, 'success');
  }
}
