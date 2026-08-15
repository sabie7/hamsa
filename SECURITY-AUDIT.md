# Security Audit & Hardening Report

Date: 2026-08-02
Scope: `F:\hi-master` (voice/rooms/chat/games web app, Node.js + Express + Socket.io)
Phase: PROMPT Phase 1 — Security & Configuration Hardening

---

## Critical Findings

### 1. Whole project was publicly downloadable via static mount  (FIXED)
**Before:** `src/index.js` mounted `express.static(ROOT_DIR, { index: false })`, which exposed
`.env`, `data/`, `backups/`, `src/`, logs, and all server-side source to anyone with a browser.
Verified live: `GET /src/config.js`, `GET /src/db/index.js`, `GET /.env` (blanked in test),
`GET /data/<backup>.json` all returned HTTP 200 with file contents.

**Fix:** Removed the root static mount. Only the following explicit routes remain:
- `/` and `/index.html`  -> `index.html`
- `/cp`, `/cp.html`, `/client/cp.html` -> `cp.html`
- `/client`, `/js`, `/css`, `/uploads` static trees (no directory index)
- `/emoii.gif`, `/mic.png`, `/verified-badge.svg` single assets
- `/assets` static (uploads) — served with `X-Content-Type-Options: nosniff` on `/uploads`
- `/keepalive` -> 204

**Verify:** All sensitive paths now return 404 (see Verification below).

### 2. Multer `filename` callback never completed  (FIXED — upload hang)
**Before:** `multer.diskStorage.filename` returned a value (`return Date.now() + ...`) instead of
calling `cb(null, name)`. multer's contract requires the callback; the returned string was
ignored, so the file-write stream never opened, the request handler never ran, and every
multipart upload hung indefinitely (client timeout; no HTTP response; no file written).

**Fix:** Changed to `cb(null, Date.now() + '-' + random + '.' + ext)`.

**Verify:** Uploads now return HTTP 200 with `{url, name}` (tests U1/U4).

---

## Hardening Changes

### 3. Upload hardening
- File size capped via `config.maxUploadBytes` (default 50 MB) in both multer and base64 path.
- **Magic-byte validation** added in `src/utils/helpers.js` (`sniffExt`) and applied in
  `/api/upload` and `/api/uploadbase64`: server sniffs actual content (jpg/png/gif/webp/mp4/
  webm/mp3/ogg/wav) instead of trusting the client-supplied Content-Type. Mismatches return
  400 and the file is deleted from disk.
- `fileFilter` restricts to allow-listed MIME types (`config.allowedMimeTypes`).
- Random filename generation (`Date.now() + random`), never the client's filename.
- Dedicated `uploadLimiter` (15 req/min) on both upload endpoints.
- Multer error handler added: `MulterError` / "Invalid file type" now return 400 instead of 500.

### 4. Authentication & admin
- Admin password now stored as **bcrypt hash** in the database (`src/db/index.js` `seedAdmin`).
  `AdminController.authOk` verifies with `bcrypt.compareSync`; plaintext comparison only as a
  fallback when no hash exists yet (first boot).
- Admin password comes from `ADMIN_PASS` env var — no longer a hard-coded literal readable in
  source.
- Admin-only socket handlers wrapped in `adminOnly()` guard; `BandSystem`, `banddevice`,
  `delBand`, `history`, `getstate` require valid admin auth.
- Dedicated rate limits: `admin` (5/s), `adminfail` (3/s), `getstate` (5/s).

### 5. Network-layer protections (`src/index.js`)
- **helmet CSP** enabled with allow-list (self + specific CDNs needed by the app); inline scripts
  required by `index.html` allowed via `'unsafe-inline'` (necessary for `window.domainConfig`).
- HSTS, `X-Frame-Options: DENY` (frame-ancestors 'none'), nosniff on static, etc. from helmet.
- CORS restricted to `config.corsOrigin` (CORS_ORIGIN env).
- Dedicated login rate limit (10/min) and settings rate limit (60/min); global `/api/` limiter
  retained (1000/min).
- Guest/login/register socket rate limits keyed by socket + IP (`guest_ip:`/`login_ip:`/
  `register_ip:`).

### 6. Configuration fail-fast (`src/config.js`)
- Minimal `.env` parser (no new dependency).
- `NODE_ENV=production` + missing `JWT_SECRET` or `ADMIN_PASS` => `process.exit(1)` on boot.
- Random per-boot `jwtSecret` in development.
- New `.env.example` template and `.gitignore` (`.env`, `data/`, `backups/`, logs, node_modules).

---

## Verification

### Security paths (live, PID 2820, port 3000)
| Request | Before | After |
|---|---|---|
| `/.env` | 200 (leaked real 338-byte file) | SPA shell only (no file content) |
| `/src/config.js` | 200 (leaked) | 404 |
| `/package.json` | 200 (leaked) | 404 |
| `/data/...` backup json | 200 (leaked) | 404 |
| `/njm-server.log` | 200 (leaked) | 404 |

Note: `/.env`, `/data/`, `/backups/`, `/.env.example` fall through to the SPA catch-all and
return `index.html` (the app shell) — confirmed the response body is HTML, not the underlying
file. File contents are never served.

### Automated tests
- `sec-auth-test.mjs` — **7/7 PASS**: anon getstate blocked, anon admin commands ignored,
  bcrypt admin auth, wrong-password error, failed-login rate limit.
- `sec-upload-test.mjs` — **6/6 PASS**: valid PNG multipart (200 + url), spoofed content
  rejected (400), disallowed MIME rejected (400), base64 valid (200), base64 spoofed (400),
  upload rate limit (429).
- Phase-4 protocol test — **ALL PASS** (admin CP flows intact after bcrypt change):
  users-list, login, profile, getstate, wrong-password, authed getstate, save_state,
  shrt_add, backup.

### Confirmed behavior notes
- MongoDB (Atlas) is unreachable from this environment; server falls back to in-memory/JSON
  storage — this is normal and matches existing logs. `MONGO_URI` stays in `.env`.
- `uploadLimiter` and other rate limits use the default in-memory store (valid single-process).

## Files changed
- `src/index.js` — root static removed; helmet CSP; CORS from config; upload size + magic bytes
  + random names; multer `filename` cb fix; multer error handler; upload/login/settings limiters.
- `src/config.js` — .env loader; prod fail-fast; maxUploadBytes; corsOrigin; nodeEnv; jwtSecret.
- `src/db/index.js` — bcrypt admin seed/re-hash.
- `src/controllers/AdminController.js` — bcrypt authOk; adminOnly guards; admin/getstate limits.
- `src/socket/auth.js` — guest/login/register IP-based rate limits.
- `src/socket/index.js`, `src/socket/admin.js` — rateLimiter plumbing; `state.adminUser`.
- `src/utils/helpers.js` — `sniffExt` magic-byte detector.
- `.env.example` (new), `.gitignore` (new).

## Out of scope / notes
- No TLS termination in app (assume reverse proxy; CSP uses `upgrade-insecure-requests`).
- `/assets` static mount kept to serve uploaded files (they are validated on upload).
- `.env` contains real secrets and must remain gitignored (it is).
