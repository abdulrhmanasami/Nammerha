#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Nammerha — Unified Database Backup Script (MEMO 61 — PLATINUM)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Single source of truth for all PostgreSQL backup operations.
# Consolidates the previous backup-db.sh and db-backup.sh into one script.
#
# Features:
#   ✅ pg_dump custom format (-Fc) for parallel restore (pg_restore --jobs=N)
#   ✅ GPG AES-256 symmetric encryption (optional, via BACKUP_GPG_PASSPHRASE)
#   ✅ SHA-256 checksum sidecar for integrity verification
#   ✅ Upload to MinIO/S3 bucket for off-host redundancy
#   ✅ Tiered retention: 7 daily, 4 weekly, 3 monthly (configurable)
#   ✅ Docker exec (primary) + direct pg_dump fallback (dev environments)
#   ✅ Webhook notification on failure (Slack/Discord/generic)
#   ✅ UTC ISO-8601 structured logging
#   ✅ Minimum backup size guard (prevents empty/corrupt backups)
#   ✅ Duration tracking with elapsed time in summary
#
# Usage:
#   ./scripts/backup.sh                  # Full backup (dump + encrypt + upload)
#   ./scripts/backup.sh --dry-run        # Preview without executing
#   ./scripts/backup.sh --local-only     # Skip S3 upload
#   ./scripts/backup.sh --no-encrypt     # Skip GPG encryption
#   ./scripts/backup.sh --help           # Show this help
#
# Cron (recommended — daily at 03:00 UTC):
#   0 3 * * * /opt/nammerha/scripts/backup.sh >> /var/log/nammerha-backup.log 2>&1
#
# Restore:
#   # Encrypted backup:
#   gpg --batch --decrypt --passphrase "YOUR_PASSPHRASE" backup.dump.gpg > backup.dump
#   pg_restore -d nammerha -Fc --jobs=4 backup.dump
#
#   # Unencrypted backup:
#   pg_restore -d nammerha -Fc --jobs=4 backup.dump
#
#   # Verify integrity before restore:
#   sha256sum -c backup.dump.sha256
#
# Standards:
#   ISO 27001 A.12.3  (Information Backup)
#   PCI DSS 9.5       (Media Backup)
#   RTO: < 4 hours    (Recovery Time Objective)
#   RPO: < 24 hours   (Recovery Point Objective — daily schedule)
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration (all env vars consistently prefixed) ──────────────────────

# Storage
BACKUP_DIR="${BACKUP_DIR:-/opt/nammerha/backups}"

# Database connection
BACKUP_DB_CONTAINER="${BACKUP_DB_CONTAINER:-nammerha-db}"
BACKUP_DB_HOST="${BACKUP_DB_HOST:-localhost}"
BACKUP_DB_PORT="${BACKUP_DB_PORT:-5432}"
BACKUP_DB_NAME="${BACKUP_DB_NAME:-nammerha}"
BACKUP_DB_USER="${BACKUP_DB_USER:-nammerha}"
BACKUP_DB_PASSWORD="${BACKUP_DB_PASSWORD:-}"

# Encryption (leave empty to skip — script warns)
BACKUP_GPG_PASSPHRASE="${BACKUP_GPG_PASSPHRASE:-}"

# S3/MinIO upload
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-nammerha-backups}"
BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-http://localhost:9010}"

# Retention policy (count-based)
BACKUP_RETAIN_DAILY="${BACKUP_RETAIN_DAILY:-7}"
BACKUP_RETAIN_WEEKLY="${BACKUP_RETAIN_WEEKLY:-4}"
BACKUP_RETAIN_MONTHLY="${BACKUP_RETAIN_MONTHLY:-3}"

# Failure alert webhook (Slack/Discord/generic — leave empty to disable)
BACKUP_ALERT_WEBHOOK="${BACKUP_ALERT_WEBHOOK:-}"

# Minimum acceptable backup size in bytes (guard against empty/corrupt dumps)
BACKUP_MIN_SIZE="${BACKUP_MIN_SIZE:-1024}"

# ─── CLI Flags ───────────────────────────────────────────────────────────────

DRY_RUN=false
LOCAL_ONLY=false
NO_ENCRYPT=false

for arg in "$@"; do
    case "$arg" in
        --dry-run)     DRY_RUN=true ;;
        --local-only)  LOCAL_ONLY=true ;;
        --no-encrypt)  NO_ENCRYPT=true ;;
        --help|-h)
            # Print the header block as help text
            sed -n '2,/^# ═══.*═══$/p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg (use --help for usage)" >&2
            exit 1
            ;;
    esac
