# ============================================
# KibanCMS - Multi-stage Docker Build
# ============================================

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Build admin frontend
FROM node:22-alpine AS admin-builder
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY apps/admin/ ./apps/admin/

WORKDIR /app/apps/admin

# No VITE_ env vars needed — frontend fetches config from /api/v1/config at runtime
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN pnpm build

# Stage 3: Build API
FROM node:22-alpine AS api-builder
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/ ./apps/api/

WORKDIR /app/apps/api
RUN pnpm build:api

# Stage 4: Production image
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate

WORKDIR /app

# Copy API build + static assets
COPY --from=api-builder /app/apps/api/dist ./apps/api/dist
COPY --from=api-builder /app/apps/api/src/static ./apps/api/static
COPY --from=api-builder /app/apps/api/package.json ./apps/api/

# Copy admin build
COPY --from=admin-builder /app/apps/admin/dist ./apps/admin/dist

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Never run the API as root inside the container
USER node
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
