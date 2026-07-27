# syntax=docker/dockerfile:1
# API image — build context MUST be the repo root (needs package-lock.json +
# workspace manifests). Build:  docker build -f apps/api/Dockerfile -t frclone-api .

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Don't let puppeteer pull Chromium during install — the runtime stage uses the
# system chromium instead (much smaller, avoids a flaky download).
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

# Manifests first so the (slow) install layer caches independently of source.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# API source only (api does not import @fr-clone/shared).
COPY apps/api/ apps/api/
RUN npm run build -w api
# npm hoists most deps to the root node_modules; guarantee the workspace-local
# dir exists so the runtime COPY never fails (it may hold non-hoisted deps).
RUN mkdir -p /app/apps/api/node_modules

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ffmpeg/ffprobe (transcode + thumbnail; also a hardcoded spawn('ffmpeg') in the
# PDF export path) and Chromium + its shared libs for puppeteer.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      chromium \
      ca-certificates fonts-liberation \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
      libpango-1.0-0 libpangocairo-1.0-0 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# cwd of `node dist/main` == this dir, so uploads/ resolves to
# /app/apps/api/uploads (mount the persistent volume here).
WORKDIR /app/apps/api

# Hoisted deps live at the repo root; api-local deps under apps/api.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json

# Ensure the write dirs exist even before the volume mount populates them.
RUN mkdir -p uploads/chunks uploads/transcoded uploads/thumbnails uploads/temp

EXPOSE 4000
CMD ["node", "dist/main"]