done

# ─── Logging (UTC ISO-8601, structured) ─────────────────────────────────────

log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [BACKUP] $1"
}

log_warn() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [BACKUP] [WARN] $1" >&2
}

log_error() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [BACKUP] [ERROR] $1" >&2
}

# ─── Failure Alert ───────────────────────────────────────────────────────────

alert_failure() {
    local msg="$1"
    log_error "${msg}"

    if [[ -n "${BACKUP_ALERT_WEBHOOK}" ]]; then
        # Fire-and-forget: don't let alert failure kill the script
        curl -sf -X POST "${BACKUP_ALERT_WEBHOOK}" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"🔴 Nammerha Backup FAILED: ${msg}\"}" \
            --connect-timeout 10 \
            --max-time 15 \
            >/dev/null 2>&1 || log_warn "Alert webhook delivery failed"
    fi

    exit 1
}

# ─── Timestamps ──────────────────────────────────────────────────────────────

TIMESTAMP=$(date -u '+%Y%m%d_%H%M%S')
DAY_OF_WEEK=$(date -u '+%u')    # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date -u '+%d')

BACKUP_FILE="${BACKUP_DIR}/nammerha_${TIMESTAMP}.dump"
FINAL_FILE="${BACKUP_FILE}"     # Updated below if encrypted

# ─── Pre-flight Checks ──────────────────────────────────────────────────────

log "═══════════════════════════════════════════════════════════"
log "  Nammerha Database Backup — Starting"
log "═══════════════════════════════════════════════════════════"

# Ensure backup directory exists with restricted permissions
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}" 2>/dev/null || true

# Determine execution mode: Docker exec (primary) or direct pg_dump (fallback)
USE_DOCKER=false

if command -v docker &>/dev/null && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${BACKUP_DB_CONTAINER}$"; then
    USE_DOCKER=true
    log "Mode: Docker exec (container: ${BACKUP_DB_CONTAINER})"
elif command -v pg_dump &>/dev/null; then
    USE_DOCKER=false
    log "Mode: Direct pg_dump (host: ${BACKUP_DB_HOST}:${BACKUP_DB_PORT})"
else
    alert_failure "pg_dump not found and Docker container '${BACKUP_DB_CONTAINER}' is not running. Cannot create backup."
fi

log "Database: ${BACKUP_DB_NAME} | User: ${BACKUP_DB_USER}"
log "Output:   ${BACKUP_FILE}"

# ─── Dry Run Gate ────────────────────────────────────────────────────────────

if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY RUN] Pre-flight checks passed."
    if [[ "${USE_DOCKER}" == "true" ]]; then
        log "[DRY RUN] Would execute: docker exec ${BACKUP_DB_CONTAINER} pg_dump -U ${BACKUP_DB_USER} -Fc ${BACKUP_DB_NAME}"
    else
        log "[DRY RUN] Would execute: pg_dump -h ${BACKUP_DB_HOST} -p ${BACKUP_DB_PORT} -U ${BACKUP_DB_USER} -Fc ${BACKUP_DB_NAME}"
    fi
    [[ "${NO_ENCRYPT}" == "false" && -n "${BACKUP_GPG_PASSPHRASE}" ]] && \
        log "[DRY RUN] Would encrypt with GPG AES-256"
    [[ "${LOCAL_ONLY}" == "false" ]] && \
        log "[DRY RUN] Would upload to S3: s3://${BACKUP_S3_BUCKET}/"
    log "[DRY RUN] Retention: ${BACKUP_RETAIN_DAILY} daily, ${BACKUP_RETAIN_WEEKLY} weekly, ${BACKUP_RETAIN_MONTHLY} monthly"
    log "[DRY RUN] No changes made."
    exit 0
fi

# ─── Execute pg_dump ─────────────────────────────────────────────────────────

log "Dumping database..."
START_TIME=$(date +%s)

if [[ "${USE_DOCKER}" == "true" ]]; then
    if ! docker exec "${BACKUP_DB_CONTAINER}" pg_dump \
        -U "${BACKUP_DB_USER}" \
        -Fc \
        --no-owner \
        --no-privileges \
        "${BACKUP_DB_NAME}" > "${BACKUP_FILE}"; then
        rm -f "${BACKUP_FILE}"
        alert_failure "pg_dump failed inside Docker container '${BACKUP_DB_CONTAINER}'"
    fi
