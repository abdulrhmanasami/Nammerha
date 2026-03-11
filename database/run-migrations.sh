#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Nammerha Platform — Idempotent Database Migration Runner (OPS-4)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Features:
#   • Creates _migrations tracking table automatically
#   • Applies migrations in sequential filename order (001_, 002_, ...)
#   • Skips already-applied migrations (idempotent)
#   • Records SHA-256 checksum for integrity verification
#   • Supports --dry-run for pre-flight inspection
#   • Fails fast on any error (set -euo pipefail)
#   • Logs every step with timestamps
#
# Usage:
#   DATABASE_URL=postgresql://... bash database/run-migrations.sh
#   DATABASE_URL=postgresql://... bash database/run-migrations.sh --dry-run
#
# Docker usage (from production server):
#   docker exec -e DATABASE_URL="$DATABASE_URL" nammerha-backend \
#       bash /app/database/run-migrations.sh
#
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/migrations"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

# ── Validation ───────────────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║  ERROR: DATABASE_URL environment variable is not set.       ║"
    echo "║                                                             ║"
    echo "║  Usage:                                                     ║"
    echo "║    DATABASE_URL=postgresql://... bash run-migrations.sh      ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    exit 1
fi

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
    echo "[ERROR] Migrations directory not found: $MIGRATIONS_DIR"
    exit 1
fi

# ── Logging ──────────────────────────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_ok() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1"
}

log_skip() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏭️  $1"
}

log_err() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1" >&2
}

# ── Database Helper ──────────────────────────────────────────────────────────
run_sql() {
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -qtAX -c "$1"
}

run_sql_file() {
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -qtAX -f "$1"
}

# ── Verify connectivity ─────────────────────────────────────────────────────
log "Verifying database connectivity..."
if ! run_sql "SELECT 1;" > /dev/null 2>&1; then
    log_err "Cannot connect to database. Check DATABASE_URL."
    exit 1
fi

DB_VERSION=$(run_sql "SELECT version();" 2>/dev/null | head -1)
log "Connected to: $DB_VERSION"

# ── Create tracking table ───────────────────────────────────────────────────
log "Ensuring _migrations tracking table exists..."
run_sql "
CREATE TABLE IF NOT EXISTS _migrations (
    id              SERIAL PRIMARY KEY,
    filename        VARCHAR(255) NOT NULL UNIQUE,
    checksum_sha256 VARCHAR(64) NOT NULL,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by      VARCHAR(255) NOT NULL DEFAULT current_user,
    execution_ms    INTEGER
);
COMMENT ON TABLE _migrations IS 'Migration tracking table. Records which SQL files have been applied and their checksums.';
"

# ── Collect migration files ─────────────────────────────────────────────────
MIGRATION_FILES=()
for f in "$MIGRATIONS_DIR"/*.sql; do
    [[ -f "$f" ]] && MIGRATION_FILES+=("$f")
done

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
    log "No migration files found in $MIGRATIONS_DIR"
    exit 0
fi

# Sort by filename (natural sort ensures 001_ < 002_ < ... < 025_)
IFS=$'\n' MIGRATION_FILES=($(sort <<<"${MIGRATION_FILES[*]}")); unset IFS

TOTAL=${#MIGRATION_FILES[@]}
APPLIED=0
SKIPPED=0
FAILED=0

if [[ "$DRY_RUN" == true ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  DRY RUN — No changes will be made"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
fi

# ── Apply each migration ────────────────────────────────────────────────────
for filepath in "${MIGRATION_FILES[@]}"; do
    filename=$(basename "$filepath")
    checksum=$(shasum -a 256 "$filepath" | cut -d' ' -f1)

    # Check if already applied
    existing=$(run_sql "SELECT checksum_sha256 FROM _migrations WHERE filename = '$filename';" 2>/dev/null || echo "")

    if [[ -n "$existing" ]]; then
        # Verify checksum integrity
        if [[ "$existing" != "$checksum" ]]; then
            log_err "CHECKSUM MISMATCH for $filename!"
            log_err "  Recorded: $existing"
            log_err "  Current:  $checksum"
            log_err "  This migration file has been modified after being applied."
            log_err "  This is a CRITICAL integrity violation. Aborting."
            exit 1
        fi
        log_skip "$filename (already applied)"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log "  PENDING: $filename (sha256: ${checksum:0:16}...)"
        APPLIED=$((APPLIED + 1))
        continue
    fi

    # Apply migration
    log "Applying: $filename ..."
    START_MS=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')

    if ! run_sql_file "$filepath"; then
        log_err "FAILED: $filename"
        FAILED=$((FAILED + 1))
        exit 1
    fi

    END_MS=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    DURATION=$((END_MS - START_MS))

    # Record in tracking table
    run_sql "INSERT INTO _migrations (filename, checksum_sha256, execution_ms) VALUES ('$filename', '$checksum', $DURATION);"

    log_ok "$filename (${DURATION}ms)"
    APPLIED=$((APPLIED + 1))
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [[ "$DRY_RUN" == true ]]; then
    echo "  DRY RUN COMPLETE"
    echo "  Total: $TOTAL | Pending: $APPLIED | Already applied: $SKIPPED"
else
    echo "  MIGRATION COMPLETE"
    echo "  Total: $TOTAL | Applied: $APPLIED | Skipped: $SKIPPED | Failed: $FAILED"
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [[ $FAILED -gt 0 ]]; then
    exit 1
fi
