# ── Nammerha Backend — Production Dockerfile
# Multi-stage Node.js Alpine build with security hardening
# FIX: Sequential npm ci to prevent BuildKit parallel race condition
# ("Exit handler never called" npm bug)

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 1: Builder — compile TypeScript + install ALL deps
# ═══════════════════════════════════════════════════════════════════════════
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source & compile TypeScript (excluding test files for production)
COPY tsconfig.json ./
COPY src/ ./src/
RUN rm -rf src/routes/__tests__ src/services/__tests__ && \
    npx tsc --skipLibCheck && \
    cp -r src/graphql/schema/typeDefs dist/graphql/schema/typeDefs

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 2: Deps — install ONLY production deps in a clean stage
# ═══════════════════════════════════════════════════════════════════════════
# This stage depends on builder (COPY --from=builder) to force sequential
# execution in BuildKit, preventing the parallel npm race condition.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Force sequential: reference builder to prevent parallel npm ci
COPY --from=builder /app/dist/server.js /tmp/.buildorder
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force && \
    rm -f /tmp/.buildorder

# ═══════════════════════════════════════════════════════════════════════════
# STAGE 3: Production — minimal runtime image
# ═══════════════════════════════════════════════════════════════════════════
FROM node:22-alpine AS production
LABEL org.opencontainers.image.title="nammerha-backend"
LABEL org.opencontainers.image.description="Nammerha OCDS-compliant backend API"
LABEL org.opencontainers.image.vendor="Nammerha"

WORKDIR /app

# Copy production deps from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copy compiled JS from builder
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