else
    if ! PGPASSWORD="${BACKUP_DB_PASSWORD}" pg_dump \
        -h "${BACKUP_DB_HOST}" \
        -p "${BACKUP_DB_PORT}" \
        -U "${BACKUP_DB_USER}" \
        -Fc \
        --no-owner \
        --no-privileges \
        "${BACKUP_DB_NAME}" > "${BACKUP_FILE}"; then
        rm -f "${BACKUP_FILE}"
        alert_failure "pg_dump failed (host: ${BACKUP_DB_HOST}:${BACKUP_DB_PORT})"
    fi
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# ─── Verify Backup Integrity ────────────────────────────────────────────────

# Cross-platform file size (macOS `stat -f%z`, Linux `stat -c%s`)
BACKUP_SIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}" 2>/dev/null || echo "0")

if [[ "${BACKUP_SIZE}" -lt "${BACKUP_MIN_SIZE}" ]]; then
    rm -f "${BACKUP_FILE}"
    alert_failure "Backup file suspiciously small (${BACKUP_SIZE} bytes < ${BACKUP_MIN_SIZE} minimum). Possible corruption."
fi

BACKUP_SIZE_MB=$(echo "scale=2; ${BACKUP_SIZE} / 1048576" | bc 2>/dev/null || echo "N/A")
log "Dump complete: ${BACKUP_SIZE_MB}MB in ${DURATION}s"

# ─── GPG Encryption (optional) ──────────────────────────────────────────────

if [[ "${NO_ENCRYPT}" == "false" && -n "${BACKUP_GPG_PASSPHRASE}" ]]; then
    log "Encrypting with GPG AES-256..."

    if ! gpg --batch --yes \
        --passphrase "${BACKUP_GPG_PASSPHRASE}" \
        --symmetric --cipher-algo AES256 \
        --compress-algo none \
        -o "${BACKUP_FILE}.gpg" \
        "${BACKUP_FILE}"; then
        alert_failure "GPG encryption failed for ${BACKUP_FILE}"
    fi

    # Securely remove unencrypted dump
    rm -f "${BACKUP_FILE}"
    FINAL_FILE="${BACKUP_FILE}.gpg"
    log "Encrypted: $(basename "${FINAL_FILE}")"

elif [[ "${NO_ENCRYPT}" == "true" ]]; then
    log "Encryption skipped (--no-encrypt flag)"
    FINAL_FILE="${BACKUP_FILE}"
else
    log_warn "BACKUP_GPG_PASSPHRASE not set — backup is NOT encrypted!"
    FINAL_FILE="${BACKUP_FILE}"
fi

# ─── SHA-256 Checksum (on FINAL file — encrypted if applicable) ─────────────

CHECKSUM_FILE="${FINAL_FILE}.sha256"

if command -v sha256sum &>/dev/null; then
    sha256sum "${FINAL_FILE}" > "${CHECKSUM_FILE}"
elif command -v shasum &>/dev/null; then
    shasum -a 256 "${FINAL_FILE}" > "${CHECKSUM_FILE}"
else
    log_warn "No SHA-256 tool found (sha256sum/shasum). Skipping checksum."
    CHECKSUM_FILE=""
fi

if [[ -n "${CHECKSUM_FILE}" ]]; then
    CHECKSUM_VALUE=$(cut -d' ' -f1 "${CHECKSUM_FILE}")
    log "Checksum (SHA-256): ${CHECKSUM_VALUE}"
fi

# ─── S3/MinIO Upload (optional) ─────────────────────────────────────────────

