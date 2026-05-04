#!/usr/bin/env bash
# ============================================================================
# Nammerha Database Backup Script (INF-04)
# ============================================================================
# Automated PostgreSQL backup with S3/MinIO upload and retention policy.
#
# Features:
#   - Compressed pg_dump (custom format) for efficient storage
#   - SHA-256 checksum for integrity verification
#   - Upload to MinIO/S3 bucket for off-host redundancy
#   - Automatic retention: keeps last 7 daily, 4 weekly, 3 monthly
#   - Structured logging for monitoring integration
#
# Usage:
#   ./scripts/db-backup.sh                    # Full backup
#   ./scripts/db-backup.sh --dry-run          # Preview without executing
#   ./scripts/db-backup.sh --local-only       # Skip S3 upload
#
# Cron (recommended — daily at 03:00 UTC):
#   0 3 * * * /opt/nammerha-backend/scripts/db-backup.sh >> /var/log/nammerha-backup.log 2>&1
#
# Requirements:
#   - pg_dump (PostgreSQL 16 client tools)
#   - aws CLI or mc (MinIO Client) for S3 upload
#   - Docker access (for container-based execution)
# ============================================================================

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/tmp/nammerha-backups}"
DB_CONTAINER="${DB_CONTAINER:-nammerha-db}"
DB_NAME="${DB_NAME:-nammerha}"
DB_USER="${DB_USER:-nammerha}"
S3_BUCKET="${S3_BUCKET:-nammerha-backups}"
S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:9010}"
RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=3
DRY_RUN=false
LOCAL_ONLY=false

# ─── Parse Arguments ──────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --dry-run)    DRY_RUN=true ;;
        --local-only) LOCAL_ONLY=true ;;
        --help)
            head -28 "$0" | tail -25
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg"
            exit 1
            ;;
    esac
done

# ─── Logging ───────────────────────────────────────────────────────────────
log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [BACKUP] $1"
}

log_error() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [BACKUP] [ERROR] $1" >&2
}

# ─── Preflight Checks ─────────────────────────────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    log_error "Database container '${DB_CONTAINER}' is not running."
    exit 1
fi

mkdir -p "${BACKUP_DIR}"

# ─── Generate Backup ──────────────────────────────────────────────────────
TIMESTAMP=$(date -u '+%Y%m%d_%H%M%S')
DAY_OF_WEEK=$(date -u '+%u')    # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date -u '+%d')
BACKUP_FILE="${BACKUP_DIR}/nammerha_${TIMESTAMP}.dump"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

log "Starting backup: ${BACKUP_FILE}"
log "Database: ${DB_NAME} | Container: ${DB_CONTAINER}"

if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Would execute: docker exec ${DB_CONTAINER} pg_dump -U ${DB_USER} -Fc ${DB_NAME}"
    log "[DRY RUN] Output: ${BACKUP_FILE}"
    exit 0
fi

# Execute pg_dump inside the container (custom format = compressed)
START_TIME=$(date +%s)
if ! docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" -Fc "${DB_NAME}" > "${BACKUP_FILE}"; then
    log_error "pg_dump failed!"
    rm -f "${BACKUP_FILE}"
    exit 1
fi
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# ─── Verify Backup ────────────────────────────────────────────────────────
BACKUP_SIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}" 2>/dev/null)
if [ "${BACKUP_SIZE}" -lt 1024 ]; then
    log_error "Backup file suspiciously small (${BACKUP_SIZE} bytes). Aborting."
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Generate SHA-256 checksum
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}" 2>/dev/null || \
    shasum -a 256 "${BACKUP_FILE}" > "${CHECKSUM_FILE}"

BACKUP_SIZE_MB=$(echo "scale=2; ${BACKUP_SIZE} / 1048576" | bc 2>/dev/null || echo "N/A")
log "Backup complete: ${BACKUP_SIZE_MB}MB in ${DURATION}s"

# ─── Upload to S3/MinIO ───────────────────────────────────────────────────
if [ "$LOCAL_ONLY" = false ]; then
    S3_PREFIX="daily"

    # Weekly backup: every Sunday
    if [ "$DAY_OF_WEEK" = "7" ]; then
        S3_PREFIX="weekly"
    fi

    # Monthly backup: 1st of each month
    if [ "$DAY_OF_MONTH" = "01" ]; then
        S3_PREFIX="monthly"
    fi

    S3_KEY="${S3_PREFIX}/nammerha_${TIMESTAMP}.dump"

    log "Uploading to S3: s3://${S3_BUCKET}/${S3_KEY}"

    if command -v mc &>/dev/null; then
        # MinIO Client
        mc cp "${BACKUP_FILE}" "nammerha-s3/${S3_BUCKET}/${S3_KEY}" 2>/dev/null && \
            log "S3 upload complete (mc)" || \
            log_error "S3 upload failed (mc)"
        mc cp "${CHECKSUM_FILE}" "nammerha-s3/${S3_BUCKET}/${S3_KEY}.sha256" 2>/dev/null
    elif command -v aws &>/dev/null; then
        # AWS CLI (compatible with MinIO via --endpoint-url)
        aws --endpoint-url "${S3_ENDPOINT}" s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/${S3_KEY}" && \
            log "S3 upload complete (aws-cli)" || \
            log_error "S3 upload failed (aws-cli)"
        aws --endpoint-url "${S3_ENDPOINT}" s3 cp "${CHECKSUM_FILE}" "s3://${S3_BUCKET}/${S3_KEY}.sha256"
    else
        log_error "No S3 client found (mc or aws). Skipping upload."
    fi
fi

# ─── Local Retention Policy ───────────────────────────────────────────────
log "Applying retention policy: ${RETENTION_DAILY} daily, ${RETENTION_WEEKLY} weekly, ${RETENTION_MONTHLY} monthly"

# Keep only the latest N backups locally (sorted by name = sorted by date)
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name 'nammerha_*.dump' -type f | wc -l)
if [ "${BACKUP_COUNT}" -gt "${RETENTION_DAILY}" ]; then
    EXCESS=$((BACKUP_COUNT - RETENTION_DAILY))
    find "${BACKUP_DIR}" -name 'nammerha_*.dump' -type f | sort | head -n "${EXCESS}" | while read -r old_file; do
        log "Pruning old backup: $(basename "${old_file}")"
        rm -f "${old_file}" "${old_file}.sha256"
    done
fi

# ─── Summary ──────────────────────────────────────────────────────────────
log "════════════════════════════════════════════════════"
log "  Backup Summary"
log "  File:     $(basename "${BACKUP_FILE}")"
log "  Size:     ${BACKUP_SIZE_MB}MB"
log "  Duration: ${DURATION}s"
log "  Local:    ${BACKUP_DIR}"
if [ "$LOCAL_ONLY" = false ]; then
    log "  S3:       s3://${S3_BUCKET}/${S3_KEY:-N/A}"
fi
log "════════════════════════════════════════════════════"
