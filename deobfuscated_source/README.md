# Deobfuscation Report

Generated: 2026-08-04 by `scripts/deobfuscate.cjs`, `scripts/deobfuscate-post.cjs`,
`scripts/deobfuscate-rename.cjs` (verified by `scripts/verify-deobfuscation.cjs`).

Original immutable sources live in `../scraped_decoded/`. This directory holds
readable, deobfuscated equivalents. **Originals were never modified.**

---

## Obfuscation detection results

| File | Bytes | Obfuscated | Techniques detected |
|------|-------|-----------|---------------------|
| `js-classic-alert.js` | 15,289 | YES | string-array + runtime decoder (`_0x5ac2`, offset `0xcc`), array-rotation IIFE (anti-beautify, checksum `0x3ba94`), control-flow flattening (`while(!![])` try/catch), hex escaping (`\xNN`), dynamic property access |
| `js-public-online-users.js` | 16,770 | YES | string-array + runtime decoder (`_0x49d1`, offset `0xd2`), array-rotation IIFE (checksum `0x543d5`), control-flow flattening, hex escaping |
| `js-config.js` | 1,991 | no | — (already readable) |
| `js-countries.js` | 3,690 | no | — |
| `js-dynamic-settings.js` | 1,321 | no | — |
| `js-hearts-animation.js` | 1,857 | no | — |
| `js-logger.js` | 931 | no | — |
| `js-utils.js` | 12,607 | no | — |

### Per-technique checklist (mandate requirement)

- packed JavaScript: YES — two files are string-array packed
- encoded strings: YES — `\xNN` hex escapes (decoded)
- string arrays: YES — `_0x3c66()` / `_0x5d9b()` factories (115 / 144 entries)
- runtime decoders: YES — `_0x5ac2` / `_0x49d1` (inline-substituted)
- eval chains: no
- Function constructors: no
- control-flow flattening: YES — array-rotation `while(!![])` guard (removed)
- dead code insertion: minor — the prologue (rotation guard + decoder + factory) is dead after substitution (removed)
- hexadecimal encoding: YES (`\x20`, `\x0a`, …) — decoded
- unicode escaping: present in recovered strings (Arabic RTL text decoded verbatim)
- base64 encoding: no
- RC4-based string encryption: no (plain string-array variant)
- self-defending code: YES — array-rotation IIFE ties decoder to a rotating array
- anti-debugging logic: none present beyond the rotation guard
- anti-tampering logic: array checksum in rotation IIFE (removed)
- infinite debugger loops: no `debugger` statements
- VM-based obfuscation: no
- dynamic property access: YES — computed member expressions (`obj[_0x..(0x..)]`) inlined to dot/bracket literals

## Deobfuscation pipeline

1. **Analyze** — locate decoder name/offset and string-array factory per file.
2. **Resolve array** — execute decoder + factory + rotation IIFE inside a Node
   `vm` sandbox to obtain the *final rotated* string array (exact same ordering
   the original runtime sees).
3. **Substitute** — replace every `_0xDECODER(0xNN)` / alias call with the real
   string literal.
4. **Strip prologue** — remove rotation IIFE, decoder and factory by source
   index ranges (they are dead after substitution).
5. **Eliminate aliases** — drop `const x = decoder` alias declarations.
6. **Decode hex** — `\xNN` / `\uNNNN` inside string literals → real characters.
7. **Restore names** — curated identifier renames (e.g. `_0x51afce` →
   `ensureOverlay`, `_0x30a52a` → `fire`, `_0x3a867b` → `escapeHtml`).
8. **Format** — Prettier pretty-print.

## Parity verification

`scripts/verify-deobfuscation.cjs` executes the *original* and the *deobfuscated*
files in an identical mock-DOM sandbox and compares exported `window` APIs:

- classic-alert: original ok, deobfuscated ok — **no API drift**
- public-online-users: original ok, deobfuscated ok — **no API drift**

Plus `node --check` passes for both outputs.

## Output files

| File | Notes |
|------|-------|
| `classic-alert.js.deobfuscated.js` | SweetAlert2-compatible overlay (Arabic UI). Live ES-module twin: `../client/js/modules/classic-alert.js` |
| `public-online-users.js.deobfuscated.js` | Landing-page online users renderer + polling. Superseded by Socket.io presence in the 2026 architecture |
| `config.js` | byte-identical copy of the already-readable original |
| `countries.js` | byte-identical copy |
| `dynamic-settings.js` | byte-identical copy |
| `hearts-animation.js` | byte-identical copy |
| `logger.js` | byte-identical copy |
| `utils.js` | byte-identical copy |
