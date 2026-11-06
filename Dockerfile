# syntax=docker/dockerfile:1
# Production image: Fastify API + Vite web dist (Electron excluded).

FROM node:24-bookworm AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared-types/package.json packages/shared-types/

# Install only the web/API dependency graphs (skips Electron runtime bits where possible).
RUN pnpm install --frozen-lockfile \
  --filter "@accounting-timer/api..." \
  --filter "@accounting-timer/web..." \
  --filter "@accounting-timer/shared-types..."

COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
COPY apps/web apps/web

RUN pnpm --filter @accounting-timer/shared-types build \
  && pnpm --filter @accounting-timer/web build \
  && pnpm --filter @accounting-timer/api build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    WEB_DIST_DIR=/app/apps/web/dist

RUN useradd --system --uid 10001 --create-home appuser

COPY --from=build --chown=appuser:appuser /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/packages/shared-types ./packages/shared-types
COPY --from=build --chown=appuser:appuser /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=appuser:appuser /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=appuser:appuser /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=appuser:appuser /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build --chown=appuser:appuser /app/apps/web/dist ./apps/web/dist

USER appuser
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
