// ============================================================================
// Nammerha Backend — Impact Communications Service
// ============================================================================
// Event-driven bilingual messaging system for user impact tracking.
// Generates messages when project lifecycle events occur, storing them
// in the impact_messages table for user retrieval.
//
// Templates use dynamic data injection from event metadata:
//   {{project_title}}, {{amount}}, {{material_name}}, {{milestone}}, etc.
// ============================================================================

import { query } from '../config/database';
import { logger } from '../utils/logger';
import type { ImpactEventType, ImpactMessage } from '../types';

// ─── Bilingual Message Templates ────────────────────────────────────────────

interface MessageTemplate {
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
}

type TemplateData = Record<string, string | number>;

const TEMPLATES: Record<ImpactEventType, MessageTemplate> = {
  contractor_assigned: {
    title_en: 'Contractor Assigned to Your Project 👷',
    title_ar: 'تم تعيين مقاول لمشروعك 👷',
    body_en:
      'A licensed contractor has been assigned to "{{project_title}}". They will coordinate with the assigned engineer to begin reconstruction work. You can track progress from your Impact Dashboard.',
    body_ar:
      'تم تعيين مقاول مرخّص لمشروع "{{project_title}}". سيتنسق مع المهندس المعيّن لبدء أعمال إعادة الإعمار. يمكنك متابعة التقدم من لوحة الأثر.',
  },
  construction_started: {
    title_en: 'Construction Has Begun! 🚧',
    title_ar: 'بدأ البناء! 🚧',
    body_en:
      'Exciting news! Work has officially started on "{{project_title}}". Our on-site engineer will verify each phase with GPS-stamped photos so you can see the real impact of your contribution.',
    body_ar:
      'أخبار رائعة! بدأ العمل رسمياً في مشروع "{{project_title}}". سيقوم المهندس الميداني بالتحقق من كل مرحلة بصور مختومة بالموقع الجغرافي لتشاهد الأثر الحقيقي لمساهمتك.',
  },
  milestone_completed: {
    title_en: 'Milestone Reached: {{milestone}} 📊',
    title_ar: 'تم إنجاز مرحلة: {{milestone}} 📊',
    body_en:
      '"{{project_title}}" has reached {{progress}}% completion! The {{milestone}} phase has been verified by the assigned engineer. Your contribution is making a tangible difference.',
    body_ar:
      'وصل مشروع "{{project_title}}" إلى {{progress}}% إتمام! تم التحقق من مرحلة {{milestone}} بواسطة المهندس المعيّن. مساهمتك تُحدث فرقاً ملموساً.',
  },
  photo_proof_added: {
    title_en: 'New Photo from Your Project 📸',
    title_ar: 'صورة جديدة من مشروعك 📸',
    body_en:
      'A GPS-verified photo has been uploaded for "{{project_title}}". Visit your Proof Gallery to see the latest construction progress — verified at coordinates ({{lat}}, {{lng}}).',
    body_ar:
      'تم رفع صورة موثقة بالموقع الجغرافي لمشروع "{{project_title}}". زُر معرض الإثباتات لمشاهدة آخر تقدم في البناء — موثقة عند الإحداثيات ({{lat}}, {{lng}}).',
  },
  escrow_released: {
    title_en: 'Funds Released to Supplier 💸',
    title_ar: 'تم إفراج الأموال للمورّد 💸',
    body_en:
      '${{amount}} from your contribution has been released to the verified supplier for "{{material_name}}" on project "{{project_title}}". The material delivery was confirmed with GPS proof.',
    body_ar:
      'تم إفراج ${{amount}} من مساهمتك للمورّد المعتمد مقابل "{{material_name}}" في مشروع "{{project_title}}". تم تأكيد تسليم المواد بإثبات GPS.',
  },
  project_completed: {
    title_en: '🎉 Project Completed! Your Impact is Real',
    title_ar: '🎉 اكتمل المشروع! أثرك حقيقي',
    body_en:
      'Wonderful news! "{{project_title}}" has been officially completed. Your contribution of ${{amount}} helped rebuild a home and restore dignity to a family. Thank you for making this possible.',
    body_ar:
      'أخبار رائعة! اكتمل مشروع "{{project_title}}" رسمياً. ساعدت مساهمتك بقيمة ${{amount}} في إعادة بناء منزل واستعادة الكرامة لعائلة. شكراً لجعلك هذا ممكناً.',
  },
  donation_received: {
    title_en: 'Contribution Received — Thank You! 💚',
    title_ar: 'تم استلام مساهمتك — شكراً لك! 💚',
    body_en:
      'Your contribution of ${{amount}} to "{{project_title}}" has been received and placed in escrow. Funds will be released to verified suppliers as construction milestones are verified by on-site engineers.',
    body_ar:
      'تم استلام مساهمتك بقيمة ${{amount}} لمشروع "{{project_title}}" وتم وضعها في الضمان. سيتم إفراج الأموال للموردين المعتمدين عند التحقق من مراحل البناء بواسطة المهندسين الميدانيين.',
  },
};

