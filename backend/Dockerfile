# ── Nammerha Backend — Production Dockerfile
# Multi-stage Node.js Alpine build with security hardening
#
# FIX: "Exit handler never called" npm bug (npm/cli#4028)
# Root cause: npm's parallel network sockets cause file descriptor exhaustion
# on high-density Docker hosts. Fixed by:
#   1. --maxsockets=1 (serializes npm network requests)
#   2. Explicit npm cache mount (prevents cross-stage pollution)
#   3. 3-stage build (builder → deps → production)

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 1: Builder — compile TypeScript
# ═══════════════════════════════════════════════════════════════════════════
FROM node:22-alpine AS builder
WORKDIR /app

# Increase file descriptor limit and serialize npm network
ENV NODE_OPTIONS="--max-old-space-size=2048"

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --maxsockets=1

# Copy source & compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN rm -rf src/routes/__tests__ src/services/__tests__ && \
    npx tsc --skipLibCheck && \
    cp -r src/graphql/schema/typeDefs dist/graphql/schema/typeDefs

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 2: Production deps (sequential — depends on builder)
# ═══════════════════════════════════════════════════════════════════════════
FROM node:22-alpine AS deps
WORKDIR /app

ENV NODE_OPTIONS="--max-old-space-size=2048"

COPY package.json package-lock.json ./
# Force sequential: COPY from builder ensures this runs after stage 1
COPY --from=builder /app/dist/server.js /tmp/.buildorder
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --maxsockets=1 && \
    rm -f /tmp/.buildorder

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 3: Production — minimal runtime
# ═══════════════════════════════════════════════════════════════════════════
FROM node:22-alpine AS production
LABEL org.opencontainers.image.title="nammerha-backend"
LABEL org.opencontainers.image.description="Nammerha OCDS-compliant backend API"
LABEL org.opencontainers.image.vendor="Nammerha"

WORKDIR /app

# Copy production deps + compiled code
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=builder /app/dist ./dist

# Security: run as non-root
RUN addgroup -g 1001 -S nammerha && \
    adduser -u 1001 -S nammerha -G nammerha && \
    chown -R nammerha:nammerha /app

USER nammerha

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
