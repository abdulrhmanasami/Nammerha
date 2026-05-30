#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Nammerha — Demo Seed Data Runner
# Populates production DB with realistic Syrian reconstruction data
# ═══════════════════════════════════════════════════════════
set -e

SEED_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST must be set}"
DB_CONTAINER="nammerha-db"

echo "🌱 Nammerha Demo Seed — Starting..."
echo ""

for f in "$SEED_DIR"/01-users.sql "$SEED_DIR"/02-projects.sql "$SEED_DIR"/03-operations.sql; do
  fname=$(basename "$f")
  echo "📦 Deploying $fname..."
  scp "$f" "$SERVER:/tmp/$fname"
  ssh "$SERVER" "docker exec -i $DB_CONTAINER psql -U nammerha -d nammerha < /tmp/$fname"
  echo "   ✅ $fname applied"
done

echo ""
echo "🔍 Verifying..."
ssh "$SERVER" "docker exec $DB_CONTAINER psql -U nammerha -d nammerha -c \"
SELECT 'users' as tbl, COUNT(*) FROM users
UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'milestones', COUNT(*) FROM project_milestones
UNION ALL SELECT 'boq_items', COUNT(*) FROM itemized_boq
UNION ALL SELECT 'bids', COUNT(*) FROM contractor_bids
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'oracle_prices', COUNT(*) FROM pricing_oracle_entries
ORDER BY 1;\""

echo ""
echo "🏆 Demo seed complete!"
