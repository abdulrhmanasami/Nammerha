// ============================================================================
// Nammerha Backend — Security Events Service (Ticket 9.3)
// Security incident logging + CEF/JSON export for SIEM integration
// ============================================================================
// SEPARATE from audit_trail (business events).
// security_events captures: login failures, access denied, escrow transitions,
// sanctions screening, dual-use flagging, account locks, suspicious activity.
// ============================================================================
import pool from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SecurityEventType =
    | 'login_success' | 'login_failure' | 'access_denied'
    | 'escrow_locked' | 'escrow_released' | 'escrow_refunded'
    | 'sanctions_screening' | 'sanctions_match_found' | 'dual_use_flagged'
    | 'account_locked' | 'password_changed' | 'kyc_status_changed'
    | 'api_key_created' | 'api_key_revoked'
    | 'suspicious_activity';

export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
    event_id: string;
    event_type: SecurityEventType;
    severity: SecuritySeverity;
    actor_id: string | null;
    actor_role: string | null;
    target_entity_type: string | null;
    target_entity_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    payload: Record<string, unknown>;
    created_at: Date;
}

export interface LogSecurityEventDTO {
    event_type: SecurityEventType;
    severity?: SecuritySeverity;
    actor_id?: string;
    actor_role?: string;
    target_entity_type?: string;
    target_entity_id?: string;
    ip_address?: string;
    user_agent?: string;
    payload?: Record<string, unknown>;
}

// ─── Severity mapping (default per event type) ──────────────────────────────

const DEFAULT_SEVERITY: Record<SecurityEventType, SecuritySeverity> = {
    login_success: 'info',
    login_failure: 'medium',
    access_denied: 'medium',
    escrow_locked: 'low',
    escrow_released: 'high',
    escrow_refunded: 'high',
    sanctions_screening: 'info',
    sanctions_match_found: 'critical',
    dual_use_flagged: 'high',
    account_locked: 'high',
    password_changed: 'low',
    kyc_status_changed: 'medium',
    api_key_created: 'medium',
    api_key_revoked: 'high',
    suspicious_activity: 'critical',
};

// ─── Log Event ──────────────────────────────────────────────────────────────

/**
 * Log a security event. Fire-and-forget safe.
 */
export async function logSecurityEvent(dto: LogSecurityEventDTO): Promise<SecurityEvent> {
    const severity = dto.severity || DEFAULT_SEVERITY[dto.event_type] || 'info';

    const { rows } = await pool.query(
        `INSERT INTO security_events
            (event_type, severity, actor_id, actor_role,
             target_entity_type, target_entity_id,
             ip_address, user_agent, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7::INET, $8, $9)
        RETURNING event_id, event_type, severity, actor_id, actor_role,
                  target_entity_type, target_entity_id, ip_address,
                  user_agent, payload, created_at`,
        [
            dto.event_type,
            severity,
            dto.actor_id || null,
            dto.actor_role || null,
            dto.target_entity_type || null,
            dto.target_entity_id || null,
            dto.ip_address || null,
            dto.user_agent || null,
            JSON.stringify(dto.payload || {}),
        ]
    );

    return rows[0];
}

// ─── Query Events ───────────────────────────────────────────────────────────

/**
 * Query security events with filters.
 */
