# Single image for both Node services (compose sets the per-service command).
# Dev-mode: web runs `next dev`, battle-service runs via tsx — both transpile the
# workspace TS packages on the fly, so no separate build step is needed.
FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
WORKDIR /app

# Copy manifests first for better layer caching, then sources.
COPY pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY db ./db

RUN pnpm install

ENV NODE_ENV=development
# Ports: web 3000, battle-service 3001 (exposed in compose).
EXPOSE 3000 3001
