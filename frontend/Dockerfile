# ── Nammerha Frontend — Production Dockerfile
# Isolated Nginx Alpine serving static Vite build output
# Zero runtime deps, minimal attack surface

FROM node:22-alpine AS builder
WORKDIR /app

# Install deps (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source & build
COPY . .
RUN npx vite build

# ── Production stage: Nginx Alpine
FROM nginx:1.27-alpine AS production
LABEL org.opencontainers.image.title="nammerha-frontend"
LABEL org.opencontainers.image.description="Nammerha reconstruction crowdfunding platform"
LABEL org.opencontainers.image.vendor="Nammerha"

# Remove default Nginx config
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copy custom Nginx config + shared security headers (P1-NGX-001)
COPY deploy/nginx.conf /etc/nginx/conf.d/nammerha.conf
COPY deploy/security-headers.conf /etc/nginx/conf.d/security-headers.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# P0-VE-001: Copy .well-known for deep link verification
# Android App Links (assetlinks.json) and iOS Universal Links (AASA)
# These are NOT part of the Vite build output — must be copied separately.
COPY .well-known /usr/share/nginx/html/.well-known

# Security: run as non-root with proper dir permissions
RUN addgroup -g 1001 -S nammerha && \
    adduser -u 1001 -S nammerha -G nammerha && \
    mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    /var/log/nginx \
    /var/run && \
    chown -R nammerha:nammerha /usr/share/nginx/html \
    /var/cache/nginx \
    /var/log/nginx \
    /var/run && \
    # Redirect Nginx error log to stderr for Docker logging
    ln -sf /dev/stderr /var/log/nginx/error.log && \
    ln -sf /dev/stdout /var/log/nginx/access.log && \
    touch /var/run/nginx.pid && \
    chown nammerha:nammerha /var/run/nginx.pid

USER nammerha

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
