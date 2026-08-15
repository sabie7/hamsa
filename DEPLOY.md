# Deploying hi-master

hi-master is a Socket.io chat + voice + control-panel application (Node.js server, Vite-built classic frontend, MongoDB storage with an in-memory/JSON fallback). This document covers running it locally and deploying it with Docker Compose.

## Architecture

| Component | Role | When required |
|-----------|------|---------------|
| `app` (Node server) | HTTP + Socket.io, uploads, backups, voice signaling | Always |
| `mongo` (MongoDB 7) | Durable source of truth for messages/users/rooms | Recommended; app falls back to in-memory/JSON storage if unreachable |
| `redis` (Redis 7) | Socket.io redis-adapter (multi-instance fan-out) | Only when scaling `app` > 1 replica |
| `coturn` (TURN relay) | WebRTC relay for voice behind strict NAT | Only if voice is used by clients behind symmetric NAT |

## Configuration (environment variables)

All settings are read from the environment. Copy `.env.example` to `.env` and adjust.

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3000` | HTTP/Socket port |
| `NODE_ENV` | `development` | Set to `production` in Docker |
| `MONGO_URI` | empty | Mongoose connection string. Empty → in-memory/JSON fallback |
| `JWT_SECRET` | — | **Required in production** (app fails fast without it). Use `openssl rand -base64 48` |
| `ADMIN_USER` / `ADMIN_PASS` | `admin` / `admin123` | Control Panel login at `/cp` |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins (avoid `*` in production) |
| `MAX_UPLOAD_BYTES` | `52428800` (50 MB) | Maximum upload size |
| `TURN_URL` / `TURN_USER` / `TURN_PASS` | empty | TURN relay credentials (voice) |
| `STUN_URLS` | Google STUN | Comma-separated STUN servers |
| `MAX_VOICE_SPEAKERS` | `4` | Max simultaneous speakers per room |
| `REDIS_URL` | empty | Redis connection for the socket.io adapter (multi-instance) |
| `BACKUP_KEEP` | `20` | Number of recent backups to retain |
| `BACKUP_INTERVAL_MS` | `21600000` (6 h) | Backup interval |
| `MONGODUMP_PATH` | auto-detected | Path to `mongodump` (falls back to JSON export) |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |
| `LOG_FORMAT` | `text` | `text` (human) or `json` (structured, one object per line) |
| `LOG_META` | `{}` | Extra JSON merged into every log record's base metadata |

## Local run (no Docker)

```bash
npm ci
npm run build          # builds the Vite client bundle into client/dist
cp .env.example .env   # then edit .env with real values
node server.js         # NODE_ENV=development, text logs
```

Verify:

- `http://localhost:3000/` serves the chat client.
- `http://localhost:3000/cp` opens the Control Panel.
- `curl http://localhost:3000/api/health` → `{"status":"ok",...,"mongo":true}` when Mongo is reachable, or `{"status":"degraded","db":"memory",...}` with HTTP 503 when the app is running on the fallback store.

## Docker Compose deploy

Prerequisites: Docker Engine with Compose v2.

```bash
# 1. Configure secrets
cp .env.example .env
#    set JWT_SECRET, ADMIN_USER/ADMIN_PASS, TURN_USER/TURN_PASS, CORS_ORIGIN
#    (docker-compose.yml interpolates ${...} from .env)

# 2. Build and start app + mongo (+ coturn)
docker compose up -d --build

# 3. Confirm health
docker compose ps                     # all services "healthy"/"running"
docker compose logs app               # structured JSON logs
curl http://localhost:3000/api/health # {"status":"ok",...,"mongo":true}
```

### Horizontal scaling (multi-replica with Redis)

```bash
docker compose --profile redis up -d --scale app=2
```

This starts the `redis` service and two `app` replicas. Set `REDIS_URL` in your `.env` so the socket.io redis-adapter shares room state across replicas. A reverse proxy (e.g. nginx) should balance HTTP and route Socket.io long-polling to one replica per session.

### Voice/TURN notes

- `coturn` uses `network_mode: host` and therefore only works on Linux hosts. On Docker Desktop/macOS use `docker compose -f docker-compose.voice.yml up -d coturn` (bridge networking variant).
- The app defaults `TURN_URL` to `turn:127.0.0.1:3478` for local single-host testing; set the real public relay hostname in production.

## Data & backups

- MongoDB data: named volume `hi-master_mongo-data` (`/data/db`).
- Uploads / runtime data / backups: named volumes `app-uploads`, `app-data`, `app-backups` mounted under `/app/assets/uploads`, `/app/data`, `/app/backups`.
- The app schedules automatic backups to `/app/backups` (see `BACKUP_KEEP` / `BACKUP_INTERVAL_MS`). Back up the named volumes or the `backups` directory as part of your DR routine.

## Logging

Default local format is text (`[ts] [LEVEL] [tag] msg {...}`). For production log aggregation, set `LOG_FORMAT=json` (the Docker Compose default) — every line is a valid JSON object:

```json
{"service":"hi-master","hostname":"…","pid":…,"env":"production","ts":"…","level":"info","tag":"server.start","msg":"Running","data":{"port":"3000"}}
```

Error/warn records are written to stderr; info/debug to stdout.

## Health endpoint

`GET /api/health` performs a real MongoDB `ping`:

| HTTP | Body | Meaning |
|------|------|---------|
| 200 | `{"status":"ok",...,"mongo":true}` | Server up, Mongo reachable |
| 503 | `{"status":"degraded","db":"memory",...}` | Server up, Mongo unreachable (fallback store active) |
| 503 | `{"status":"error",...}` | Health check itself threw |

The Docker image's `HEALTHCHECK` polls this endpoint; a container is only marked healthy when Mongo is reachable.

## Rollback

1. **Containers** — pin a previous image tag and redeploy only the `app` service:

   ```bash
   docker compose up -d --no-deps --scale app=1 app=hi-master_app:OLD_TAG
   ```

   (Keep the `mongo` volume untouched so data persists across rollbacks.)

2. **Native install** — restore the previous code from git, rebuild, restart:

   ```bash
   git checkout <previous-release>
   npm ci
   npm run build
   node server.js
   ```

3. **Data** — restore from a scheduled backup in the `backups/` volume/directory or from a `mongorestore` dump.
