const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC_DIR = 'F:\\hi-master\\scraped_decoded';
const OUT_DIR = 'F:\\hi-master\\deobfuscated_source';

function analyze(src) {
  const decRe = /function\s+(_0x[0-9a-f]{4,})\(\s*(\w+)\s*,\s*\w+\s*\)\s*\{\s*\2\s*=\s*\2\s*-\s*(0x[0-9a-f]+)\s*;/;
  const dec = src.match(decRe);
  if (!dec) return null;
  const decoderName = dec[1];
  const offset = parseInt(dec[3], 16);

  const decoderDefRe = new RegExp('function\\s+' + decoderName + '\\s*\\([^)]*\\)\\s*\\{[^}]*\\}');
  const decoderDef = src.match(decoderDefRe);
  const decoderDefSrc = decoderDef ? decoderDef[0] : null;
  const decoderDefIndex = decoderDef ? decoderDef.index : -1;

  const decBody = decoderDefSrc || '';
  const factMatch = decBody.match(/(_0x[0-9a-f]{4,})\(\)/);
  const factoryName = factMatch ? factMatch[1] : null;
  if (!factoryName) throw new Error('factory not found for ' + decoderName);

  const factRe = new RegExp('function\\s+' + factoryName + '\\(\\)\\s*\\{[\\s\\S]*?return\\s+' + factoryName + '\\(\\);\\}\\s*$');
  const factoryDef = src.match(factRe);
  const factoryDefSrc = factoryDef ? factoryDef[0] : null;
  const factoryDefIndex = factoryDef ? factoryDef.index : -1;

  const invRe = new RegExp('\\}\\(\\s*' + factoryName + '\\s*,\\s*0x[0-9a-f]+\\s*\\)\\s*,');
  const inv = src.match(invRe);
  let rotIifeSrc = null;
  let rotIndex = -1;
  if (inv) {
    const startSearch = src.lastIndexOf('(function(', inv.index);
    // structure: (ROT, MAIN) — remove ROT + trailing comma, keep outer parens
    rotIndex = startSearch + 1;
    rotIifeSrc = src.slice(rotIndex, inv.index + inv[0].length);
  }

  return { decoderName, offset, factoryName, decoderDefSrc, factoryDefSrc, rotIifeSrc, decoderDefIndex, factoryDefIndex, rotIndex };
}

function buildArray(src, info) {
  let code = '';
  if (info.decoderDefSrc) code += info.decoderDefSrc + '\n';
  if (info.factoryDefSrc) code += info.factoryDefSrc + '\n';
  if (info.rotIifeSrc) code += '(' + info.rotIifeSrc.replace(/,\s*$/, '') + ')\n';
  code += 'globalThis.__ARR__ = ' + info.factoryName + '();';
  const sandbox = { console };
  vm.runInNewContext(code, sandbox);
  const arr = sandbox.__ARR__;
  if (!Array.isArray(arr)) throw new Error('array not produced');
  return arr;
}

function collectAliases(src, info) {
  const aliasSet = new Set([info.decoderName]);
  const allIds = new Set((src.match(/_0x[0-9a-f]{4,}/g) || []));
  for (const id of allIds) {
    if (new RegExp('(?:const|let|var)\\s+' + id + '\\s*=\\s*' + info.decoderName + '\\s*[,;]').test(src)) aliasSet.add(id);
    if (new RegExp(',\\s*' + id + '\\s*=\\s*' + info.decoderName + '\\s*[,;]').test(src)) aliasSet.add(id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of allIds) {
      if (aliasSet.has(id)) continue;
      for (const alias of [...aliasSet]) {
        if (new RegExp('(?:const|let|var)\\s+' + id + '\\s*=\\s*' + alias + '\\s*[,;]').test(src) ||
            new RegExp(',\\s*' + id + '\\s*=\\s*' + alias + '\\s*[,;]').test(src)) {
          aliasSet.add(id);
          changed = true;
          break;
        }
      }
    }
  }
  return aliasSet;
}

function removeRanges(src, ranges) {
  const sorted = ranges.filter(r => r !== -1).sort((a, b) => a[0] - b[0]);
  let out = src;
  for (let i = sorted.length - 1; i >= 0; i--) {
    out = out.slice(0, sorted[i][0]) + out.slice(sorted[i][1]);
  }
  return out;
}

function deobfuscate(src) {
  const info = analyze(src);
  if (!info) return null;
  const arr = buildArray(src, info);
  const aliasSet = collectAliases(src, info);

  // Build lookup for all indices actually used
  const used = new Set();
  const callRe = /(_0x[0-9a-f]{4,})\(\s*(0x[0-9a-f]+)\s*\)/g;
  let m;
  while ((m = callRe.exec(src))) {
    const idx = parseInt(m[2], 16) - info.offset;
    if (idx >= 0 && idx < arr.length) used.add(idx);
  }

  // Remove prologue (rotation IIFE, decoder, factory) by index ranges FIRST.
  const ranges = [];
  if (info.rotIndex >= 0) ranges.push([info.rotIndex, info.rotIndex + info.rotIifeSrc.length]);
  if (info.decoderDefIndex >= 0) ranges.push([info.decoderDefIndex, info.decoderDefIndex + info.decoderDefSrc.length]);
  if (info.factoryDefIndex >= 0) ranges.push([info.factoryDefIndex, info.factoryDefIndex + info.factoryDefSrc.length]);
  let body = removeRanges(src, ranges);

  // Now substitute decoder/alias(0xNN) -> string literal
  const esc = [...aliasSet].map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const subRe = new RegExp('(' + esc + ')\\(\\s*(0x[0-9a-f]+)\\s*\\)', 'g');
  body = body.replace(subRe, (m2, fn, hexArg) => {
    const idx = parseInt(hexArg, 16) - info.offset;
    if (idx >= 0 && idx < arr.length) return JSON.stringify(arr[idx]);
    return m2;
  });

  // Clean up remaining control-flow while(true) try/catch wrapper (now harmless): replace
  // `while(!![]){try{...break;...}catch(...){...}}` style blocks -> unwrap the body.
  // Left as-is for safety if structure not recognized.

  // Remove dead alias declarations
  const nonDecoder = [...aliasSet].filter(x => x !== info.decoderName);
  const escAlias = nonDecoder.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const escAll = [...aliasSet].map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  for (const a of escAlias) {
    body = body.replace(new RegExp('(const|let|var)\\s+' + a + '\\s*=\\s*(?:' + escAll + ')\\s*,\\s*'), '$1 ');
    body = body.replace(new RegExp('(?:const|let|var)\\s+' + a + '\\s*=\\s*(?:' + escAll + ')\\s*;'), '');
    body = body.replace(new RegExp(',\\s*' + a + '\\s*=\\s*(?:' + escAll + ')\\s*,'), ',');
    body = body.replace(new RegExp(',\\s*' + a + '\\s*=\\s*(?:' + escAll + ')\\s*;'), ';');
  }

  return { info, arr, aliasSet, out: body };
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const files = ['js-classic-alert.js', 'js-public-online-users.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
  const result = deobfuscate(src);
  if (!result) { console.log(f, '-> no decoder found'); continue; }
  const outName = f.replace(/^js-/, '') + '.deobfuscated.js';
  fs.writeFileSync(path.join(OUT_DIR, outName), result.out);
  console.log('===', f, '=>', outName, '===');
  console.log('decoder:', result.info.decoderName, 'offset:', result.info.offset, 'factory:', result.info.factoryName);
  console.log('array size:', result.arr.length);
  console.log('output bytes:', result.out.length);
  console.log();
}
