# Nammerha — Disaster Recovery Procedures

## 1. Escrow Balance Protection

### Backup Strategy

- **PostgreSQL PITR** (Point-in-Time Recovery) enabled via WAL archiving
- **Daily automated backups** of `escrow_accounts` and `payment_transactions` tables
- **Backup verification**: Weekly restore test to staging environment

### Recovery Procedure

1. Identify the failure point timestamp
2. Restore from latest base backup
3. Replay WAL logs to the target recovery point
4. Verify escrow balances against payment gateway records
5. Reconcile any discrepancies with gateway transaction logs

### Fund Protection Guarantees

- Escrow funds are tracked in **immutable ledger** entries (no UPDATE/DELETE on `donations` and `escrow` records)
- All balance operations use **database transactions** with SERIALIZABLE isolation
- Payment gateway refunds require **dual admin approval** (not implemented in MVP — planned for Phase 2)

## 2. Database Recovery

### Full Database Recovery

```bash
# 1. Stop the application
systemctl stop nammerha-backend

# 2. Restore from backup
pg_restore -d nammerha_prod -c /backups/nammerha_$(date +%Y%m%d).dump

# 3. Apply pending migrations
psql -d nammerha_prod -f database/migrations/001_initial_schema.sql
psql -d nammerha_prod -f database/migrations/002_user_journeys.sql
psql -d nammerha_prod -f database/migrations/003_payment_transactions.sql

# 4. Restart application
systemctl start nammerha-backend
```

### Table-Level Recovery

For targeted recovery of specific tables (e.g., corrupted `boq_items`):

```bash
pg_restore -d nammerha_prod --table=boq_items /backups/nammerha_latest.dump
```

## 3. Application Recovery

### Backend Service

- **Health endpoint**: `GET /health` monitored by external uptime checker
- **Graceful shutdown**: Process handles SIGTERM, drains connections before exit
- **Auto-restart**: systemd/Docker restart policy `unless-stopped`

### Frontend

- Static assets served via CDN with 30-day cache
- Fallback: Assets embedded in Docker image, no external dependency

## 4. Incident Response

### Severity Levels

| Level         | Description                        | Response Time | Example             |
| ------------- | ---------------------------------- | :-----------: | ------------------- |
| P0 — Critical | Escrow data loss / payment failure |    15 min     | Database corruption |
| P1 — High     | Service outage / auth failure      |    1 hour     | Backend crash loop  |
| P2 — Medium   | Feature degradation                |    4 hours    | Notification delay  |
| P3 — Low      | UI issues / non-blocking bugs      |   24 hours    | Styling glitch      |

### Response Workflow

1. **Detect**: Health check alerts or user report
2. **Triage**: Classify severity (P0-P3)
3. **Mitigate**: Apply immediate fix or rollback
4. **Recover**: Full data recovery if needed
5. **Post-mortem**: Root cause analysis + prevention measures

## 5. Data Integrity Verification

### Escrow Reconciliation (Weekly)

```sql
-- Verify escrow totals match donation sums
SELECT
    p.project_id,
    p.total_funded,
    SUM(d.amount) AS calculated_funded,
    CASE WHEN p.total_funded = SUM(d.amount)
         THEN 'OK' ELSE 'MISMATCH' END AS status
FROM projects p
LEFT JOIN donations d ON d.project_id = p.project_id
GROUP BY p.project_id, p.total_funded;
```

### Audit Trail Integrity

- The `audit_trail` table has no UPDATE/DELETE permissions (INSERT-only)
- Weekly hash verification of audit entries against expected checksums
