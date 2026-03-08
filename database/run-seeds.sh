#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Nammerha — Database Seed Runner
# ═══════════════════════════════════════════════════════════════════════════════
# Applies seed SQL files to the PostgreSQL database in order.
#
# Usage:
#   ./database/run-seeds.sh                    # Uses DATABASE_URL from .env
#   ./database/run-seeds.sh "postgresql://..."  # Uses explicit connection string
#
# Requirements: psql (PostgreSQL client)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEEDS_DIR="${SCRIPT_DIR}/seeds"

# ─── Connection String ───────────────────────────────────────────────────────
if [ -n "${1:-}" ]; then
    DB_URL="$1"
elif [ -n "${DATABASE_URL:-}" ]; then
    DB_URL="$DATABASE_URL"
elif [ -f "${SCRIPT_DIR}/../backend/.env" ]; then
    # Extract DATABASE_URL from .env file
    DB_URL=$(grep -E '^DATABASE_URL=' "${SCRIPT_DIR}/../backend/.env" | cut -d '=' -f2-)
    if [ -z "$DB_URL" ]; then
        echo "❌ DATABASE_URL not found in backend/.env"
        exit 1
    fi
else
    echo "❌ No database connection string found."
    echo "   Provide as argument, set DATABASE_URL env var, or create backend/.env"
    exit 1
fi

# ─── Verify psql ─────────────────────────────────────────────────────────────
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Install PostgreSQL client:"
    echo "   brew install postgresql  # macOS"
    echo "   apt install postgresql-client  # Ubuntu"
    exit 1
fi

# ─── Apply Seeds ─────────────────────────────────────────────────────────────
echo "🌱 Nammerha Seed Runner"
echo "   Target: ${DB_URL%%@*}@***"
echo ""

if [ ! -d "$SEEDS_DIR" ]; then
    echo "❌ Seeds directory not found: $SEEDS_DIR"
    exit 1
fi

SEED_FILES=$(find "$SEEDS_DIR" -name '*.sql' -type f | sort)
SEED_COUNT=$(echo "$SEED_FILES" | wc -l | tr -d ' ')

if [ -z "$SEED_FILES" ]; then
    echo "⚠️  No seed files found in $SEEDS_DIR"
    exit 0
fi

echo "📦 Found $SEED_COUNT seed file(s):"
echo ""

APPLIED=0
FAILED=0

for seed_file in $SEED_FILES; do
    filename=$(basename "$seed_file")
    echo -n "   → $filename ... "
    
    if psql "$DB_URL" -f "$seed_file" --quiet --no-psqlrc 2>/dev/null; then
        echo "✅"
        ((APPLIED++))
    else
        echo "❌ FAILED"
        ((FAILED++))
        echo "     Error applying $filename. Check the SQL syntax and database state."
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌱 Seeds: $APPLIED applied, $FAILED failed (of $SEED_COUNT total)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
