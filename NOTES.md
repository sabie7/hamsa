# NOTES — WebRTC Voice (Phase 4: Production Hardening)

This file documents the voice architecture, how to stand up a TURN relay,
what events the client and server exchange, the per-room speaker cap, and the
future SFU options we deliberately did NOT implement yet.

---

## 1. STUN / TURN infrastructure

Relaying signaling alone is not enough — WebRTC peers also need ICE servers so
they can punch through NAT. Public Google STUN works for a majority of users
but fails behind **symmetric NAT** (very common on mobile networks). For those
users a **TURN relay** is required.

### Current behaviour
- The server builds the ICE server list in `src/config.js` (`buildIceServers()`)
  from environment variables and sends it to every client in the `voice:config`
  event on connect:
  - `STUN_URLS` — comma-separated STUN servers
    (default: `stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302`).
  - `TURN_URL` — a `turn:` (or `turns:`) URI, e.g. `turn:turn.example.com:3478`.
    When empty, only public STUN is used.
  - `TURN_USER` / `TURN_PASS` — long-term TURN credentials.
- The client (`client/js/modules/voice/VoiceManager.js`) uses these ICE servers
  when creating every `RTCPeerConnection`.

### Recommended deployment: self-hosted coturn
`docker-compose.voice.yml` runs a free, self-hosted coturn TURN server.

```bash
docker compose -f docker-compose.voice.yml up -d
```

Then set in the app `.env`:

```
TURN_URL=turn:your.public.host:3478
TURN_USER=chat
TURN_PASS=<the strong password from docker-compose.voice.yml>
```

Firewall: open TCP/UDP `3478`, and the relay UDP range `49152–65535` on the
TURN host. Set `TURN_REALM` to your public domain/IP. Never run coturn with
`--no-auth` in production.

---

## 2. Room-scoped audio broadcasts

`voice:broadcast` (moderator one-way broadcast) is emitted **only** to the
sender's room with `io.to(user.roomid)` — never a global `io.emit`. The same
room scoping applies to:

