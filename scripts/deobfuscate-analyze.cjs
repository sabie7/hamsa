const fs = require('fs');
const path = require('path');

const SRC = 'F:\\hi-master\\scraped_decoded';
const OUT = 'F:\\hi-master\\deobfuscated_source';

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));

for (const f of files) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  const report = { file: f, bytes: src.length, techniques: [] };

  // 1. String-array decoder (obfuscator.io style): function DEC(a,b){a=a-OFF;const c=ARR();...}
  const decoderMatch = src.match(/function\s+(_\w+)\((\w+),\s*(\w+)\)\{[^}]*?\2=\2-0x([0-9a-f]+);[^}]*\}/);
  if (decoderMatch) {
    report.techniques.push('string-array decoder: ' + decoderMatch[1] + ' offset=0x' + decoderMatch[4]);
    report.decoder = decoderMatch[1];
    report.offset = parseInt(decoderMatch[4], 16);
  }

  // 2. Array rotation IIFE
  const rotMatch = src.match(/\(function\((\w+),\s*(\w+)\)\{[\s\S]*?push\([\s\S]*?shift\([\s\S]*?\}\(\w+,0x[0-9a-f]+\)\)/);
  if (rotMatch) report.techniques.push('array-rotation IIFE (control flow / anti-beautify)');

  // 3. String array factory function
  const arrFactory = src.match(/function\s+(_\w+)\(\)\{const\s+_\w+=(\[.*?\]);\s*\1=function\(\)\{return\s+_\w+;\};return\s+\1\(\);\}\s*$/s);
  if (arrFactory) report.techniques.push('string-array factory: ' + arrFactory[1] + ' (' + (src.match(/\[.*?\]/)[0].length) + ' chars)');

  // 4. Control-flow flattening: while(!![]) { try { ... break; } catch ... }
  if (/while\(!!\[\]\)/.test(src)) report.techniques.push('control-flow flattening (while(true) try/catch)');

  // 5. Hex/unicode escaping
  if (/\\x[0-9a-f]{2}/.test(src)) report.techniques.push('hex string escaping');
  if (/\\u[0-9a-f]{4}/i.test(src)) report.techniques.push('unicode escaping');

  // 6. base64 / atob
  if (/atob\(/.test(src)) report.techniques.push('base64 (atob)');
  if (/base64|btoa\(/.test(src)) report.techniques.push('base64 (btoa)');

  // 7. eval / Function constructor
  if (/\beval\(/.test(src)) report.techniques.push('eval');
  if (/new\s+Function\(/.test(src)) report.techniques.push('Function constructor');
  if (/\[['"]constructor['"]\]/.test(src)) report.techniques.push('constructor property access');

  // 8. Anti-debug
  if (/debugger/.test(src)) report.techniques.push('debugger statements');
  if (/devtools|_0x.*(test|firebug)|F12/.test(src)) report.techniques.push('anti-devtools detection');

  // 9. Dynamic property access via computed member exprs
  const dynProps = (src.match(/\[\w+\]/g) || []).length;
  if (dynProps > 10) report.techniques.push('dynamic property access (' + dynProps + ' computed member exprs)');

  // 10. Dead-code / fake branches
  const dead = (src.match(/catch\(_\w+\)\{\}/g) || []).length;
  if (dead > 0) report.techniques.push('dead catch branches (' + dead + ')');

  console.log(JSON.stringify(report, null, 2));
}
