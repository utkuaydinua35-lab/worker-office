# Build context is this folder only (see deploy/docker-compose.yml), so
# nothing else from the repository — or the host — ends up in the image.

FROM node:22.23.2-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema.
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
# Placeholders: the build reads no database and keeps no secrets.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build NEXTAUTH_SECRET=build \
  npx prisma generate && npx next build

FROM node:22.23.2-bookworm-slim
# ffmpeg decodes audio; yt-dlp (+ deno, its JS runtime for YouTube) fetches it.
# yt-dlp is installed unpinned on purpose: YouTube breaks old releases within
# weeks, so every image rebuild should pick up the latest.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip ca-certificates openssl \
  && pip3 install --no-cache-dir --break-system-packages -U "yt-dlp[default]" \
  && rm -rf /var/lib/apt/lists/*
COPY --from=denoland/deno:bin-2.9.7 /deno /usr/local/bin/deno

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# Unprivileged user; it can write only uploads/ and Next's cache.
USER node
EXPOSE 3000
# db push applies schema changes on start (no-op when nothing changed; refuses data-loss changes).
CMD ["sh", "-c", "npx prisma db push --skip-generate && exec npx tsx server.ts"]
