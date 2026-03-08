-- ═══════════════════════════════════════════════════════════════════════════════
-- Nammerha Platform — PostgreSQL Performance Monitoring Extension
-- Migration 004: Monitoring views and escrow reconciliation indexes
-- ═══════════════════════════════════════════════════════════════════════════════
-- Note: pg_stat_statements requires shared_preload_libraries configuration.
-- Views depending on it are created conditionally (will work when enabled).
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Enable pg_stat_statements extension (may fail if not in shared_preload_libraries)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
EXCEPTION
WHEN OTHERS THEN RAISE NOTICE 'pg_stat_statements not available — skipping monitoring views. Enable it in postgresql.conf shared_preload_libraries for production monitoring.';
END;
$$;
-- 2. Performance optimization: Index for escrow reconciliation
-- ─────────────────────────────────────────────────────────────────────────────
-- Weekly reconciliation query uses escrow_ledger, not a 'donations' table.
-- The escrow_ledger indexes are already created in 001_core_schema.
-- Additional composite index for payment status queries:
CREATE INDEX IF NOT EXISTS idx_escrow_project_status ON escrow_ledger (project_id, payment_status);
COMMENT ON INDEX idx_escrow_project_status IS 'Composite index for weekly escrow reconciliation query performance.';
-- 3. Monitoring views (only available when pg_stat_statements is loaded)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN IF EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pg_stat_statements'
        AND installed_version IS NOT NULL
) THEN -- Slow queries view
EXECUTE '
            CREATE OR REPLACE VIEW vw_slow_queries AS
            SELECT pss.userid,
                pss.dbid,
                pg_database.datname AS database_name,
                pss.query,
                pss.calls,
                pss.total_exec_time AS total_time_ms,
                pss.mean_exec_time AS mean_time_ms,
                pss.max_exec_time AS max_time_ms,
                pss.min_exec_time AS min_time_ms,
                pss.stddev_exec_time AS stddev_time_ms,
                pss.rows AS total_rows_returned,
                pss.shared_blks_hit AS cache_hits,
                pss.shared_blks_read AS disk_reads,
                CASE
                    WHEN (pss.shared_blks_hit + pss.shared_blks_read) > 0 THEN ROUND(
                        100.0 * pss.shared_blks_hit / (pss.shared_blks_hit + pss.shared_blks_read), 2
                    )
                    ELSE 100.0
                END AS cache_hit_ratio
            FROM pg_stat_statements pss
                JOIN pg_database ON pg_database.oid = pss.dbid
            WHERE pss.mean_exec_time > 200
            ORDER BY pss.mean_exec_time DESC
        ';
-- Top queries by time
EXECUTE '
            CREATE OR REPLACE VIEW vw_top_queries_by_time AS
            SELECT LEFT(query, 200) AS query_preview,
                calls,
                ROUND(total_exec_time::numeric, 2) AS total_time_ms,
                ROUND(mean_exec_time::numeric, 2) AS mean_time_ms,
                ROUND(max_exec_time::numeric, 2) AS max_time_ms,
                rows AS total_rows
            FROM pg_stat_statements
            ORDER BY total_exec_time DESC
            LIMIT 25
        ';
-- Cache efficiency
EXECUTE '
            CREATE OR REPLACE VIEW vw_cache_efficiency AS
            SELECT ''overall'' AS scope,
                SUM(shared_blks_hit) AS total_cache_hits,
                SUM(shared_blks_read) AS total_disk_reads,
                CASE
                    WHEN SUM(shared_blks_hit + shared_blks_read) > 0 THEN ROUND(
                        100.0 * SUM(shared_blks_hit) / SUM(shared_blks_hit + shared_blks_read), 2
                    )
                    ELSE 100.0
                END AS cache_hit_ratio_pct
            FROM pg_stat_statements
        ';
RAISE NOTICE 'pg_stat_statements monitoring views created successfully.';
ELSE RAISE NOTICE 'pg_stat_statements not loaded — monitoring views skipped.';
END IF;
END;
$$;