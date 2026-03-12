// ============================================================================
// Nammerha — Email Service Unit Tests (FA-NMR-2026-005)
// Tests template rendering, XSS escaping, non-throwing delivery, and convenience wrappers
//
// Coverage:
//   1. sendEmail — non-throwing design (never crashes caller)
//   2. sendEmail — graceful degradation when SMTP not configured
//   3. sendEmail — template rendering with variable substitution
//   4. sendEmail — XSS escaping in template variables
//   5. sendVerificationEmail — convenience wrapper
//   6. sendPasswordResetEmail — convenience wrapper
//   7. sendSecurityAlertEmail — convenience wrapper with metadata
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Logger ────────────────────────────────────────────────────────────
vi.mock('../../utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Mock nodemailer ────────────────────────────────────────────────────────
const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn().mockReturnValue({
    sendMail: mockSendMail,
});

vi.mock('nodemailer', () => ({
    createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

// ─── Import type-only reference (functions are re-imported dynamically per test) ──
import type {} from '../../services/email.service';

// ═══════════════════════════════════════════════════════════════════════════
// Email Service Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Email Service', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the singleton transporter between tests
        vi.resetModules();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    // ─── sendEmail — Non-Throwing Design ────────────────────────────────
    describe('sendEmail() — Non-Throwing Design', () => {
        it('should return failure when SMTP_HOST is not configured', async () => {
            delete process.env['SMTP_HOST'];

            // Need to re-import to get fresh singleton
            const { sendEmail: freshSendEmail } = await import('../../services/email.service');

            const result = await freshSendEmail({
                to: 'user@example.com',
                subject: 'Test',
                template: 'verification',
                variables: { verification_url: 'https://nammerha.com/verify?token=abc' },
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('not available');
        });

        it('should return failure (not throw) when sendMail rejects', async () => {
            process.env['SMTP_HOST'] = 'smtp.nammerha.com';
            mockSendMail.mockRejectedValueOnce(new Error('Connection refused'));

            const { sendEmail: freshSendEmail } = await import('../../services/email.service');
            const result = await freshSendEmail({
                to: 'user@example.com',
                subject: 'Test',
                template: 'verification',
                variables: { verification_url: 'https://nammerha.com/verify?token=abc' },
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Connection refused');
        });

        it('should return success when email is sent', async () => {
            process.env['SMTP_HOST'] = 'smtp.nammerha.com';
            mockSendMail.mockResolvedValueOnce({ messageId: 'msg-001' });

            const { sendEmail: freshSendEmail } = await import('../../services/email.service');
            const result = await freshSendEmail({
                to: 'user@example.com',
                subject: 'Verify Your Email — Nammerha',
                template: 'verification',
                variables: { verification_url: 'https://nammerha.com/verify?token=abc123' },
            });

            expect(result.success).toBe(true);
            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'user@example.com',
                    subject: 'Verify Your Email — Nammerha',
                    html: expect.stringContaining('Verify Your Email'),
                    text: expect.any(String),
                })
            );
        });
    });

    // ─── Template Rendering ─────────────────────────────────────────────
    describe('Template Rendering', () => {
        it('should substitute {{variables}} in verification template', async () => {
            process.env['SMTP_HOST'] = 'smtp.nammerha.com';
            mockSendMail.mockResolvedValueOnce({});

            const { sendEmail: freshSendEmail } = await import('../../services/email.service');
            await freshSendEmail({
                to: 'user@example.com',
                subject: 'Test',
                template: 'verification',
                variables: { verification_url: 'https://nammerha.com/verify?token=UNIQUE_TOKEN' },
            });

            const firstCall = mockSendMail.mock.calls[0] as [{html: string}];
            const htmlArg = firstCall[0].html;
            expect(htmlArg).toContain('UNIQUE_TOKEN');
            expect(htmlArg).not.toContain('{{verification_url}}');
        });

        it('should escape XSS in template variables', async () => {
            process.env['SMTP_HOST'] = 'smtp.nammerha.com';
            mockSendMail.mockResolvedValueOnce({});

            const { sendEmail: freshSendEmail } = await import('../../services/email.service');
            await freshSendEmail({
                to: 'user@example.com',
                subject: 'Test',
                template: 'security-alert',
                variables: {
                    alert_title: '<script>alert("xss")</script>',
                    alert_body: 'Legitimate body',
                    timestamp: '2026-03-12T04:30:00Z',
                    ip_address: '192.168.1.1',
                },
            });

            const firstCall = mockSendMail.mock.calls[0] as [{html: string}];
            const htmlArg = firstCall[0].html;
            // XSS payload should be escaped, not raw
            expect(htmlArg).not.toContain('<script>');
            expect(htmlArg).toContain('&lt;script&gt;');
        });

        it('should render password-reset template with reset_url', async () => {
            process.env['SMTP_HOST'] = 'smtp.nammerha.com';
            mockSendMail.mockResolvedValueOnce({});

            const { sendEmail: freshSendEmail } = await import('../../services/email.service');
            await freshSendEmail({
                to: 'user@example.com',
                subject: 'Reset',
                template: 'password-reset',
                variables: { reset_url: 'https://nammerha.com/reset?token=RST123' },
            });

            const firstCall = mockSendMail.mock.calls[0] as [{html: string}];
            const htmlArg = firstCall[0].html;
            expect(htmlArg).toContain('Reset Your Password');
            expect(htmlArg).toContain('RST123');
        });
    });

    // ─── Convenience Wrappers ───────────────────────────────────────────
    describe('Convenience Wrappers', () => {
        it('sendVerificationEmail() should call sendEmail with verification template', async () => {
            process.env['SMTP_HOST'] = 'smtp.nammerha.com';
            mockSendMail.mockResolvedValueOnce({});

            const { sendVerificationEmail: freshFn } = await import('../../services/email.service');
            const result = await freshFn(
                'new@user.com',
                'https://nammerha.com/verify?token=VER123'
            );

            expect(result.success).toBe(true);
            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: 'Verify Your Email — Nammerha',
                })
            );
        });

        it('sendPasswordResetEmail() should use password-reset template', async () => {
            process.env['SMTP_HOST'] = 'smtp.nammerha.com';
            mockSendMail.mockResolvedValueOnce({});

            const { sendPasswordResetEmail: freshFn } = await import('../../services/email.service');
            const result = await freshFn(
                'user@example.com',
                'https://nammerha.com/reset?token=PWD456'
            );

            expect(result.success).toBe(true);
            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: 'Password Reset — Nammerha',
                })
            );
        });

        it('sendSecurityAlertEmail() should include alert metadata', async () => {
            process.env['SMTP_HOST'] = 'smtp.nammerha.com';
            mockSendMail.mockResolvedValueOnce({});

            const { sendSecurityAlertEmail: freshFn } = await import('../../services/email.service');
            const result = await freshFn(
                'admin@nammerha.com',
                'API Key Created',
                'A new API key was generated for your account.',
                '203.0.113.42'
            );

            expect(result.success).toBe(true);
            const firstCall = mockSendMail.mock.calls[0] as [{html: string}];
            const htmlArg = firstCall[0].html;
            expect(htmlArg).toContain('API Key Created');
            expect(htmlArg).toContain('203.0.113.42');
        });
    });
});
