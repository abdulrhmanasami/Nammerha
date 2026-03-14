// ============================================================================
// Nammerha Backend — Email Service (Shared)
// ============================================================================
// Standalone email service for transactional emails: verification,
// password reset, and security alerts. Used by auth.routes.ts and
// api-keys.service.ts. Wraps nodemailer with branded HTML templates.
//
// SMTP config via environment variables:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
//
// Non-throwing: failed emails are logged but never crash callers.
// ============================================================================
import type { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type EmailTemplate = 'verification' | 'password-reset' | 'security-alert';

export interface SendEmailOptions {
    to: string;
    subject: string;
    template: EmailTemplate;
    /** Template-specific variables injected into the HTML body */
    variables: Record<string, string>;
}

// ─── Singleton Transporter ──────────────────────────────────────────────────

let _transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter | null> {
    if (_transporter) {
        return _transporter;
    }

    const host = process.env['SMTP_HOST'];
    if (!host) {
        logger.warn('SMTP_HOST not configured — email delivery disabled');
        return null;
    }

    try {
        const nodemailer = await import('nodemailer');

        const transportConfig: Record<string, unknown> = {
            host,
            port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
            secure: process.env['SMTP_SECURE'] === 'true',
            // FIX-EMAIL-001: Accept self-signed certificates from internal SMTP container.
            // The nammerha-smtp Postfix container on the private Docker network uses a
            // self-signed cert for STARTTLS. Without this, Node.js rejects the connection
            // with "self-signed certificate" error and ALL emails fail silently.
            tls: {
                rejectUnauthorized: false,
            },
        };

        const user = process.env['SMTP_USER'];
        const pass = process.env['SMTP_PASS'];
        if (user && pass) {
            transportConfig['auth'] = { user, pass };
        }

        _transporter = nodemailer.createTransport(transportConfig);
        logger.info('SMTP transport initialized', { host, port: transportConfig['port'] });
        return _transporter;
    } catch (err) {
        logger.error('Failed to initialize SMTP transport', { error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

// ─── HTML Templates ─────────────────────────────────────────────────────────

function getFromAddress(): string {
    return process.env['SMTP_FROM'] ?? 'noreply@nammerha.com';
}

/**
 * Base HTML wrapper with Nammerha branding.
 * Dark header with logo area, white content body, grey footer.
 */
function wrapInLayout(content: string): string {
    return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Plus Jakarta Sans','Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:28px 32px;text-align:center;">
  <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Nammerha</h1>
  <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">National Reconstruction Platform</p>
</td></tr>

<!-- Content -->
<tr><td style="padding:32px;">
${content}
</td></tr>

<!-- Footer -->
<tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
  <p style="margin:0;color:#94a3b8;font-size:11px;">
    This is an automated message from Nammerha. Please do not reply to this email.
  </p>
  <p style="margin:6px 0 0;color:#cbd5e1;font-size:10px;">
    © ${new Date().getFullYear()} Nammerha — Rebuilding Communities with Transparency
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * Renders a template with variables substituted into placeholders.
 * Placeholders use `{{key}}` syntax for safety.
 */
function renderTemplate(template: EmailTemplate, variables: Record<string, string>): string {
    let html: string;

    switch (template) {
        case 'verification':
            html = `
<h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;">Verify Your Email</h2>
<p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
  Welcome to Nammerha! Please verify your email address to activate your account
  and gain full access to the reconstruction platform.
</p>
<div style="text-align:center;margin:24px 0;">
  <a href="{{verification_url}}" 
     style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);
            color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;
            font-size:15px;font-weight:600;letter-spacing:0.3px;
            box-shadow:0 2px 8px rgba(37,99,235,0.3);">
    Verify Email Address
  </a>
</div>
<p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">
  This link expires in 24 hours. If you did not create an account, please ignore this email.
</p>
<p style="margin:12px 0 0;color:#cbd5e1;font-size:11px;word-break:break-all;">
  {{verification_url}}
</p>`;
            break;

        case 'password-reset':
            html = `
<h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;">Reset Your Password</h2>
<p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
  We received a request to reset the password for your Nammerha account.
  Click the button below to choose a new password.
</p>
<div style="text-align:center;margin:24px 0;">
  <a href="{{reset_url}}" 
     style="display:inline-block;background:linear-gradient(135deg,#dc2626,#b91c1c);
            color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;
            font-size:15px;font-weight:600;letter-spacing:0.3px;
            box-shadow:0 2px 8px rgba(220,38,38,0.3);">
    Reset Password
  </a>
</div>
<p style="margin:20px 0 8px;color:#94a3b8;font-size:12px;">
  This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-top:16px;">
  <p style="margin:0;color:#991b1b;font-size:12px;font-weight:600;">
    ⚠️ If you did not request this, your account may be compromised. Please contact support immediately.
  </p>
</div>`;
            break;

        case 'security-alert':
            html = `
<div style="background:#fffbeb;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-bottom:20px;">
  <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">🔒 Security Alert</p>
</div>
<h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;">{{alert_title}}</h2>
<p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
  {{alert_body}}
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" 
       style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:16px 0;">
  <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
    <span style="color:#94a3b8;font-size:12px;">Time</span><br>
    <span style="color:#0f172a;font-size:14px;font-weight:500;">{{timestamp}}</span>
  </td></tr>
  <tr><td style="padding:12px 16px;">
    <span style="color:#94a3b8;font-size:12px;">IP Address</span><br>
    <span style="color:#0f172a;font-size:14px;font-weight:500;">{{ip_address}}</span>
  </td></tr>
</table>
<p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">
  If this action was not performed by you, please secure your account immediately
  by changing your password and contacting support.
</p>`;
            break;

        default:
            html = `<p style="color:#475569;">${variables['body'] ?? 'No content'}</p>`;
    }

    // Substitute {{key}} placeholders with variable values
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        while (html.includes(placeholder)) {
            html = html.replace(placeholder, escapeHtml(value));
        }
    }

    return wrapInLayout(html);
}

/**
 * Escape HTML entities in template variables to prevent injection.
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a transactional email using a branded HTML template.
 *
 * Non-throwing: Always returns { success, error? }.
 * Failed delivery is logged but never crashes the caller.
 */
export async function sendEmail(
    options: SendEmailOptions
): Promise<{ success: boolean; error?: string }> {
    const transporter = await getTransporter();
    if (!transporter) {
        const msg = 'SMTP transport not available — email not sent';
        logger.warn('SMTP transport not available — email not sent', { subject: options.subject, to: options.to });
        return { success: false, error: msg };
    }

    try {
        const html = renderTemplate(options.template, options.variables);
        const plainText = stripHtml(html);

        await transporter.sendMail({
            from: getFromAddress(),
            to: options.to,
            subject: options.subject,
            text: plainText,
            html,
        });

        logger.info('Email sent', { subject: options.subject, to: options.to });
        return { success: true };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown email error';
        logger.error('Failed to send email', { subject: options.subject, to: options.to, error: err instanceof Error ? err.message : String(err) });
        return { success: false, error: errorMsg };
    }
}

/**
 * Convenience: Send email verification link.
 */
export function sendVerificationEmail(
    to: string,
    verificationUrl: string
): Promise<{ success: boolean; error?: string }> {
    return sendEmail({
        to,
        subject: 'Verify Your Email — Nammerha',
        template: 'verification',
        variables: { verification_url: verificationUrl },
    });
}

/**
 * Convenience: Send password reset link.
 */
export function sendPasswordResetEmail(
    to: string,
    resetUrl: string
): Promise<{ success: boolean; error?: string }> {
    return sendEmail({
        to,
        subject: 'Password Reset — Nammerha',
        template: 'password-reset',
        variables: { reset_url: resetUrl },
    });
}

/**
 * Convenience: Send security alert (key created, key revoked, etc).
 */
export function sendSecurityAlertEmail(
    to: string,
    alertTitle: string,
    alertBody: string,
    ipAddress: string
): Promise<{ success: boolean; error?: string }> {
    return sendEmail({
        to,
        subject: `🔒 Security Alert — ${alertTitle}`,
        template: 'security-alert',
        variables: {
            alert_title: alertTitle,
            alert_body: alertBody,
            timestamp: new Date().toISOString(),
            ip_address: ipAddress,
        },
    });
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags for plain-text fallback.
 * Preserves link URLs in parentheses.
 */
function stripHtml(html: string): string {
    return html
        .replace(/<a[^>]*href="([^"]*)"[^>]*>[^<]*<\/a>/gi, '$1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
