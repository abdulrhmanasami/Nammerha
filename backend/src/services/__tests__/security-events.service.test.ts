// ============================================================================
// Nammerha — Security Events Service Unit Tests (IMP-001)
// ============================================================================
// SIEM-grade security incident logging + CEF/JSON export.
// Covers: logSecurityEvent, getSecurityEvents, exportCEF, exportJSON
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPoolQuery = vi.fn();

vi.mock('../../config/database', () => ({
  default: { query: (...args: unknown[]) => mockPoolQuery(...args), end: vi.fn() },
}));

import {
  logSecurityEvent,
  getSecurityEvents,
  exportCEF,
  exportJSON,
} from '../security-events.service';

describe('Security Events Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockReset();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('logSecurityEvent', () => {
    it('should insert event with default severity from type mapping', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            event_id: 'evt-1',
            event_type: 'login_failure',
            severity: 'medium',
            actor_id: 'u1',
            created_at: new Date(),
          },
        ],
      });

      const event = await logSecurityEvent({
        event_type: 'login_failure',
        actor_id: 'u1',
        ip_address: '203.0.113.1',
      });

      expect(event.severity).toBe('medium');
      const params = mockPoolQuery.mock.calls[0]?.[1] as unknown[];
      expect(params?.[0]).toBe('login_failure');
      expect(params?.[1]).toBe('medium'); // default from mapping
    });

    it('should use custom severity when provided', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ event_id: 'evt-2', severity: 'critical' }],
      });

      const event = await logSecurityEvent({
        event_type: 'login_failure',
        severity: 'critical', // override default 'medium'
        actor_id: 'u1',
      });

      expect(event.severity).toBe('critical');
    });

    it('should default severity for sanctions_match_found to critical', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ event_id: 'evt-3', severity: 'critical', event_type: 'sanctions_match_found' }],
      });

      await logSecurityEvent({ event_type: 'sanctions_match_found', actor_id: 'sys' });

      const params = mockPoolQuery.mock.calls[0]?.[1] as unknown[];
      expect(params?.[1]).toBe('critical');
    });

    it('should serialize payload as JSON', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ event_id: 'evt-4' }] });

      await logSecurityEvent({
        event_type: 'suspicious_activity',
        payload: { reason: 'brute_force', attempts: 15 },
      });

      const params = mockPoolQuery.mock.calls[0]?.[1] as unknown[];
      const payloadStr = params?.[8] as string;
      expect(JSON.parse(payloadStr)).toEqual({ reason: 'brute_force', attempts: 15 });
    });

    it('should cast ip_address as INET type', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ event_id: 'evt-5' }] });

      await logSecurityEvent({
        event_type: 'login_success',
        ip_address: '203.0.113.42',
      });

      const sql = mockPoolQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('$7::INET');
    });
  });

  describe('getSecurityEvents', () => {
    it('should apply all filters with dynamic parameterization', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await getSecurityEvents({
        event_type: 'login_failure',
        severity: 'high',
        actor_id: 'u1',
        from_date: '2026-01-01',
        to_date: '2026-12-31',
      });

      const sql = mockPoolQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('event_type = $1');
      expect(sql).toContain('severity = $2');
      expect(sql).toContain('actor_id = $3');
      expect(sql).toContain('created_at >= $4');
      expect(sql).toContain('created_at <= $5');
    });

    it('should enforce max limit of 500', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await getSecurityEvents({}, 9999);

      const params = mockPoolQuery.mock.calls[0]?.[1] as unknown[];
      expect(params?.[0]).toBe(500);
    });

    it('should run events and count queries in parallel', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ event_id: 'e1' }] })
        .mockResolvedValueOnce({ rows: [{ count: '42' }] });

      const { events, total } = await getSecurityEvents({});

      expect(events).toHaveLength(1);
      expect(total).toBe(42);
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('should use explicit column list (M-001)', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await getSecurityEvents({});

      const sql = mockPoolQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('event_id, event_type, severity');
      expect(sql).not.toContain('SELECT *');
    });
  });

  describe('exportCEF', () => {
    it('should produce ArcSight CEF-formatted lines', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            event_id: 'evt-1',
            event_type: 'login_failure',
            severity: 'medium',
            actor_id: 'u1',
            actor_role: 'user',
            target_entity_type: 'auth',
            target_entity_id: null,
            ip_address: '203.0.113.1',
            user_agent: 'Mozilla/5.0',
            payload: { attempts: 5 },
            created_at: new Date('2026-03-15T10:00:00Z'),
          },
        ],
      });

      const cef = await exportCEF();

      expect(cef).toContain('CEF:0');
      expect(cef).toContain('Nammerha');
      expect(cef).toContain('login_failure');
      expect(cef).toContain('suser=u1');
      expect(cef).toContain('src=203.0.113.1');
    });

    it('should map severity to CEF numeric (critical=10)', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            event_id: 'evt-2',
            event_type: 'sanctions_match_found',
            severity: 'critical',
            actor_id: null,
            ip_address: null,
            payload: {},
            created_at: new Date(),
          },
        ],
      });

      const cef = await exportCEF();

      expect(cef).toContain('|10|'); // critical = 10
    });

    it('should enforce max limit of 10000', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await exportCEF(undefined, undefined, 99999);

      const params = mockPoolQuery.mock.calls[0]?.[1] as unknown[];
      expect(params?.[0]).toBe(10000);
    });

    it('should return empty string for no events', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const cef = await exportCEF();

      expect(cef).toBe('');
    });
  });

  describe('exportJSON', () => {
    it('should return structured events for SIEM', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { event_id: 'e1', event_type: 'escrow_released', severity: 'high' },
          { event_id: 'e2', event_type: 'login_success', severity: 'info' },
        ],
      });

      const events = await exportJSON();

      expect(events).toHaveLength(2);
    });

    it('should apply date range filters', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await exportJSON('2026-01-01', '2026-06-30');

      const sql = mockPoolQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain('created_at >= $1');
      expect(sql).toContain('created_at <= $2');
    });
  });
});
