const fs = require('fs');
const path = require('path');

const OUT_DIR = 'F:\\hi-master\\deobfuscated_source';
const files = [
  'classic-alert.js.deobfuscated.js',
  'public-online-users.js.deobfuscated.js',
];

function decodeString(s) {
  // handles \xNN, \uNNNN, \n, \t, \" etc. inside JS string literal content
  return s
    .replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

function process(src) {
  let out = '';
  let i = 0;
  let state = 'code'; // code | sq | dq | tmpl
  let buffer = '';
  let quote = '';
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === 'code') {
      if (ch === "'" || ch === '"' || ch === '`') {
        state = ch === '`' ? 'tmpl' : 'sq' === 'sq' ? 'sq' : 'dq';
        quote = ch;
        state = ch === '`' ? 'tmpl' : ch === "'" ? 'sq' : 'dq';
        buffer = '';
        out += ch;
      } else {
        out += ch;
      }
    } else if (state === 'sq' || state === 'dq') {
      if (ch === '\\' && i + 1 < src.length) {
        const esc = src[i + 1];
        // keep \x / \u escapes raw until end; decode later
        if (esc === 'x') {
          const hex = src.slice(i + 2, i + 4);
          if (/^[0-9a-fA-F]{2}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 3;
            continue;
          }
        }
        if (esc === 'u') {
          const hex = src.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 5;
            continue;
          }
        }
        out += ch + esc;
        i += 2;
        continue;
      }
      if (ch === quote) {
        state = 'code';
        out += ch;
      } else {
        out += ch;
      }
    } else if (state === 'tmpl') {
      if (ch === '\\' && i + 1 < src.length) {
        const esc = src[i + 1];
        if (esc === 'x') {
          const hex = src.slice(i + 2, i + 4);
          if (/^[0-9a-fA-F]{2}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 3;
            continue;
          }
        }
        out += ch + esc;
        i += 2;
        continue;
      }
      if (ch === '`') {
        state = 'code';
        out += ch;
      } else {
        out += ch;
      }
    }
    i++;
  }
  return out;
}

function simplifyBracketAccess(src) {
  // ['prop'] -> .prop for valid identifiers; also ["prop"] -> .prop
  return src.replace(/\[(['"])([A-Za-z_$][A-Za-z0-9_$]*)\1\]/g, '.$2');
}

for (const f of files) {
  const p = path.join(OUT_DIR, f);
  let src = fs.readFileSync(p, 'utf8');
  src = process(src); // decode \xNN / \uNNNN escapes inside string literals
  src = simplifyBracketAccess(src);
  fs.writeFileSync(p, src);
  console.log('processed', f);
}