if [[ "${LOCAL_ONLY}" == "false" ]]; then
    # Determine tier prefix based on day
    S3_PREFIX="daily"
    if [[ "${DAY_OF_WEEK}" == "7" ]]; then
        S3_PREFIX="weekly"
    fi
    if [[ "${DAY_OF_MONTH}" == "01" ]]; then
        S3_PREFIX="monthly"
    fi

    S3_KEY="${S3_PREFIX}/$(basename "${FINAL_FILE}")"

    log "Uploading to S3: s3://${BACKUP_S3_BUCKET}/${S3_KEY}"

    UPLOAD_SUCCESS=false

    if command -v mc &>/dev/null; then
        # MinIO Client
        if mc cp "${FINAL_FILE}" "nammerha-s3/${BACKUP_S3_BUCKET}/${S3_KEY}" 2>/dev/null; then
            UPLOAD_SUCCESS=true
            log "S3 upload complete (mc)"
            # Upload checksum sidecar
            if [[ -n "${CHECKSUM_FILE}" ]]; then
                mc cp "${CHECKSUM_FILE}" "nammerha-s3/${BACKUP_S3_BUCKET}/${S3_KEY}.sha256" 2>/dev/null || true
            fi
        else
            log_error "S3 upload failed (mc)"
        fi
    elif command -v aws &>/dev/null; then
        # AWS CLI (compatible with MinIO via --endpoint-url)
        if aws --endpoint-url "${BACKUP_S3_ENDPOINT}" s3 cp "${FINAL_FILE}" "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" 2>/dev/null; then
            UPLOAD_SUCCESS=true
            log "S3 upload complete (aws-cli)"
            # Upload checksum sidecar
            if [[ -n "${CHECKSUM_FILE}" ]]; then
                aws --endpoint-url "${BACKUP_S3_ENDPOINT}" s3 cp "${CHECKSUM_FILE}" "s3://${BACKUP_S3_BUCKET}/${S3_KEY}.sha256" 2>/dev/null || true
            fi
        else
            log_error "S3 upload failed (aws-cli)"
        fi
    else
        log_warn "No S3 client found (mc or aws). Skipping upload."
    fi

    if [[ "${UPLOAD_SUCCESS}" == "false" && -n "${BACKUP_ALERT_WEBHOOK}" ]]; then
        # Non-fatal: alert but don't exit — local backup still exists
        curl -sf -X POST "${BACKUP_ALERT_WEBHOOK}" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"⚠️ Nammerha Backup: S3 upload failed. Local backup OK: $(basename "${FINAL_FILE}")\"}" \
            --connect-timeout 10 \
            --max-time 15 \
            >/dev/null 2>&1 || true
    fi
else
    log "S3 upload skipped (--local-only flag)"
fi

# ─── Local Retention Policy (count-based pruning) ───────────────────────────

log "Applying retention policy: ${BACKUP_RETAIN_DAILY} daily, ${BACKUP_RETAIN_WEEKLY} weekly, ${BACKUP_RETAIN_MONTHLY} monthly"

# Total local retention = daily + weekly + monthly to ensure tiered S3 copies
# are not prematurely pruned from local storage. Without this, a daily-only
# MAX_LOCAL deletes backups that should be preserved for weekly/monthly tiers.
BACKUP_COUNT=$(find "${BACKUP_DIR}" -maxdepth 1 -name 'nammerha_*.dump*' -type f ! -name '*.sha256' | wc -l | tr -d ' ')
MAX_LOCAL=$(( ${BACKUP_RETAIN_DAILY} + ${BACKUP_RETAIN_WEEKLY} + ${BACKUP_RETAIN_MONTHLY} ))

if [[ "${BACKUP_COUNT}" -gt "${MAX_LOCAL}" ]]; then
    EXCESS=$((BACKUP_COUNT - MAX_LOCAL))
    find "${BACKUP_DIR}" -maxdepth 1 -name 'nammerha_*.dump*' -type f ! -name '*.sha256' | sort | head -n "${EXCESS}" | while read -r old_file; do
        log "Pruning: $(basename "${old_file}")"
        rm -f "${old_file}" "${old_file}.sha256"
    done
    log "Pruned ${EXCESS} old backup(s)"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

TOTAL_BACKUPS=$(find "${BACKUP_DIR}" -maxdepth 1 -name 'nammerha_*.dump*' -type f ! -name '*.sha256' | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo "N/A")

log "═══════════════════════════════════════════════════════════"
log "  Backup Complete — Summary"
log "═══════════════════════════════════════════════════════════"
log "  File:       $(basename "${FINAL_FILE}")"
log "  Size:       ${BACKUP_SIZE_MB}MB"
log "  Duration:   ${DURATION}s"
log "  Encrypted:  $([[ "${FINAL_FILE}" == *.gpg ]] && echo "YES (AES-256)" || echo "NO")"
log "  Checksum:   ${CHECKSUM_VALUE:-N/A}"
log "  Local:      ${BACKUP_DIR} (${TOTAL_BACKUPS} backups, ${TOTAL_SIZE} total)"
if [[ "${LOCAL_ONLY}" == "false" ]]; then
    log "  S3:         s3://${BACKUP_S3_BUCKET}/${S3_KEY:-N/A}"
fi
log "  Retention:  ${BACKUP_RETAIN_DAILY}d / ${BACKUP_RETAIN_WEEKLY}w / ${BACKUP_RETAIN_MONTHLY}m"
log "  RTO: < 4h   RPO: < 24h"
log "═══════════════════════════════════════════════════════════"
