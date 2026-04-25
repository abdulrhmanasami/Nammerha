# ── Nammerha Backend — Production Dockerfile
# Multi-stage Node.js Alpine build with security hardening
# Zero dev-deps in production image, non-root user
#
# PATCH: npm 10.x on Alpine triggers "Exit handler never called!" during
# `npm ci` inside BuildKit layers (npm/cli#4603). Mitigations:
#   1. NODE_OPTIONS=--max-old-space-size=4096 gives GC headroom
#   2. Split npm ci / npm cache clean into separate RUN layers
#   3. Guard npm cache clean with `|| true` (cosmetic, not critical)

FROM node:22-alpine AS builder
WORKDIR /app

# Prevent npm GC pressure inside BuildKit layers
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Install deps (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source & compile TypeScript (excluding test files for production)
COPY tsconfig.json ./
COPY src/ ./src/
RUN rm -rf src/routes/__tests__ src/services/__tests__ && \
    npx tsc --skipLibCheck && \
    cp -r src/graphql/schema/typeDefs dist/graphql/schema/typeDefs

# ── Production stage: Node.js Alpine (minimal)
FROM node:22-alpine AS production
LABEL org.opencontainers.image.title="nammerha-backend"
LABEL org.opencontainers.image.description="Nammerha OCDS-compliant backend API"
LABEL org.opencontainers.image.vendor="Nammerha"

WORKDIR /app

# Prevent npm GC pressure inside BuildKit layers
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Install production deps only (split from cache clean to isolate failure)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Cosmetic cleanup — guarded so it never fails the build
RUN npm cache clean --force || true

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Security: run as non-root
RUN addgroup -g 1001 -S nammerha && \
    adduser -u 1001 -S nammerha -G nammerha && \
    chown -R nammerha:nammerha /app

# Clear NODE_OPTIONS for production runtime (not needed at runtime)
ENV NODE_OPTIONS=""

USER nammerha

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]

