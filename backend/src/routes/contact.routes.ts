// ============================================================================
// Nammerha Backend — Contact Form Route
// POST /api/contact  — Submit a contact form inquiry
// PLT-2026-MAR12-003 FIX: Adds backend processing for contact page submissions.
// ============================================================================

import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { safeRouteError } from '../utils/safe-error';
import { ZodError } from 'zod';
import { contactSchema } from '../validation/schemas';

const router = Router();



type InquiryCategory = 'general' | 'escrow_dispute' | 'security_report' | 'partnership' | 'media' | 'other';

const VALID_CATEGORIES: InquiryCategory[] = [
    'general', 'escrow_dispute', 'security_report', 'partnership', 'media', 'other',
];

// ─── POST /api/contact ─────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, email, subject, message, category } = contactSchema.parse(req.body);

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
        if (error instanceof ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.issues });
            return;
        }
        safeRouteError(res, error, 'Contact.Submit');
    }
});

export default router;
