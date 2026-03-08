# ── Nammerha Backend — Production Dockerfile
# Multi-stage Node.js Alpine build with security hardening
# Zero dev-deps in production image, non-root user

FROM node:22-alpine AS builder
WORKDIR /app

# Install deps (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source & compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Production stage: Node.js Alpine (minimal)
FROM node:22-alpine AS production
LABEL org.opencontainers.image.title="nammerha-backend"
LABEL org.opencontainers.image.description="Nammerha OCDS-compliant backend API"
LABEL org.opencontainers.image.vendor="Nammerha"

WORKDIR /app

# Install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

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
