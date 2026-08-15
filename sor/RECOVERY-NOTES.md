# sor/ — Recovery Status

This directory was accidentally deleted on 2026-07-31 and has been restored as far as
possible from captured content.

## Fully restored (verbatim from full read before deletion)
- `1 (1).txt` (362 lines) — user-hash removal, clear-confirm, keep-alive, refresh button, extra site buttons
- `1 (3).txt` (624 lines) — reveal-names confirm, options menu, image preview, prettifier, mic confirms, profile permissions toggle

## Partially restored (only the portion captured before deletion)
- `1 (2).txt` — lines 1–120 of 2793 (car-keys game bindings, safe game-pane close, hide guest tab, register helper)
- `1 (4).txt` — lines 1–100 of 1790 (gifts picker open/close logic, roles data start)
- `1 (5).txt` — lines 1–120 of 2721 (El Messiri font CSS, legacy profile/login CSS)
- `1 (6).txt` — lines 1–80 of 820 (dark-mode button + legacy dark-mode CSS)

Each partial file carries a `[PARTIAL RECOVERY]` header marking where reconstruction ends.

## Feature rebuilds
The legacy features described in these patches have been rebuilt natively for the
2026 modern app (see `client/js/modules/`):
- Gifts system → `client/js/modules/gifts.js`
- Car game → `client/js/modules/car-game.js`
- Advanced profile permissions → profile modal "إدارة الصلاحيات" expandable
- Custom modals → `client/js/modules/custom-modals.js`

## Policy
Per the mandate, source reference directories are NEVER to be deleted again.
