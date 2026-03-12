// ============================================================================
// Nammerha Backend — Contact Form Route
// POST /api/contact  — Submit a contact form inquiry
// PLT-2026-MAR12-003 FIX: Adds backend processing for contact page submissions.
// ============================================================================

import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { safeRouteError } from '../utils/safe-error';

const router = Router();

// ─── Input Validation ──────────────────────────────────────────────────────
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 2000;

// ReDoS-safe email regex (same as auth.routes.ts)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,63}(?:\.[a-zA-Z]{2,63}){0,3}$/;

type InquiryCategory = 'general' | 'escrow_dispute' | 'security_report' | 'partnership' | 'media' | 'other';

const VALID_CATEGORIES: InquiryCategory[] = [
    'general', 'escrow_dispute', 'security_report', 'partnership', 'media', 'other',
];

// ─── POST /api/contact ─────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, email, subject, message, category } = req.body as {
            name: string;
            email: string;
            subject: string;
            message: string;
            category?: string;
        };

        // ── Validate required fields ────────────────────────────────────
        if (!name || !email || !subject || !message) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: name, email, subject, message',
            });
            return;
        }

        // ── Length validations ───────────────────────────────────────────
        if (name.length > MAX_NAME_LENGTH) {
            res.status(400).json({ success: false, error: `Name must not exceed ${MAX_NAME_LENGTH} characters` });
            return;
        }
        if (email.length > MAX_EMAIL_LENGTH) {
            res.status(400).json({ success: false, error: `Email must not exceed ${MAX_EMAIL_LENGTH} characters` });
            return;
        }
        if (subject.length > MAX_SUBJECT_LENGTH) {
            res.status(400).json({ success: false, error: `Subject must not exceed ${MAX_SUBJECT_LENGTH} characters` });
            return;
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            res.status(400).json({ success: false, error: `Message must not exceed ${MAX_MESSAGE_LENGTH} characters` });
            return;
        }

        // ── Email format validation ─────────────────────────────────────
        if (!EMAIL_REGEX.test(email)) {
            res.status(400).json({ success: false, error: 'Invalid email format' });
            return;
        }

        // ── Category validation ─────────────────────────────────────────
        const resolvedCategory: InquiryCategory = (category && VALID_CATEGORIES.includes(category as InquiryCategory))
            ? category as InquiryCategory
            : 'general';

        // ── Capture client IP for anti-spam audit ───────────────────────
        const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';

        // ── Store inquiry in database ───────────────────────────────────
        const result = await query<{ inquiry_id: string; created_at: Date }>(
            `INSERT INTO contact_inquiries (
                name, email, subject, message, category, client_ip, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING inquiry_id, created_at`,
            [
                name.trim(),
                email.toLowerCase().trim(),
                subject.trim(),
                message.trim(),
                resolvedCategory,
                clientIp,
            ]
        );

        const inquiry = result.rows[0];
        if (!inquiry) {
            throw new Error('Failed to create contact inquiry');
        }

        logger.info('Contact inquiry received', {
            inquiry_id: inquiry.inquiry_id,
            category: resolvedCategory,
            email: email.toLowerCase().trim(),
        });

        res.status(201).json({
            success: true,
            message: 'Your message has been received. We will respond within our published SLA.',
            data: {
                inquiry_id: inquiry.inquiry_id,
                created_at: inquiry.created_at,
            },
        });
    } catch (error) {
        safeRouteError(res, error, 'Contact.Submit');
    }
});

export default router;
