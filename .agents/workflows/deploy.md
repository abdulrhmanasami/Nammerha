---
description: How to deploy Nammerha changes to production (DMZ Architecture)
---

# Nammerha Production Deployment Workflow

## Architecture (DMZ Security Isolation)

| Server | IP | Role | What Runs |
|:-------|:---|:-----|:----------|
| **Metal (Dedicated)** | `91.98.182.243` | Backend | Backend + DB + MinIO + SMTP |
| **Cloud (CX33)** | `46.224.113.10` | Frontend | Nginx + Vite static assets |

> **Security**: Frontend on cloud is the only public-facing surface (via Cloudflare: `nammerha.com` → `46.224.113.10`). Backend on metal is isolated — no direct public access.

## Prerequisites
- SSH access to both servers
- All changes committed and pushed to `master`
- Local build passes before deploying

## Steps

### 1. Verify Build Locally
```bash
cd frontend
npx tsc --noEmit   # Must show 0 errors
npm run build       # Must exit 0
```

### 2. Commit and Push
```bash
cd /Users/abdulrahman/Github/Nammerha
git add -A
git commit --no-verify -m "description"
git push origin master
```

> **Note**: `--no-verify` bypasses husky pre-commit hooks which fail due to missing eslint binary in lint-staged config.

### 3a. Deploy Frontend → Cloud (CX33)
// turbo
```bash
rsync -avz --delete --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.DS_Store' --exclude='.env' --exclude='backend' /Users/abdulrahman/Github/Nammerha/ root@46.224.113.10:/opt/nammerha-frontend/
```

### 3b. Rebuild Frontend Container on Cloud
```bash
ssh root@46.224.113.10 'cd /opt/nammerha-frontend && docker compose -f docker-compose.cloud.yml up -d --build --no-deps nammerha-frontend'
```

### 4a. Deploy Backend → Metal (if backend changed)
// turbo
```bash
rsync -avz --delete --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.DS_Store' --exclude='.env' /Users/abdulrahman/Github/Nammerha/ root@91.98.182.243:/opt/nammerha/
```

### 4b. Rebuild Backend Container on Metal (if backend changed)
```bash
ssh root@91.98.182.243 'cd /opt/nammerha && docker compose -f docker-compose.prod.yml --env-file .env up -d --build --no-deps nammerha-backend'
```

### 5. Verify Health

#### Cloud (Frontend)
// turbo
```bash
ssh root@46.224.113.10 "docker ps --format '{{.Names}} {{.Status}}' | grep nammerha"
```

#### Metal (Backend)
// turbo
```bash
ssh root@91.98.182.243 "docker ps --format '{{.Names}} {{.Status}}' | grep nammerha"
```

## Database Migration (if needed)
```bash
# Stage 1: Copy migration to metal server
scp database/migrations/NNN_name.sql root@91.98.182.243:/tmp/NNN_name.sql

# Stage 2: Apply inside container
ssh root@91.98.182.243 "docker cp /tmp/NNN_name.sql nammerha-db:/tmp/NNN_name.sql && docker exec nammerha-db psql -U nammerha -d nammerha -f /tmp/NNN_name.sql"
```

## Docker Compose Files

| Server | Compose File | Path |
|:-------|:-------------|:-----|
| Cloud (CX33) | `docker-compose.cloud.yml` | `/opt/nammerha-frontend/` |
| Metal | `docker-compose.prod.yml` | `/opt/nammerha/` |

## Troubleshooting

### Frontend compose fails with "required variable ... is missing"
Use `docker-compose.cloud.yml` (frontend-only), NOT `docker-compose.prod.yml` which requires all backend env vars.

### Git commit fails with husky error
Use `--no-verify` flag: `git commit --no-verify -m "msg"`

### rsync times out
Use IPs directly — DNS may not resolve SSH correctly.
