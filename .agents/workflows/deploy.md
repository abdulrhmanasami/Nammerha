---
description: How to deploy Nammerha changes to production (Unified Cloud Server)
---

# Nammerha Production Deployment Workflow

## Architecture (Unified Cloud Server)

| Server | IP | Role | What Runs |
|:-------|:---|:-----|:----------|
| **Cloud (CX33)** | `46.224.113.10` | Unified | Frontend + Backend + DB + MinIO + SMTP + TileServer |

> **History**: Migrated from DMZ split architecture (Metal AX102 backend + CX33 frontend) to unified cloud on 2026-04-28.

> **Security**: All services bound to `127.0.0.1` — only Nginx (ports 80/443) is public-facing via Cloudflare (`nammerha.com` → `46.224.113.10`).

## Prerequisites
- SSH access to cloud server
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

### 3a. Deploy Frontend → Cloud
// turbo
```bash
rsync -avz --delete --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.DS_Store' --exclude='.env' --exclude='.backups' --exclude='nammerha_mobile' --exclude='nammerha_marketing' -e 'ssh -o ServerAliveInterval=30' /Users/abdulrahman/Github/Nammerha/ root@46.224.113.10:/opt/nammerha/
```

### 3b. Rebuild Frontend Container
```bash
ssh root@46.224.113.10 'cd /opt/nammerha && docker compose -f docker-compose.prod.yml --env-file .env up -d --build --no-deps nammerha-frontend'
```

### 4. Rebuild Backend Container (if backend changed)
```bash
ssh root@46.224.113.10 'cd /opt/nammerha && docker compose -f docker-compose.prod.yml --env-file .env up -d --build --no-deps nammerha-backend'
```

### 5. Verify Health
// turbo
```bash
ssh root@46.224.113.10 "docker ps --format '{{.Names}} {{.Status}}' | grep nammerha"
```

```bash
curl -s https://nammerha.com/api/auth/login -X POST -H "Content-Type: application/json" -d '{}' | jq .
```

## Database Migration (if needed)
```bash
# Stage 1: Copy migration to server
scp database/migrations/NNN_name.sql root@46.224.113.10:/tmp/NNN_name.sql

# Stage 2: Apply inside container
ssh root@46.224.113.10 "docker cp /tmp/NNN_name.sql nammerha-db:/tmp/NNN_name.sql && docker exec nammerha-db psql -U nammerha -d nammerha -f /tmp/NNN_name.sql"
```

## Docker Compose Files

| Compose File | Purpose | Path on Server |
|:-------------|:--------|:---------------|
| `docker-compose.prod.yml` | Full stack (DB + MinIO + SMTP + Backend + Frontend + TileServer) | `/opt/nammerha/` |
| `docker-compose.cloud.yml` | Frontend-only (DEPRECATED) | `/opt/nammerha/` |

## Troubleshooting

### Frontend compose fails with "required variable ... is missing"
Use `docker-compose.prod.yml` with `--env-file .env` — all env vars are in the unified .env file.

### Git commit fails with husky error
Use `--no-verify` flag: `git commit --no-verify -m "msg"`

### rsync times out
Add `-e 'ssh -o ServerAliveInterval=30'` to keep SSH alive during long transfers.

### Backend healthcheck fails
Check logs: `ssh root@46.224.113.10 "docker logs --tail 50 nammerha-backend"`
