---
description: How to deploy Nammerha changes to production (CX33 Hetzner)
---

# Nammerha Production Deployment Workflow

## Prerequisites
- SSH access to `root@91.98.182.243` (CX33 Hetzner)
- All changes committed and pushed to `master` branch
- Local `npm run build` passes before deploying

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

> **Note**: `--no-verify` bypasses husky pre-commit hooks which fail due to missing eslint binary in lint-staged config. This is a known issue (ENOENT on `eslint --fix`).

### 3. Rsync to Production Server
// turbo
```bash
rsync -avz --delete --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.DS_Store' /Users/abdulrahman/Github/Nammerha/ root@91.98.182.243:/opt/nammerha/
```

### 4. Rebuild Docker Containers
```bash
ssh root@91.98.182.243 'cd /opt/nammerha && docker compose -f docker-compose.prod.yml --env-file .env up -d --build --no-deps nammerha-frontend nammerha-backend'
```

> **CRITICAL**: The `.env` file at `/opt/nammerha/.env` on the server contains ALL 40 required environment variables. It was extracted from running containers on 2026-03-12. Without it, `docker compose` will fail with `required variable ... is missing a value`.

### 5. Verify Health
// turbo
```bash
ssh root@91.98.182.243 "docker ps --format '{{.Names}} {{.Status}}' | grep nammerha"
```

Expected output (all 5 healthy):
```
nammerha-backend   Up X seconds (healthy)
nammerha-frontend  Up X seconds (healthy)
nammerha-smtp      Up X hours (healthy)
nammerha-minio     Up X hours (healthy)
nammerha-db        Up X hours (healthy)
```

## Database Migration (if needed)
```bash
# Stage 1: Copy migration to server
scp database/migrations/NNN_name.sql root@91.98.182.243:/tmp/NNN_name.sql

# Stage 2: Apply inside container
ssh root@91.98.182.243 "docker cp /tmp/NNN_name.sql nammerha-db:/tmp/NNN_name.sql && docker exec nammerha-db psql -U nammerha -d nammerha -f /tmp/NNN_name.sql"
```

## Docker Compose Service Names
| Service | Container | Purpose |
|---|---|---|
| `nammerha-db` | `nammerha-db` | PostgreSQL 16 + PostGIS |
| `nammerha-backend` | `nammerha-backend` | Node.js Express API (port 3001) |
| `nammerha-frontend` | `nammerha-frontend` | Nginx + Vite static assets |
| `nammerha-minio` | `nammerha-minio` | S3-compatible object storage |
| `nammerha-smtp` | `nammerha-smtp` | Postfix SMTP relay |

## Troubleshooting

### "required variable ... is missing a value"
The `.env` file is missing on the server. Extract from running containers:
```bash
ssh root@91.98.182.243 'for c in nammerha-db nammerha-minio nammerha-backend; do docker inspect $c --format "{{json .Config.Env}}" | python3 -c "import sys,json; envs=json.loads(sys.stdin.read()); [print(e) for e in envs if not any(e.startswith(x) for x in [\"PATH=\",\"NODE_\"])]"; done | sort -u > /opt/nammerha/.env'
```

### Git commit fails with husky error
Use `--no-verify` flag: `git commit --no-verify -m "msg"`

### rsync to nammerha.com times out
Use the IP directly: `root@91.98.182.243` — DNS may not resolve SSH correctly.
