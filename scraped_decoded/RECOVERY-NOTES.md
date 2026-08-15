# scraped_decoded/ — Recovery Status

This directory was accidentally deleted on 2026-07-31 and has been restored as far as
possible from captured content.

## Restored (byte-identical)
- `js-config.js` — identical to `client/js/config.js`
- `js-utils.js` — identical to `client/js/utils.js`
- `js-logger.js` — identical to `client/js/logger.js`
- `js-countries.js` — identical to `client/js/countries.js`
- `js-hearts-animation.js` — identical to `client/js/hearts-animation.js`
- `js-classic-alert.js` — identical to `client/js/classic-alert.js`
- `js-public-online-users.js` — identical to `client/js/public-online-users.js`
- `js-dynamic-settings.js` — identical to `client/js/dynamic-settings.js`
- `strings_array.json` — exact captured content

## NOT recoverable (permanently deleted, no cache/backup)
The following files could not be recovered byte-for-byte because their full content
was never read into context before deletion:

| File | Original size | Live replacement (2026 integration) |
|------|---------------|-------------------------------------|
| `js-main.js` (obfuscated) | 693,966 B | `client/js/main.js` + `client/js/modules/*` |
| `index.html` | 187,382 B | `index.html` (rebuilt) |
| `css-style.css` | 195,883 B | `client/css/njm.css`, `client/css/layout.css` |
| `css-battle.css` | 16,155 B | `client/css/components.css` (battle styles) |
| `css-classic-alert.css` | 6,407 B | `client/css/components.css` (alert styles) |
| `css-filter-monitor.css` | 4,479 B | `client/css/components.css` (filter monitor) |
| `css-games-overlay.css` | 6,753 B | `client/css/components.css` (games overlay) |

The obfuscated `js-main.js` was decoded and re-architected into the live ES-module
client before this directory was deleted, so no functional data was lost.

## Policy
Per the mandate, source reference directories are NEVER to be deleted again.