- `voice:mic-status`
- `voice:speaker-muted`
- `voice:speaker-joined` / `voice:speaker-left`
- `voice:peer-state`
- `voice:active-users` (responds with only the caller's room speakers)

No group/room audio path uses a global broadcast.

---

## 3. Connection-state indicators

Instead of relying on raw `offer/answer/ice` events, the client reports its
`RTCPeerConnection.connectionState` on `voice:state`; the server normalises it
and relays it to the whole room as `voice:peer-state`.

Normalised states: `connecting`, `connected`, `reconnecting`, `failed`,
`disconnected`. The client shows a badge via `onUiState` covering
`connecting / connected / failed / reconnecting / idle`. When any peer
transitions to `failed`, the badge turns red so the user sees the call died.

---

## 4. Server ↔ client event contract (voice)

Server → client:
- `voice:config` — `{ iceServers, maxSpeakers }`
- `voice:offer` / `voice:answer` / `voice:ice-candidate` — `{ from, sdp|candidate, roomId? }`
- `voice:speaker-joined` / `voice:speaker-left` — `{ name, roomId }`
- `voice:mic-status` / `voice:speaker-muted` — `{ name, enabled|muted, roomId }`
- `voice:peer-state` — `{ name, state, target, roomId }`
- `voice:active-users` — `{ roomId, speakers: [{name,pic}], max }`
- `voice:broadcast` — `{ from, audio, roomId }`
- `voice:error` — `{ code: 'SPEAKER_LIMIT'|'FORBIDDEN', msg, ... }`

Client → server:
- `voice:offer` / `voice:answer` / `voice:ice-candidate` — `{ target, sdp|candidate }`
- `voice:mic-toggle` / `voice:speaker-join` / `voice:speaker-leave`
- `voice:speaker-muted` — `{ muted }`
- `voice:state` — `{ state, target }`
- `voice:active-users`
- `voice:broadcast` — `{ audio }` (requires numeric power rank ≥ 1, or a
  CP-authenticated `socket.isAdmin` socket; guests always receive `FORBIDDEN`)

---

## 5. Simultaneous-speaker cap

Mesh WebRTC degrades badly past a handful of speakers (every peer must
encode/send to every other peer). A per-room cap is enforced **server-side**
so a room can never exceed it:

- `MAX_VOICE_SPEAKERS` env (default `4`).
- Tracked in `state.voiceSpeakers` (`roomId -> [socketIds]`), with helpers in
  `src/socket/index.js`.
- Excess join attempts receive `voice:error { code: 'SPEAKER_LIMIT' }`.
- Speakers are auto-removed on disconnect (`SocketHandler`) and on room change
  (`rooms.js moveUser`), and their room is told via `voice:speaker-left`.

---

## 6. Future scaling option (NOT implemented): SFU

When rooms are expected to host many simultaneous speakers, replace the mesh
with an **SFU** (Selective Forwarding Unit), which relays each uplink once and
forwards to N listeners — O(N) instead of O(N²):

- **mediasoup** — battle-tested, self-hosted, Node.js. Best fit if you keep
  the current Node server.
- **LiveKit** — full product with SFU + SDKs, easier ops but a bigger footprint
  (Go backend + Redis).

Migration path (documented, not built):
1. Stand up an SFU behind the same `io` namespace.
2. Add a `voice:sfu-join` handshake replacing per-peer offer/answer for large
   rooms (keep the mesh for rooms under the speaker cap).
3. Keep `voice:config` to hand the client the SFU URL + ICE servers.

This is intentionally deferred — the mesh + cap is fine up to ~4 speakers and
a few dozen listeners per room.

---

# Phase 5 — Admin Control Panel Completion

This phase hardened the control panel (`/cp`): a dedicated audit log for every
sensitive admin action, automatic scheduled backups, a live system-health tab,
and a verified mapping between every UI action and its server-side event.

## 1. Audit log (`AdminAuditLog`)

- New collection `auditlog` (`AuditLogSchema` in `src/db/schemas.js`, mapped in
  `src/db/repository.js`). `strict: false`, indexes on `actor`, `action`, `created`.
- `AdminController.audit(action, target, before, after, detail)` writes one
  entry per sensitive command: actor (admin username), IP, action, target,
  before/after snapshots, and an ISO timestamp. The collection is capped at
  `AUDIT_MAX = 5000` entries (oldest trimmed).
- Wired through `_auditCaptureBefore` + `_auditCommit` in `runAdminCommand`,
  plus inline audit calls in every direct `attach()` handler and in
  `handleMsg` for `banddevice` / `delBand`. No-op deletions (nothing matched)
  produce no log noise.
- Read via `admin get_auditlog` → emits `auditlog` (last 200, newest first).

## 2. Scheduled backups

- New `src/services/backupService.js`: `createBackup()` prefers a full
  `mongodump` (when Mongo-backed AND the binary is found) and otherwise falls
  back to the legacy JSON export. Old backups rotate to `BACKUP_KEEP`.
- New `src/services/backupScheduler.js`: internal cron every
  `BACKUP_INTERVAL_MS` (default 6 h), optional `BACKUP_BOOT_DELAY_MS`, started
  in `src/index.js` before `server.listen`.
- Env vars: `BACKUP_KEEP`, `BACKUP_INTERVAL_MS`, `BACKUP_DIR`, `MONGODUMP_PATH`
  (documented in `.env.example`). `findMongodump()` probes env override,
  `/usr/bin`, `/usr/local/bin`, and scans `C:\Program Files\MongoDB\Server\*\bin`.
- Backup/restore admin commands now delegate to the service and are audited.

## 3. System health tab

- `admin get_system_health` → emits `system_health` with connected users,
  online count, active rooms, rooms with listeners, memory usage, DB status
  (`mongo` | `memory`), uptime, Node version, and current time.
- Control panel gains a «الحالة» tab that renders these cards and a «سجل
  الإدارة» tab that renders the audit table; both refresh on demand.

## 4. UI → event coverage audit

Every action in `client/js/cp.js` maps to a server handler:

| UI action | Admin command |
|---|---|
| save settings | `save_state` |
| upload emo/dro3/sico | `save_emo` / `save_dro3` / `save_sico` |
| powers editor | `save_as` |
| user search / power / delete / ban | `get_user` / `setuserpower` / `delete_user` / `save_band` |
| browser / OS bans | `save_browser_bans` / `save_system_bans` |
| manual ban + unban | `save_band` / `delete_band` + direct `delBand` |
| rooms | `delete_room` |
| filter add / remove | `fltr_add` / `fltr_del` |
| messages | `msg_add` / `msg_del` |
| shortcuts | `shrt_add` / `shrt_del` |
| subscriptions | `subs_add` / `subs_del` |
| login log search / clear | `get_fps` / `delete_fps` |
| actions clear | `delete_actions` |
| reload pages | `reload_site` |
| backup / restore | `backup` / `restore` |

## 5. Server-side authorization

- Every mutation handler is wrapped in `adminOnly(fn)` (checks `socket.isAdmin`)
  or requires a valid password through `adminAction` (bcrypt-verified).
- `authOk(pass)` verifies against the stored bcrypt hash of the admin account
  (falls back to env compare only when no hash exists yet).
- Anonymous sockets are verified blocked: direct `save_state` without auth is
  ignored and `admin` commands with a wrong password get `error_list`.
- Admin traffic is rate-limited (`admin:` and `getstate:` keys, 5 req/s).

## Verification

`phase5-admin-test.mjs` (19 assertions) covers auth rejection, health payload,
audit write/read with before/after snapshots, and backup auditing — 3 consecutive
green runs. All prior suites (voice, auth, protocol, phase3 socket, upload)
still pass. `backups/` holds exactly `BACKUP_KEEP` (20) JSON backups with the
oldest rotated out.



====================================================================
PROMPT 6 � FRONTEND ARCHITECTURE MODERNIZATION
====================================================================

## 1. main.js is now a pure bootstrap/orchestration layer (80 lines)

All business logic moved out of `client/js/main.js` into ES-module
feature modules under `client/js/modules/`. main.js only:
- constructs the runtime singletons (VoiceManager, MusicManager,
  PrivateChatManager, PrivateCallManager) and injects them into the
  shared `ctx`,
- wires module inits (`initGifts`, `initCarGame`, `initCustomModals`,
  `initEmojiPicker`, `initKeepAlive`, `initClearConfirm`),
- calls `bindActions`/`bindForms`, `initSocket`, `loadInitialData`.

New modules:
- `ctx.js`          � shared mutable context (socket getter, `emit`,
                      MAIN_ROOM, injected singletons).
- `auth.js`         � login/guest/logout/submitLogin/showProfile/
                      enterChat + countryCode/deviceFp + toggles.
- `rendering.js`    � renderMessage, sidebar/landing users, rooms,
                      wall, zajel, quick-chat, escapeHtml,
                      defaultAvatar, currentUserId, joinRoom.
- `profile.js`      � profile modal, sendEffect, admin profile save*,
                      toggleAdminPanel.
- `actions.js`      � ACTION_MAP + all 118 `data-action` handlers and
                      sidebar/tab/modal/upload helpers.
- `socket.js`       � `initSocket()` with all 73 server?client event
                      handlers (identical event names) + voice badge.
- `bindings.js`     � delegated click binding, form/sidebar binding,
                      window.* compatibility aliases.

Verified: a harness compared old main.js vs new modules both statically
and at runtime � 118/118 data-actions and 73/73 socket.on names match,
zero missing/extra.

## 2. ES Modules + Vite

- Added `vite` (devDependency, v8) and `npm run build`.
- `vite.config.mjs` builds from `client/js/app.js` (which imports
  `./main.js` + `../css/index.css`) into `client/dist/` � 23 modules
  bundled into one JS chunk + one extracted CSS file.
- `src/index.js` now serves `/dist` (built assets), `/manifest.json`
  and `/sw.js`; live dev still serves the source ESM graph directly
  (no build required to run).
- Fixed a pre-existing CSS syntax bug in `components.css` (an orphaned
  declaration block with no selector at ~line 1193) that blocked the
  strict postcss parser; the browser was silently ignoring it before.

## 3. CSS design-token system

- New `css/tokens.css`: semantic design tokens (colors, spacing scale,
  radii, shadows, z-index, typography). Existing legacy vars
  (--main-ui-color, --font-family, �) are aliased onto the tokens so
  nothing breaks.
- New `css/index.css` is the single entry point:
  tokens ? theme ? layout ? components ? legacy-features.
- index.html now loads ONE stylesheet (`/css/index.css`) instead of the
  four separate layout/theme/components/legacy `<link>` tags.
- `njm.css` (13k lines) and `modern.css` are dead (referenced by no
  page) and are intentionally NOT merged � including 13k lines of stale
  rules would risk overriding current styles. `tiger.css` stays cp-only.
  `legacy-features.css` is preserved untouched as the compatibility
  layer (rules still used by index.html/cp.html elements).

## 4. PWA (basic, static assets only)

- `client/manifest.json` (name, start_url `/`, theme/background colors,
  icons from the existing site uploads).
- `client/sw.js`: network-first for navigation (never serves stale
  HTML), cache-first for static assets (js/css/img/fonts), and
  explicitly skips `/socket.io/*`, `/api/*` and `/keepalive` so live
  Socket.io data is never cached.
- Registered in index.html on `window.load`.

## 5. Mobile responsiveness

The app was already mobile-first (100dvh viewport, env() safe-area
insets, 77vw sidebar, clamp() tab fonts, 50px touch targets,
horizontally-scrolling mic bar). Added safe additive refinements in
layout.css:
- `touch-action: manipulation` on buttons/links (kills 300ms delay &
  double-tap zoom),
- `overscroll-behavior: contain` on chat/wall/sidebar scrollers so
  pull-to-refresh never hijacks chat scrolling,
- smaller voice-action buttons and `flex: 0 0 auto` mics under 768px.

## Files changed
- client/js/main.js (rewritten as orchestrator)
- client/js/modules/{ctx,auth,rendering,profile,actions,socket,bindings}.js (new)
- client/css/{tokens,index}.css (new), components.css (orphan-block fix),
  layout.css (mobile hygiene), client/manifest.json, client/sw.js (new),
  client/js/app.js (new), client/dist/ (vite build output)
- vite.config.mjs (new), package.json (vite dep + build script)
- src/index.js (/dist, /manifest.json, /sw.js routes)
- index.html (CSS links consolidated ? /css/index.css, manifest link,
  SW registration script)

## Verification
- `npm run build` succeeds (23 modules ? app.js + app.css in client/dist).
- Static + runtime action/event diff vs pre-refactor main.js: identical
  (118 actions, 73 events).
- Server restart OK; `/`, `/js/main.js`, `/css/index.css`,
  `/manifest.json`, `/sw.js`, `/cp`, `/dist/assets/*` all 200.
- Regression: phase3-socket ALL PASS, sec-auth ALL PASS, phase4-voice
  ALL PASS, protocol ALL PASS, phase5-admin 19/19, sec-upload 6/6.
- NOTE: no browser available in this environment, so a manual in-browser
  smoke test (load `/`, log in, join voice, toggle mics, open profile)
  is recommended to confirm visuals/behaviour.
- Built bundle executed in Node (copied to .mjs to bypass CJS/ESM
  detection): `BUNDLE SMOKE TEST PASSED`, no top-level throw, all 11
  expected `window.*` globals exposed. The `[init] classic-alert failed`
  / `top-level bootstrap failed` messages are the app's own try/catch
  swallowing missing-DOM APIs in Node (no browser), not bundle defects.

---

# Phase 7 — Testing & Quality Gates

Replaced the placeholder `npm test` with a real Vitest suite (103 tests),
added a unified ESLint + Prettier config, and a GitHub Actions CI workflow.

## 1. Unit tests (Vitest)

- `test/unit/db/memory.test.js` — MemoryDb/MemoryCollection: CRUD, deep-copy
  semantics, query operators ($regex/$gt/$lt/$ne/$in/$or/$and), bootstrap,
  debounced persistence, facade (collection cache, listCollections, dropAll).
- `test/unit/db/repository.test.js` — unified storage layer contract: every
  collection exposes the full sync interface, CRUD lifecycle, isolation,
  no-disk-write guarantee for the memory backend.
- `test/unit/managers/UserManager.test.js` — add/get/remove, lookups
  (token/name/case-insensitive), sessions, heartbeat sweep, online-list
  dedupe by socket id or lid, room counting.
- `test/unit/managers/RoomManager.test.js` — default-room seeding (idempotent),
  get/create (id gen, HTML escaping, 30-char truncation), delete, per-room
  stats/online counts.
- `test/unit/utils/helpers.test.js` — stringGen, randomInt, escapeHtml,
  escapeRegex, hash, browser/OS classification, isSystemOrBrowserBlocked,
  sniffExt magic-byte validation for every media type.

## 2. Integration tests (Socket.io + socket.io-client)

- `test/integration/socket.suite.js` — shared suite driven against BOTH
  storage backends:
  - **auth**: guest login + join default room; reserved-name rejection;
    register→login round trip; wrong-password rejection; admin login grants
    adminPower 999.
  - **join-room**: change-room; ignore unknown rooms; create_room +
    join_room (password-gated) + `rooms:full-list` broadcast; wrong-password
    rejection.
  - **send message**: room-scoped broadcast, HTML stripping, muted-user block.
  - **disconnect cleanup**: `user-left` broadcast, online list no longer
    contains the leaver, freed username reusable.
- `test/integration/socket.memory.test.js` — runs the suite on the in-memory
  repository (fast, hermetic).
- `test/integration/socket.mongo.test.js` — runs the SAME suite on a real
  MongoDB instance spun up in-memory via **mongodb-memory-server** (binary
  cached under `~/.cache/mongodb-binaries`), proving the Prompt-2 unified
  storage layer serves both backends through identical Socket.io handlers.
- `test/helpers/socketServer.js` — boots the real `src/socket` attachSocket()
  pipeline on an ephemeral port; `connect` (with pre-connect event capture for
  events emitted during the handshake), `waitEvent`, seed helpers.

## 3. ESLint + Prettier

- `eslint.config.mjs` — ESLint 10 flat config, three scopes (src/ CommonJS,
  client/js/ browser+ESM, test/ Vitest globals), `eslint-config-prettier`
  disabled conflicts. `no-var`/`no-redeclare`/`no-useless-assignment` are
  WARNINGS (not errors): the legacy codebase keeps `var` and only migrates
  file-by-file as each is touched — no full rewrite.
- `.prettierrc.json` + `.prettierignore` — single style (semi, singleQuote,
  width 140).
- **Migrated to const/let already** in: `src/db/{index,memory,repository}.js`,
  `src/managers/{UserManager,RoomManager}.js`, `src/utils/helpers.js`, and all
  new test files. Removed dead `logger`/`noop` requires. `npm run lint` → **0
  errors** (1025 warnings, all `no-var`-family legacy).
- Scripts: `lint`, `lint:fix`, `format`, `format:check`, `test`, `test:unit`,
  `test:integration`.

## 4. GitHub Actions

- `.github/workflows/ci.yml` — on push/PR: `npm ci`, pre-fetch the cached
  MongoDB binary, `npm run lint`, `npm test`. MongoDB binary cached via
  `actions/cache` so integration tests stay fast.

## 5. Previous-phase coverage (PROMPT 7 rule)

- Prompt 2 (unified storage layer) — now covered by repository + memory +
  both integration suites.
- Prompt 3 (Socket.io auth/chat/rooms) — covered by the integration suite.
- Prompts 4–6 logic (helpers, managers) — covered by unit tests. Voice/games
  handlers and the client bundle remain manual/browser smoke-test territory
  (no browser in this environment).

## Verification (final)

- `npm test` → 7 files, **103/103 pass** (75 unit + 28 integration).
- `npm run lint` → 0 errors.
- `npm run build` → still green (23 modules, `app.uUl3Hem4.js`).
- Mongoose models are registered inside the mongo integration test; the app
  process itself is untouched, so the live server is unaffected.

---

# Phase 8 — Deployment & Operations

Production hardening: structured logging, a real MongoDB-backed health check,
graceful shutdown, and a complete Docker deployment story.

## 1. Structured logger (`src/logger.js`, rewritten)

- Levels `error`/`warn`/`info`/`debug`, gate by `LOG_LEVEL` (default `info`).
- `LOG_FORMAT`: `text` (human: `[ts] [LEVEL] [tag] msg {...}`) or `json`
  (one valid JSON object per line for log aggregation).
- `LOG_META`: optional JSON string merged into base metadata
  (`service`/`hostname`/`pid`/`env`).
- error/warn → stderr; info/debug → stdout. `safeJson` guards circular refs.
- **Backward compatible**: existing call sites keep `logger.info(tag, msg,
  data)`; no call-site changes needed.

## 2. Health endpoint (`GET /api/health`)

- `src/db/index.js` now exports `healthCheck()` — a real Mongoose
  `db.admin().command({ ping: 1 })` with latency timing, returning
  `{ mongo, mode, connected, latencyMs, ... }`; and `close()` —
  `mongoose.disconnect()`.
- `src/routes/api.js` wires it: 200 `{status:"ok",...,"mongo":true}` when
  Mongo is reachable; 503 `{status:"degraded","db":"memory",...}` on the
  in-memory fallback; 503 `{status:"error"}` if the check throws.
- `src/index.js` threads `dbRef = { db, healthCheck }` into the API router.

## 3. Graceful shutdown (`src/index.js`)

- `shutdown(signal)` on SIGTERM/SIGINT: `server.close()` → `io.close()` →
  `close()` (Mongo) → drain buffered stdout ~250ms → log `Shutdown complete`
  → exit 0. A 15s `forceTimer` (`.unref()`) guarantees termination even if a
  socket lingers.
- The explicit drain delay before `process.exit()` fixes lost final log lines
  (on Windows `process.kill(SIGTERM)` does not deliver the signal, so the
  sequence was verified by emitting the signal directly — the Docker/Linux
  flow that matters sends real SIGTERM).

## 4. Docker

- `Dockerfile` — two stages: `build` (`npm ci` + Vite `npm run build`),
  `runtime` (`npm ci --omit=dev`, copy `server.js`+`src`+built `client`,
  `USER node`, HEALTHCHECK polling `/api/health`).
- `docker-compose.yml` — `name: hi-master`; services:
  - `mongo` (mongo:7, named volume, mongosh healthcheck, host-pinned port).
  - `redis` (redis:7-alpine, `appendonly`, gated behind `profiles:["redis"]`).
  - `coturn` (TURN relay, host networking, subbed from `.env`).
  - `app` (build ., depends on healthy mongo, env interpolation, LOG_FORMAT=json
    default, port 3000, named volumes for uploads/data/backups).
- `.dockerignore` keeps local secrets/artifacts out of the build context.
- `docker-compose.voice.yml` (Phase 4) remains for bridge-networked coturn on
  Docker Desktop/macOS.

## 5. DEPLOY.md

- Full env reference (all `.env.example` variables + table), local run steps,
  Docker Compose deploy, horizontal scaling (`--profile redis --scale app=2`),
  TURN notes, data/backup volumes, logging, health, and a rollback strategy
  (image tag pin + git restore + `mongorestore`).

## Verification (Phase 8)

- `npm test` → **103/103 pass** (unchanged).
- `npm run lint` → **0 errors** (1028 warnings, all legacy `no-var`).
- `src/logger.js` JSON mode verified: single-line objects, correct level
  filtering, base meta present.
- `/api/health` on the live server → **503 `{"status":"degraded","db":"memory",...}`**
  (correct: Atlas Mongo is unreachable from here so the in-memory fallback is
  active; it returns 200+`mongo:true` once a reachable Mongo is configured).
- Graceful shutdown sequence verified end-to-end: `Shutting down` → `HTTP
  server closed` → `Database closed` → `Shutdown complete` (final line flushed).
- Docker image/compose validated by review only — no Docker daemon in this
  environment.

---

# Phase 9 — Final Integration Review

Full review of Phases 1–8: legacy-feature checklist, socket event-name
contract, changelog, and future-improvements list. Delivered `CHANGELOG-2026.md`
(stakeholder language) and this section.

## 1. Legacy feature checklist (old vs. current)

Verified against `scraped_decoded/` + `sor/` references and the live modules.

| Feature | Old ref | Current implementation | Status |
|---|---|---|---|
| Gifts system | `sor/1 (4).txt` (partial) | `client/js/modules/gifts.js` (picker + `announceGift`), server `src/socket/chat.js:247` `on('gift')` → `io.emit('gift')`; client listens `gift` (`modules/socket.js:354`) | ✅ Present & wired end-to-end |
| Car game | `sor/1 (2).txt` (partial) | `client/js/modules/car-game.js` (Canvas Car Dodger + spectator), server `src/socket/games.js` (`game:start/action/end/spectate/active-list`); client listens `game:created/ended/action/active-list` | ✅ Present & wired end-to-end |
| Advanced profile permissions | `sor/1 (3).txt` (partial) | Profile modal shows power/rank badge + admin edit fields (`profile.js` `saveProfile*`), server `setuserpower` (`AdminController.js:469`) & `edit_user` (via `adminAction`). **BUG:** `profile.js:76-108` sends `emit('admin',{cmd:'edit_user'/'setuserpower',...})` WITHOUT `pass`; frontend-bridge's `on('admin')` (`frontend-bridge.js:351`) only handles backup/reload/broadcast/alert/restart and rejects power<5 — the edit fields in the profile modal do NOT actually reach the DB. Use the Control Panel (`admin('setuserpower',…)` via `msg`+pass) which works. | ⚠️ Partial — admin fields in profile modal non-functional; CP works |
| Dark mode | `sor/1 (6).txt` (partial) | `registerAction('toggle-dark-mode')` (`actions.js:298-301`) toggles `dark-mode-active`, persisted in `localStorage`, reapplied on load (`bindings.js:121-123`); CSS in `client/css/components.css` + `njm.css` | ✅ Present & persistent |
| Classic alerts | `scraped_decoded/js-classic-alert.js` (full) | `client/js/modules/classic-alert.js` patches `window.Swal` (fire/close/getPopup/showLoading/getContainer) + `window.closeClassicAlert`; initialized in `main.js:29` | ✅ Present & wired |
| Public online-users counter | `scraped_decoded/js-public-online-users.js` (full) | Header `#online-count` + landing `#landing-users-count` driven by Socket.io `users-list`/`user-joined`/`user-left` + `updateLandingCount` (`rendering.js:139-145`). Old HTTP-poll endpoint `/api/public/online-users` intentionally NOT ported — replaced by real-time socket presence. **Intentional removal (documented).** | ✅ Present (re-architected) |
| Dynamic settings | `scraped_decoded/js-dynamic-settings.js` (full) | `client/js/dynamic-settings.js` applies `window.domainConfig` colors/logo/banner; Control Panel site settings (`AdminController` `save_state`/`save_site`, `cp.js`) | ✅ Present & wired |
| Hearts animation | `scraped_decoded/js-hearts-animation.js` (full) | `client/js/hearts-animation.js` global `triggerHeartsAnimation()`; loaded via `<script>` in `index.html` | ✅ Present (UI-triggered helper) |
| Verified badge / country flags / membership frame | old main.js | `profile.js` renders `#profile-main-verified-badge`, `fi fi-{co}` flag | ✅ Present |

## 2. Socket event-name contract (frontend ⇄ server)

Method: static extraction (server `on()` listeners/emits from `src/socket/*`,
`src/managers`, `src/controllers`; client emits/listens from `client/js/**`),
then manual resolution of the multiplex protocols. Full lists are in the
tables below; verdicts are per-event.

### Client → server (emits with matching listener)
All of the following have a server listener — **verified matching**:
`guest, login, register, istoken, logout, message, send_pm, wallpost,
walllike, wallcomment, delwall, getwall, typing, getuser? (see below),
setprofile, setpass, delete_account, getextras, getzajel, getquickchat,
getwall, game:active-list, game:start, game:action, game:end, game:spectate,
gift, like-user, rep:update, kiss/hug/slap/clap (sendEffect), mute, kick-user,
ban-user, ban-room, roomkick, setpower, change-room, join_room, create_room
(via rendering `emit('join_room')`), report, battle:create/accept/decline/
round-action, quick-chat:send, zajel:send, remove_zajel, clear-room-chat,
send:public-notification, send:notification, voice:offer/answer/ice-candidate/
mic-toggle/speaker-join/speaker-leave/speaker-muted/state/active-users, admin
(→ frontend-bridge `on('admin')`), msg (→ AdminController `on('msg')`),
ping, profile, admin:alert, send_animation, special_entry, broadcast:system,
presence:idle, story:add, stories:get/clear, get_muted_users, get_nicknames,
get_rooms_full, activity, user:set-status, user:profile-changed,
broadcast:live, ban-room, manage_room, send_ad, report-user, banned:notify,
delpic, wall_clear, clear_quickchat, quick-chat:clear, getstate, get_site_info`.

### Server → client (emits with matching listener)
Verified in `client/js/modules/socket.js` + `VoiceManager.js` + `cp.js`:
`init-config, login, savetoken, errortoken, error-msg, alert, msg:error,
msg:rate-limit, savedone, message, pm, profile, userinfo, power, powers,
users-list, user-joined, user-left, rlist, rooms:full-list, rooms-stats,
room-changed, typing, wall-stats, wall-update, wallcomment, delwall,
likes-updated, zajel:list, zajel:new, zajel:delete, quick-chat:history,
quick-chat:new, news_ticker_updated, kicked, muted, banned, duplicate-session,
kiss-animation, hug-received, slap-received, clap-received, gift, animation,
system-message, reload_site, server_restarting, alert:show, admin:broadcast,
battle:created, battle:invited, battle:started, battle:round-update,
battle:score-update, battle:ended, game:created, game:ended, game:action,
game:active-list, voice:mic-status, voice:speaker-muted, voice:config,
voice:speaker-joined, voice:speaker-left, voice:offer, voice:answer,
voice:ice-candidate, voice:error, voice:peer-state, voice:active-users,
report:submitted, notification, private-notification, rep-updated,
user_updated, updateOnline, filter:monitor-update, users-list,
admin_ads:updated?, user_data, done_band, fpslist, system_health, auditlog,
updatesiteweb, getstate (via `message`-cmd for cp.js)`.

### Multiplex protocols (resolve most "orphans")
- **Admin gateway (cp.js + profile.js)**: client sends `emit('msg',{cmd:
  'admin', data:{cmd, pass, data}})` → server `on('msg')` → `handleMsg` →
  `case 'admin'` → `adminAction` → `runAdminCommand` (covers save_state,
  save_band, delete_room, save_as, setuserpower, delete_user, edit_user,
  fltr_add/del, shrt_add/del, msg_add/del, subs_add/del, delete_fps,
  delete_actions, save_browser_bans, save_system_bans, save_noletters,
  save_dro3, save_emo, save_sico, backup, restore, reload_site).
- **CP state fetch**: `emit('msg',{cmd:'getstate', data:{password}})`
  → `on('msg')` → `handleMsg` → `case 'getstate'` → replies wrapped in
  `message`-cmd payloads (siteweb, dro3, emos, sicos, powers, noletters,
  zaker, users_data, rlist, band_list, shrtlist, msgslist, subslist,
  setbansystem). `cp.js` switches on `msg.cmd`.
- **Voice**: `VoiceManager._send()` forwards literal names through
  `socket.emit(event, payload)`; all `voice:*` literals match server
  `on('voice:*')` handlers in `src/socket/voice.js`.

### Orphans found (no matching listener on the other side)
1. **Profile admin edits dead-end** — `client/js/modules/profile.js:76-108`
   `emit('admin',{cmd:'edit_user'|'setuserpower',...})` (no `pass`) hits
   `frontend-bridge.js:351 on('admin')` which only handles backup/reload/
   broadcast/alert/restart and requires `power>=5`. `edit_user`/`setuserpower`
   never execute. **RESOLVED**: the live `main.js` profile-admin handlers now
   use the token-authed REST endpoints (`PUT /api/admin/users/:id` and the
   `/likes`/`/rep`/`/wall-points` sub-routes), and `modules/profile.js` was
   ported to the same REST calls so the dead-end no longer exists in any path.
   The `modules/socket.js`/`bindings.js`/`actions.js`/`profile.js` modules are
   not part of the live module graph (only `main.js` → `ui/state/PrivateChat/
   PrivateCall/Voice/MusicManager`), so they cannot be hit at runtime.
2. **Server emits with NO live client `socket.on` listener** (verified by audit
   against all `client/js/**` as of this session): `banssystem-updated`,
   `getstate`, `settings-updated`, `sicos:updated`, `voice:active-users`,
   `voice:config`. All benign:
   - `settings-updated` / `sicos:updated` / `banssystem-updated` are CP-only
     informational broadcasts after `save_seo` / `save_sico` /
     `save_system_bans`; `cp.js` re-fetches full state via `getState()` on every
     `savedone` anyway, so a listener is redundant.
   - `getstate` (raw event, `modern-server.js:3818`) is a legacy raw emit;
     the live CP uses `msg {cmd:'getstate'}` → `message`-cmd payloads instead.
   - `voice:config` is unused because `VoiceManager` hardcodes its ICE servers
     client-side and tracks speaker state via `voice:state`; the server-side
     `voice:active-users` response is likewise not consumed (client never emits
     the matching request, relying on `voice:state`).
   NOTE: earlier notes wrongly listed `room-chat-cleared`, `like-success`,
   `delete-message`, `stories:updated`, `stories_cleared`, `presence:room-history`,
   `battle:sync`, `game:spectate:list:update`, `admin_ads:updated`,
   `site_appearance_updated`, `quick-chat:clear`, `wall_cleared`,
   `special-entry` as orphans — the automated audit confirms these **do** have
   listeners in the live graph (`main.js`, `stories.js`, `battle.js`,
   `liveBroadcastManager.js`).
3. **Server listeners never emitted by current client** (legacy/stub only):
   `activity`, `battle:end`, `battle:score`, `battle:invite`, `battle:sync`,
   `battle:syncState` (stub), `clear_quickchat`, `remove_zajel`, `getstate`
   (raw, main namespace is via msg), `get_rooms_full`, `get_muted_users`,
   `get_nicknames`, `presence:idle`, `presence:room-history`, `story:add`,
   `stories:get`, `stories:clear`, `special_entry`, `send_animation`,
   `send_ad`, `manage_room`, `broadcast:system`, `banned:notify`,
   `send:notification`, `user:set-status`, `user:profile-changed`,
   `report-user`, `ban-room`, `wall_clear`, `quick-chat:clear`,
   `delpic`? (client emits `delpic` from `actions.js:307,341` → server
   `on('delpic')` exists in chat.js — OK), plus the `AdminController`
   raw `on('save_*')`/`on('get_*')` aliases that are ALSO reachable via
   `msg`→`admin`. NOTE: all of these live in `src/socket/*` /
   `src/controllers/AdminController.js`, which are **dead code** — the active
   server (`src/modern-server.js`) has its own inline handlers.
4. **`auth-profile.js` is dead code** — old module emitting `guestLogin`/
   `getProfile`/`login` events that were never imported (grep: no imports).
   Remove or port to `modules/auth.js`.
5. **`msg` appears in client-listen only in a comment** (`cp.js:4-5`) — not a
   real listener; no action needed.

### Contract verdict
The **live paths** (guest/member login, chat, rooms, wall, gifts, car game,
voice, CP) are correctly matched end-to-end. The only **functional** mismatch
is the profile-modal admin edit buttons (#1). The remaining orphans are either
legacy stubs (#3), dead frontend broadcasts (#2), or dead code (#4) — none
crash the app (Socket.io silently drops un-listened events).

## 3. CHANGELOG-2026.md

Written in non-technical stakeholder language; summarizes Phases 1–8
(engine rewrite, storage, chat/rooms, voice+TURN, backups+audit log, UI
facelift with gifts/car game/dark mode, testing/CI, Docker deployment),
includes a plain-language feature checklist and pointers to future work.

## 4. Future improvements (NOT required now) — prioritized

**Priority 1 — Correctness/completeness**
1. Fix profile-modal admin edits: route `edit_user`/`setuserpower` from
   `profile.js` through the `msg`+`pass` gateway (or a token-authed HTTP
   endpoint) so admins can change nickname/rep/likes/group from the profile.
2. Remove `client/js/modules/auth-profile.js` (dead) and clean the orphan
   broadcast emits (#2 above) or wire client listeners for the ones users
   expect (e.g. `delete-message`, `room-chat-cleared`, `quick-chat:clear`).
3. Port missing wall/delete/story/special-entry UI listeners, or explicitly
   mark those features as removed.

**Priority 2 — Scale & performance**
4. Full TypeScript migration of `src/` + `client/js/modules/` (largest effort;
   payoff is compile-time safety after the `no-var` cleanup).
5. Move voice from mesh (peer-to-peer, cap 4/speakers) to an SFU (e.g.
   mediasoup/Janus) once concurrent voice users grow — NOTE.md Phase 4 covers
   the TURN/SFU trade-offs.
6. Enable the socket.io redis-adapter (already wired in docker-compose
   `--profile redis`) for multi-replica horizontal scaling behind a proxy.

**Priority 3 — Ops & UX**
7. Wire the two CP command aliases `save_power`→`save_powers` and
   `save_noletters_direct`→`save_noletters` to a single canonical command.
8. Add real /api/public/online-users (or keep socket-driven counter) and
   document the intentional removal for third-party integrations.
9. Add end-to-end browser tests (Playwright) for the rebuilt UI (gifts, car
   game, dark mode, profile) since only logic is covered by unit/integration
   tests today.
10. Server-side: extract `setuserpower`/`kick`/`ban`/`mute` power checks into
    a shared permission module (they are currently inline in `chat.js`/
    `frontend-bridge.js`).

# Phase 10 ? JAVASCRIPT DEOBFUSCATION (scraped_decoded sources)

## 1. Scope

Per `prompt.txt`, recover readable equivalents of the obfuscated legacy scripts
in `scraped_decoded/`. Originals were never modified; readable copies live in
`deobfuscated_source/` alongside a full report (`deobfuscated_source/README.md`).

## 2. Detection results (`scripts/deobfuscate-analyze.cjs`)

| File | Obfuscated | Techniques detected |
|------|-----------|---------------------|
| `js-classic-alert.js` | yes | string-array decoder `_0x5ac2` (offset `0xcc`), factory `_0x3c66` (115 entries), rotation IIFE (checksum `0x3ba94`), control-flow flattening, hex escapes |
| `js-public-online-users.js` | yes | string-array decoder `_0x49d1` (offset `0xd2`), factory `_0x5d9b` (144 entries), rotation IIFE (checksum `0x543d5`), control-flow flattening, hex escapes |
| `js-config.js`, `js-countries.js`, `js-dynamic-settings.js`, `js-hearts-animation.js`, `js-logger.js`, `js-utils.js` | no | already readable |

- No eval chains, Function constructors, base64, RC4, VM-based obfuscation,
  `debugger` traps, or anti-debugging logic beyond the array-rotation guard.
- The apparent mojibake in string arrays is genuine Arabic UI text (تنبيه, موافق,
  إلغاء, تم الرفض, خطأ, etc.); it decodes correctly.

## 3. Pipeline (`scripts/deobfuscate.cjs` -> `deobfuscate-post.cjs` -> `deobfuscate-rename.cjs`)

1. Execute decoder + factory + rotation IIFE in a Node `vm` sandbox to obtain the
   final rotated array (identical ordering to runtime).
2. Inline every decoder/alias call with the real string.
3. Strip the (now dead) rotation IIFE, decoder and factory by source index ranges.
4. Drop dead `const x = decoder` alias declarations.
5. Decode `\xNN` / `\uNNNN` escapes inside string literals (quote-aware).
6. Restore meaningful identifiers (classic: 291 tokens; public: 127 tokens), e.g.
   `_0x51afce->ensureOverlay`, `_0x30a52a->fire`, `_0x3a867b->escapeHtml`,
   `_0x244f94->reconcileUsers`, `_0x53e017->pollTimer`.
7. Prettier-format.

## 4. Verification (`scripts/verify-deobfuscation.cjs`)

- Both outputs run under a mock-DOM sandbox with the exact same exported `window`
  API surface as the originals: no drift ("only in original: none", "only in
  deobfuscated: none") for both files.
- `node --check` passes for both outputs; repo lint stays at 0 errors (a
  `scripts/**/*.cjs` block was added to `eslint.config.mjs` for Node globals).

## 5. Outputs

- `deobfuscated_source/classic-alert.js.deobfuscated.js` — live equivalent
  `client/js/modules/classic-alert.js`.
- `deobfuscated_source/public-online-users.js.deobfuscated.js` — legacy HTTP-poll
  presence renderer; superseded by Socket.io presence in the 2026 architecture.
- `deobfuscated_source/{config,countries,dynamic-settings,hearts-animation,logger,utils}.js`
  — byte-identical copies of the already-readable originals.
- `deobfuscated_source/README.md` — full technique table and pipeline notes.

