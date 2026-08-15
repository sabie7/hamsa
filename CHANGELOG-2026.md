# CHANGELOG 2026 — hi-master (شات نجم عمان)

*This document is written for owners, moderators and other non-technical
readers. It explains, in plain language, everything that changed during the
2026 modernization project.*

---

## About this project

hi-master is the chat website (شات نجم عمان). During 2026 the entire site was
rebuilt: the old, unreadable "obfuscated" code was replaced with clean,
well-organised code; the design was modernised; and behind the scenes the
storage, security, testing and deployment were made production-grade. This
document summarises what that means for you, in plain words.

**The short version:** if you used the site before, you will recognise every
feature. Everything is faster, safer, easier to maintain, and ready to run on a
proper server.

---

## What we did, phase by phase

### Phase 1 — Clean, organised code (the "engine" rewrite)

The heart of the website was one giant, hard-to-read file. We split it into
small, clearly-named pieces so that fixing a bug or adding a feature no longer
risks breaking something unrelated.

- The way the site stores data (users, messages, rooms, settings, banned
  devices, powers…) is now one unified system, used everywhere.
- Errors are caught properly, so one user's problem can no longer crash the
  whole chat for everyone.
- **Result for you:** fewer unexpected outages, faster bug fixes, room to grow.

### Phase 2 — Data storage that survives restarts

- All site data (users, rooms, wall posts, settings, short message lists,
  banned devices, subscription lists, etc.) is now saved through one storage
  layer.
- The site can run on a simple built-in store, or on a proper database
  (MongoDB) when configured. Data is no longer lost on a server restart.
- **Result for you:** your messages, profiles and room settings stick around.

### Phase 3 — Chat, login and rooms, rebuilt safely

- Login (member / guest / register), rooms (join, create, password-protected),
  sending messages, private messages, the wall, typing indicators and online
  user lists were all rebuilt on the new engine.
- User text is cleaned and protected so that one bad message can't harm other
  visitors (HTML-injection protection).
- Admin tools (Control Panel at `/cp`) were modernised with a cleaner layout.
- **Result for you:** the same chat experience, but safer and smoother.

### Phase 4 — Voice chat (WebRTC) + TURN

- Real-time voice calling was added, using the modern WebRTC standard, with a
  working mic toggle, speaker limit per room, and a visible connection status.
- A free, self-hosted **TURN relay** (coturn) configuration was added so voice
  works even for people behind strict mobile networks.
- **Result for you:** a new voice feature that works on phones and PCs, even on
  tricky connections.

### Phase 5 — Automatic backups & admin audit log

- The site now automatically creates backup copies of all its data on a
  schedule (default every 6 hours, keeping the latest 20).
- A new admin "audit log" records who changed what (e.g. who banned whom, who
  edited a power) so there's a clear history.
- **Result for you:** peace of mind — data can be restored, and admin actions
  are tracked.

### Phase 6 — Modern, responsive design (facelift)

- The user interface was rebuilt: a modern landing/login screen, room layout,
  profiles, dark mode, mobile-friendly navigation, and a "control panel"
  experience.
- Added a gift system (send a rose, heart, car, crown…), the **Car game**,
  custom modals, an emoji picker, hearts animation, classic alerts, a verified
  badge, and a public online-users counter.
- The site now loads as a modern web app with offline support (PWA).
- **Result for you:** a much nicer look that works beautifully on phones.

### Phase 7 — Quality gates: tests, linting, CI

- Added 103 automated tests that check the storage layer, managers, helpers,
  and the whole chat flow (login, rooms, messages) against both storage
  backends. Every change is now verified automatically.
- Added code-style checks (ESLint/Prettier) and a GitHub Actions CI pipeline
  that runs everything on every change.
- **Result for you:** every update is tested before it goes live, so
  regressions are caught early.

### Phase 8 — Ready for real deployment (Docker + operations)

- Added a production **Docker image** and a full **docker-compose** setup:
  the app, MongoDB, optional Redis (for scaling), and the TURN server.
- Added a real **health check** endpoint so a monitoring service knows exactly
  whether the site and its database are healthy.
- Switched to **structured (JSON) logging** for easy log viewing/aggregation,
  plus graceful shutdown so the server stops cleanly without losing work.
- Added a **DEPLOY.md** guide (deployment + rollback instructions).
- **Result for you:** the site can be deployed on a server in one command,
  monitored, and safely rolled back if ever needed.

---

## Feature checklist (old version vs. current version)

| Old feature | Status in 2026 version |
|---|---|
| Gift system (send roses, hearts, cars, crowns…) | ✅ Present — gift picker + broadcast (`client/js/modules/gifts.js`, server `chat.js`) |
| Car game (Car Dodger) | ✅ Present — playable game + spectator mode (`client/js/modules/car-game.js`, server `games.js`) |
| Advanced profile permissions | ⚠️ Partially present — profile shows power/rank and admins can edit nickname/likes/rep via the profile panel; the "setuserpower"/"edit_user" calls from the profile modal are NOT routed correctly (documented in NOTES.md Phase 9). Use the Control Panel for group/power changes. |
| Dark mode | ✅ Present — toggle button + persistent setting (`actions.js`, CSS in `components.css`) |
| Classic alerts (success/error/confirm popups) | ✅ Present — patched over SweetAlert2 (`client/js/modules/classic-alert.js`) |
| Public online-users counter | ✅ Present — shown in the header/landing, driven live over Socket.io (`#online-count`, `updateLandingCount`). The old HTTP-polling endpoint was intentionally replaced with real-time updates. |
| Dynamic settings (site name, colors, logo, banner from domain config) | ✅ Present — `client/js/dynamic-settings.js` + Control Panel site settings |
| Hearts animation | ✅ Present — `client/js/hearts-animation.js` (helper, triggered by UI) |
| Story / special-entry / wall-clear / delete-message / quick-chat-clear broadcasts | ⚠️ Server emits these but the current frontend has no listener for them yet — documented as known gaps in NOTES.md Phase 9 |

---

## What we recommend you look at next

See "Future improvements" in NOTES.md (Phase 9) for the full list. In plain
terms: finish wiring the profile-permission buttons, add sound/image settings
migration, consider a TypeScript migration for even safer code, and plan to
move voice from "peer-to-peer" to a "server-relayed" model when the user count
grows.

---

*Generated 2026-08-04 during the Phase 9 Final Integration Review.*
