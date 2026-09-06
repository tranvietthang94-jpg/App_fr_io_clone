# syntax=docker/dockerfile:1
# Web image — build context MUST be the repo root. NEXT_PUBLIC_* are inlined at
# BUILD time, so the public URLs are passed as build-args (changing the domain
# means rebuilding this image).
# Build: docker build -f apps/web/Dockerfile \
#   --build-arg NEXT_PUBLIC_API_URL=https://app.tenmien.com \
#   --build-arg NEXT_PUBLIC_APP_URL=https://app.tenmien.com -t frclone-web .

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# api's puppeteer would otherwise pull Chromium during the root install.
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Web transpiles @r-frame/shared from source (no dist), so the shared package
# MUST be present in the build context.
COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build -w web

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# output:'standalone' (outputFileTracingRoot=repo root) emits a self-contained
# server with traced deps under .next/standalone; server.js lands at
# apps/web/server.js. static/ and public/ are copied alongside.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
