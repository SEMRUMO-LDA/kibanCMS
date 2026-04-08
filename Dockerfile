# ============================================
# KibanCMS - Multi-stage Docker Build
# ============================================

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Build admin frontend
FROM node:20-alpine AS admin-builder
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY apps/admin/ ./apps/admin/
COPY packages/types/ ./packages/types/

WORKDIR /app/apps/admin

# No VITE_ env vars needed — frontend fetches config from /api/v1/config at runtime
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN pnpm build

# Stage 3: Build API
FROM node:20-alpine AS api-builder
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/ ./apps/api/
COPY packages/types/ ./packages/types/

WORKDIR /app/apps/api
RUN pnpm build:api

# Stage 4: Production image
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate

WORKDIR /app

# Copy API build
COPY --from=api-builder /app/apps/api/dist ./apps/api/dist
COPY --from=api-builder /app/apps/api/package.json ./apps/api/

# Copy admin build
COPY --from=admin-builder /app/apps/admin/dist ./apps/admin/dist

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production

EXPOSE ${PORT:-5001}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-5001}/health || exit 1

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
