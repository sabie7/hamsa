# ─────────────────────────────────────────────────────────────────────────────
# hi-master — multi-stage build (Phase 8)
#
#   Stage 1 "build"  : install all deps, run the Vite client build.
#   Stage 2 "runtime": install ONLY production deps, copy source + built client.
#
# The final image runs the Node server on port 3000 with a real /api/health
# HEALTHCHECK. MongoDB / Redis / coturn are orchestrated by docker-compose.yml.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build the client bundle ─────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY vite.config.mjs ./
COPY client ./client

# Also needs index.html at the project root (Vite input resolves into it).
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Production dependencies only (smaller image, no dev tooling exposed).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source.
COPY server.js ./
COPY src ./src

# Static client assets (classic scripts, uploads, manifest, SW).
COPY index.html ./
COPY cp.html ./
COPY --from=build /app/client ./client

# Writable runtime directories (uploaded media, in-memory data fallback,
# scheduled backups). Mount these as volumes in production.
RUN mkdir -p assets/uploads data backups && \
    chown -R node:node /app

USER node

EXPOSE 3000

# Real health check against /api/health (200 only when Mongo is reachable).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
