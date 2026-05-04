// ============================================================================
// Nammerha Backend — Unit Tests: requireIdempotencyKey Guard (F-001)
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { requireIdempotencyKey, isValidUUIDv4 } from '../require-idempotency-key.middleware';
import type { Request, Response, NextFunction } from 'express';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockReq(headers: Record<string, string | string[] | undefined> = {}): Partial<Request> {
    return { headers: headers as Record<string, string> };
}

function createMockRes(): { res: Partial<Response>; getStatusCode: () => number | null; getBody: () => unknown } {
    let statusCode: number | null = null;
    let body: unknown = null;
    const res: Partial<Response> = {
        status(code: number) {
            statusCode = code;
            return res as Response;
        },
        json(data: unknown) {
            body = data;
            return res as Response;
        },
    };
    return {
        res,
        getStatusCode: () => statusCode,
        getBody: () => body,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('requireIdempotencyKey middleware (F-001)', () => {
    let nextCalled: boolean;
    const next: NextFunction = () => { nextCalled = true; };

    beforeEach(() => { nextCalled = false; });

    // ── Happy Path ──────────────────────────────────────────────────────

    it('should call next() when a valid UUIDv4 key is provided', () => {
        const req = createMockReq({ 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' });
        const { res } = createMockRes();

        requireIdempotencyKey(req as Request, res as Response, next);

        expect(nextCalled).toBe(true);
    });

    it('should call next() when a valid custom-format key is provided', () => {
        const req = createMockReq({ 'idempotency-key': 'payment_abc123_1714819200' });
        const { res } = createMockRes();

        requireIdempotencyKey(req as Request, res as Response, next);

        expect(nextCalled).toBe(true);
    });

    // ── Missing Header ──────────────────────────────────────────────────

    it('should return 400 when no Idempotency-Key header is present', () => {
        const req = createMockReq({});
        const mock = createMockRes();

        requireIdempotencyKey(req as Request, mock.res as Response, next);

        expect(nextCalled).toBe(false);
        expect(mock.getStatusCode()).toBe(400);
        expect((mock.getBody() as Record<string, unknown>)['code']).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('should return 400 when header is undefined', () => {
        const req = createMockReq({ 'idempotency-key': undefined });
        const mock = createMockRes();

        requireIdempotencyKey(req as Request, mock.res as Response, next);

        expect(nextCalled).toBe(false);
        expect(mock.getStatusCode()).toBe(400);
    });

    // ── Type Validation ─────────────────────────────────────────────────

    it('should return 400 when header is an array (duplicate headers)', () => {
        const req = createMockReq({ 'idempotency-key': ['key1', 'key2'] as unknown as string });
        const mock = createMockRes();

        requireIdempotencyKey(req as Request, mock.res as Response, next);

        expect(nextCalled).toBe(false);
        expect(mock.getStatusCode()).toBe(400);
        expect((mock.getBody() as Record<string, unknown>)['code']).toBe('IDEMPOTENCY_KEY_INVALID_TYPE');
    });

    // ── Length Validation ────────────────────────────────────────────────

    it('should return 400 when key is too short (< 8 chars)', () => {
        const req = createMockReq({ 'idempotency-key': 'abc' });
        const mock = createMockRes();

        requireIdempotencyKey(req as Request, mock.res as Response, next);

        expect(nextCalled).toBe(false);
        expect(mock.getStatusCode()).toBe(400);
        expect((mock.getBody() as Record<string, unknown>)['code']).toBe('IDEMPOTENCY_KEY_TOO_SHORT');
    });

    it('should return 400 when key exceeds 128 chars', () => {
        const longKey = 'a'.repeat(129);
        const req = createMockReq({ 'idempotency-key': longKey });
        const mock = createMockRes();

        requireIdempotencyKey(req as Request, mock.res as Response, next);

        expect(nextCalled).toBe(false);
        expect(mock.getStatusCode()).toBe(400);
        expect((mock.getBody() as Record<string, unknown>)['code']).toBe('IDEMPOTENCY_KEY_TOO_LONG');
    });

    it('should accept key at exact minimum length (8 chars)', () => {
        const req = createMockReq({ 'idempotency-key': '12345678' });
        const { res } = createMockRes();

        requireIdempotencyKey(req as Request, res as Response, next);

        expect(nextCalled).toBe(true);
    });

    it('should accept key at exact maximum length (128 chars)', () => {
        const req = createMockReq({ 'idempotency-key': 'a'.repeat(128) });
        const { res } = createMockRes();

        requireIdempotencyKey(req as Request, res as Response, next);

        expect(nextCalled).toBe(true);
    });

    // ── Character Safety (Injection Prevention) ─────────────────────────

    it('should return 400 when key contains NUL byte', () => {
        const req = createMockReq({ 'idempotency-key': 'valid-key\x00injected' });
        const mock = createMockRes();

        requireIdempotencyKey(req as Request, mock.res as Response, next);

        expect(nextCalled).toBe(false);
        expect(mock.getStatusCode()).toBe(400);
        expect((mock.getBody() as Record<string, unknown>)['code']).toBe('IDEMPOTENCY_KEY_INVALID_CHARS');
    });

    it('should return 400 when key contains HTML injection chars', () => {
        const req = createMockReq({ 'idempotency-key': '<script>alert(1)</script>' });
        const mock = createMockRes();

        requireIdempotencyKey(req as Request, mock.res as Response, next);

        expect(nextCalled).toBe(false);
        expect(mock.getStatusCode()).toBe(400);
    });

    it('should return 400 when key contains SQL injection chars', () => {
        const req = createMockReq({ 'idempotency-key': "key'; DROP TABLE--" });
        const mock = createMockRes();

        requireIdempotencyKey(req as Request, mock.res as Response, next);

        expect(nextCalled).toBe(false);
        expect(mock.getStatusCode()).toBe(400);
    });

    it('should accept keys with dots, colons, and underscores', () => {
        const req = createMockReq({ 'idempotency-key': 'payment:2026.05.04_tx_001' });
        const { res } = createMockRes();

        requireIdempotencyKey(req as Request, res as Response, next);

        expect(nextCalled).toBe(true);
    });

    // ── Whitespace Handling ──────────────────────────────────────────────

    it('should trim whitespace from key before validation', () => {
        const req = createMockReq({ 'idempotency-key': '  valid-key-with-spaces  ' });
        const { res } = createMockRes();

        requireIdempotencyKey(req as Request, res as Response, next);

        // Trimmed key = "valid-key-with-spaces" (21 chars) → valid
        expect(nextCalled).toBe(true);
    });
});

// ─── UUID Validator Tests ───────────────────────────────────────────────────

describe('isValidUUIDv4', () => {
    it('should accept valid UUIDv4', () => {
        expect(isValidUUIDv4('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject UUIDv1', () => {
        expect(isValidUUIDv4('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(false);
    });

    it('should reject non-UUID strings', () => {
        expect(isValidUUIDv4('not-a-uuid')).toBe(false);
    });

    it('should reject empty string', () => {
        expect(isValidUUIDv4('')).toBe(false);
    });
});