export async function getSecurityEvents(
    filters: {
        event_type?: SecurityEventType;
        severity?: SecuritySeverity;
        actor_id?: string;
        from_date?: string;
        to_date?: string;
    },
    limit = 100,
    offset = 0
): Promise<{ events: SecurityEvent[]; total: number }> {
    // M-001 FIX: Explicit column list — prevents schema drift.
    let sql = `SELECT event_id, event_type, severity, actor_id, actor_role,
                      target_entity_type, target_entity_id, ip_address,
                      user_agent, payload, created_at
               FROM security_events WHERE 1=1`;
    let countSql = `SELECT COUNT(*) FROM security_events WHERE 1=1`;
    const params: unknown[] = [];
    const countParams: unknown[] = [];
    let paramIdx = 1;

    if (filters.event_type) {
        const clause = ` AND event_type = $${paramIdx}`;
        sql += clause;
        countSql += clause;
        params.push(filters.event_type);
        countParams.push(filters.event_type);
        paramIdx++;
    }
    if (filters.severity) {
        const clause = ` AND severity = $${paramIdx}`;
        sql += clause;
        countSql += clause;
        params.push(filters.severity);
        countParams.push(filters.severity);
        paramIdx++;
    }
    if (filters.actor_id) {
        const clause = ` AND actor_id = $${paramIdx}`;
        sql += clause;
        countSql += clause;
        params.push(filters.actor_id);
        countParams.push(filters.actor_id);
        paramIdx++;
    }
    if (filters.from_date) {
        const clause = ` AND created_at >= $${paramIdx}`;
        sql += clause;
        countSql += clause;
        params.push(filters.from_date);
        countParams.push(filters.from_date);
        paramIdx++;
    }
    if (filters.to_date) {
        const clause = ` AND created_at <= $${paramIdx}`;
        sql += clause;
        countSql += clause;
        params.push(filters.to_date);
        countParams.push(filters.to_date);
        paramIdx++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(Math.min(limit, 500), offset);

    const [eventsRes, countRes] = await Promise.all([
        pool.query(sql, params),
        pool.query(countSql, countParams),
    ]);

    return {
        events: eventsRes.rows,
        total: parseInt(countRes.rows[0].count as string, 10),
    };
}

// ─── CEF Export ─────────────────────────────────────────────────────────────

/**
 * Export security events in ArcSight Common Event Format (CEF).
 * Format: CEF:0|Nammerha|Platform|1.0|event_type|severity|msg=...
 */
export async function exportCEF(
    from_date?: string,
    to_date?: string,
    limit = 1000
): Promise<string> {
    // M-001 FIX: Explicit column list — prevents schema drift.
    let sql = `SELECT event_id, event_type, severity, actor_id, actor_role,
                      target_entity_type, target_entity_id, ip_address,
                      user_agent, payload, created_at
               FROM security_events WHERE 1=1`;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (from_date) {
        sql += ` AND created_at >= $${paramIdx}`;
        params.push(from_date);
        paramIdx++;
    }
    if (to_date) {
        sql += ` AND created_at <= $${paramIdx}`;
        params.push(to_date);
        paramIdx++;
    }

    sql += ` ORDER BY created_at ASC LIMIT $${paramIdx}`;
    params.push(Math.min(limit, 10000));

    const { rows } = await pool.query(sql, params);

    // Map severity to CEF numeric
    const severityMap: Record<SecuritySeverity, number> = {
        info: 1,
        low: 3,
        medium: 5,
        high: 7,
        critical: 10,
    };

    const cefLines = rows.map((event: SecurityEvent) => {
        const sev = severityMap[event.severity] || 5;
        const payload = typeof event.payload === 'string'
            ? event.payload
            : JSON.stringify(event.payload);

        return [
            `CEF:0`,
            `Nammerha`,
            `Platform`,
            `1.0`,
            event.event_type,
            event.event_type.replace(/_/g, ' '),
            sev,
            `rt=${new Date(event.created_at).toISOString()}`,
            `suser=${event.actor_id || 'system'}`,
            `src=${event.ip_address || 'unknown'}`,
            `dst=${event.target_entity_type || ''}:${event.target_entity_id || ''}`,
            `msg=${payload}`,
        ].join('|');
    });

    return cefLines.join('\n');
}

/**
 * Export security events as structured JSON (for SIEM).
 */
export async function exportJSON(
    from_date?: string,
    to_date?: string,
    limit = 1000
): Promise<SecurityEvent[]> {
    // M-001 FIX: Explicit column list — prevents schema drift.
    let sql = `SELECT event_id, event_type, severity, actor_id, actor_role,
                      target_entity_type, target_entity_id, ip_address,
                      user_agent, payload, created_at
               FROM security_events WHERE 1=1`;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (from_date) {
        sql += ` AND created_at >= $${paramIdx}`;
        params.push(from_date);
        paramIdx++;
    }
    if (to_date) {
        sql += ` AND created_at <= $${paramIdx}`;
        params.push(to_date);
        paramIdx++;
    }

    sql += ` ORDER BY created_at ASC LIMIT $${paramIdx}`;
    params.push(Math.min(limit, 10000));

    const { rows } = await pool.query(sql, params);
    return rows;
}
