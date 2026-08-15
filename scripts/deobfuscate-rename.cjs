const fs = require('fs');
const path = require('path');

const D = 'F:\\hi-master\\deobfuscated_source';

// word-boundary-safe renames (identifier token replacement only)
const classicMap = {
  _0x2219c8: 'createElementEx',
  _0x417710: 'el',
  _0x5cb859: 'key',
  _0x435393: 'value',
  _0x137480: 'textContent',
  _0x51afce: 'ensureOverlay',
  _0x532be3: 'overlayHtml',
  _0x50aca1: 'nativeSwal',
  _0x216b38: 'nativeSwalFire',
  _0x5e4f34: 'nativeSwalClose',
  _0x283d78: 'nativeSwalShowLoading',
  _0x30a52a: 'fire',
  _0x394ad2: 'args',
  _0x46e32a: 'resolve',
  _0x4289b3: 'title',
  _0x477808: 'message',
  _0x2509b3: 'showCancelButton',
  _0x25426e: 'showDenyButton',
  _0x401086: 'confirmButtonText',
  _0x4f7335: 'cancelButtonText',
  _0x12fa13: 'denyButtonText',
  _0x31cc00: 'didOpen',
  _0x35f3dd: 'timer',
  _0x363ad2: 'showConfirmButton',
  _0x59ade4: 'inputType',
  _0x534300: 'inputOptions',
  _0xd740d4: 'inputPlaceholder',
  _0x559161: 'inputValidator',
  _0x20a117: 'icon',
  _0x308592: 'inputValue',
  _0x58fee1: 'preConfirm',
  _0xf8146a: 'willClose',
  _0x5194b1: 'rawMessage',
  _0x446f1d: 'titleEl',
  _0x406b3a: 'textEl',
  _0x50fd0e: 'overlayEl',
  _0x3ef049: 'buttonsEl',
  _0x5676e3: 'messageDiv',
  _0x1483ec: 'boxEl',
  _0x586b28: 'selectEl',
  _0x40ca08: 'selectWrapper',
  _0x4469ad: 'placeholderOpt',
  _0x2bb1bb: 'opt',
  _0x3de53a: 'inputEl',
  _0x420e1a: 'textareaEl',
  _0x778703: 'handleConfirm',
  _0x260a31: 'handleDeny',
  _0x461af4: 'inputValue',
  _0x1fc29a: 'field',
  _0x3356d0: 'errorEl',
  _0x518a25: 'confirmBtn',
  _0x595eed: 'denyBtn',
  _0x4b9f0f: 'cancelBtn',
  _0x5434bc: 'okBtn',
  _0x25b65f: 'overlay',
};

const publicMap = {
  _0x3a867b: 'escapeHtml',
  _0x3b6ecd: 'getAvatarUrl',
  _0x4aeb4e: 'renderUserIdentity',
  _0x1fda03: 'renderAvatar',
  _0x244f94: 'reconcileUsers',
  _0x4c25dc: 'parseHtml',
  _0x53e017: 'pollTimer',
  _0x26b795: 'isFetching',
  _0x289231: 'isStopped',
  _0x338107: 'users',
  _0x29a76a: 'listEl',
  _0x43ad8f: 'countEl',
  _0x3df5e6: 'renderedUsers',
  _0x1abf38: 'user',
  _0x48c82e: 'html',
  _0x34736e: 'statusColor',
  _0x39d0f0: 'country',
  _0x2788d6: 'countryRaw',
};

function applyMap(file, map) {
  const p = path.join(D, file);
  let s = fs.readFileSync(p, 'utf8');
  let count = 0;
  for (const [from, to] of Object.entries(map)) {
    const re = new RegExp('\\b' + from + '\\b', 'g');
    const before = s;
    s = s.replace(re, to);
    count += (before.match(re) || []).length;
  }
  fs.writeFileSync(p, s);
  console.log(file, 'renamed tokens:', count);
}

applyMap('classic-alert.js.deobfuscated.js', classicMap);
applyMap('public-online-users.js.deobfuscated.js', publicMap);