/**
 * Interpolate template placeholders: {{key}} → value
 */
function interpolate(template: string, data: TemplateData): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = data[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * Format cents to dollars for display.
 */
function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ─── Message Generation ─────────────────────────────────────────────────────

/**
 * Generate and persist an impact message for a user.
 *
 * @param eventType  — One of the 7 lifecycle events
 * @param userId     — UUID of the user to notify
 * @param projectId  — UUID of the related project (optional)
 * @param data       — Dynamic data for template interpolation
 */
export async function generateImpactMessage(
  eventType: ImpactEventType,
  userId: string,
  projectId: string | null,
  data: TemplateData,
): Promise<ImpactMessage> {
  const template = TEMPLATES[eventType];

  // Format amount if present (cents → dollars)
  const displayData = { ...data };
  if (typeof displayData['amount'] === 'number') {
    displayData['amount'] = formatAmount(displayData['amount'] as number);
  }

  const title_en = interpolate(template.title_en, displayData);
  const title_ar = interpolate(template.title_ar, displayData);
  const body_en = interpolate(template.body_en, displayData);
  const body_ar = interpolate(template.body_ar, displayData);

  const result = await query<ImpactMessage>(
    `INSERT INTO impact_messages (user_id, project_id, event_type, title_en, title_ar, body_en, body_ar, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING message_id, user_id, project_id, event_type,
                   title_en, title_ar, body_en, body_ar, metadata,
                   read_at, created_at`,
    [userId, projectId, eventType, title_en, title_ar, body_en, body_ar, JSON.stringify(data)],
  );

  logger.info('Impact message generated', { eventType, userId, projectId });
  return result.rows[0] as ImpactMessage;
}

/**
 * Generate impact messages for ALL users who funded a project.
 * Used for project-wide events (contractor_assigned, construction_started, etc.)
 */
export async function notifyAllProjectUsers(
  eventType: ImpactEventType,
  projectId: string,
  data: TemplateData,
): Promise<number> {
  // Find all unique users for this project
  const users = await query<{ user_id: string; total_donated: string }>(
    `SELECT user_id, SUM(amount_locked) AS total_donated
         FROM escrow_ledger
         WHERE project_id = $1 AND payment_status IN ('locked', 'released')
         GROUP BY user_id`,
    [projectId],
  );

  let count = 0;
  for (const user of users.rows) {
    try {
      await generateImpactMessage(eventType, user.user_id, projectId, {
        ...data,
        amount: parseInt(user.total_donated, 10),
      });
      count++;
    } catch (error) {
      logger.error('Failed to generate impact message for user', {
        eventType,
        userId: user.user_id,
        projectId,
        error,
      });
    }
  }

  return count;
}

// ─── Message Retrieval ──────────────────────────────────────────────────────

/**
 * Get user's impact messages (paginated).
 */
export async function getUserMessages(
  userId: string,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
): Promise<ImpactMessage[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const unreadFilter = options.unreadOnly ? 'AND read_at IS NULL' : '';

  const result = await query<ImpactMessage>(
    `SELECT message_id, user_id, project_id, event_type,
                title_en, title_ar, body_en, body_ar, metadata,
                read_at, created_at
         FROM impact_messages
         WHERE user_id = $1 ${unreadFilter}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return result.rows;
}

/**
 * Get unread message count for badge display.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM impact_messages
         WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Mark a single message as read.
 */
export async function markAsRead(messageId: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE impact_messages
         SET read_at = NOW()
         WHERE message_id = $1 AND user_id = $2 AND read_at IS NULL`,
    [messageId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Mark all messages as read for a user.
 */
export async function markAllRead(userId: string): Promise<number> {
  const result = await query(
    `UPDATE impact_messages
         SET read_at = NOW()
         WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return result.rowCount ?? 0;
}
