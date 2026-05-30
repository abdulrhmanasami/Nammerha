// ============================================================================
// Nammerha Backend — Donation Receipt PDF Generator (ENH-3 + D-9)
// ============================================================================
// Generates bilingual (Arabic + English) donation receipts using PDFKit.
//
// D-9 ENHANCEMENT: Three-layer CPU protection:
//   Layer 2: ETag caching — receipt data is immutable, so the ETag derived
//            from (escrow_id + amount + locked_at) is stable. Clients that
//            send If-None-Match get a 304 with zero CPU cost.
//   Layer 3: LRU in-memory PDF buffer cache — once generated, the PDF buffer
//            is cached for 1 hour (max 100 entries). Repeat downloads stream
//            directly from memory without invoking PDFKit.
// ============================================================================
import PDFDocument from 'pdfkit';
import { createHash } from 'crypto';
import { query } from '../config/database';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReceiptData {
  escrow_id: string;
  donor_name: string;
  donor_email: string;
  project_title: string;
  project_id: string;
  material_name: string;
  amount_locked: string; // cents — pg returns BIGINT as string (MEMO 53)
  currency: string;
  payment_method: string | null;
  locked_at: Date;
  payment_status: string;
  gift_recipient_name: string | null;
  donation_intent: string | null;
}

// ─── Layer 3: LRU PDF Buffer Cache ──────────────────────────────────────────

interface CacheEntry {
  buffer: Buffer;
  etag: string;
  filename: string;
  cachedAt: number;
}

const PDF_CACHE_MAX_ENTRIES = 100;
const PDF_CACHE_TTL_MS = 3_600_000; // 1 hour

const pdfCache = new Map<string, CacheEntry>();

/**
 * Evict expired entries and enforce the max size limit.
 * Called before every cache insertion.
 */
function evictStaleEntries(): void {
  const now = Date.now();

  // 1. Remove expired entries
  for (const [key, entry] of pdfCache) {
    if (now - entry.cachedAt > PDF_CACHE_TTL_MS) {
      pdfCache.delete(key);
    }
  }

  // 2. If still over limit, evict oldest entries (LRU by insertion order)
  // Map preserves insertion order, so the first entries are the oldest.
  while (pdfCache.size >= PDF_CACHE_MAX_ENTRIES) {
    const firstKey = pdfCache.keys().next().value;
    if (firstKey) {
      pdfCache.delete(firstKey);
    } else {
      break;
    }
  }
}

// ─── Layer 2: ETag Generation ───────────────────────────────────────────────

/**
 * Generate a stable ETag for a receipt.
 * Based on immutable data: escrow_id + amount + locked_at timestamp.
 * The receipt content is deterministic from these inputs.
 */
function generateETag(data: ReceiptData): string {
  const hash = createHash('sha256')
    .update(`${data.escrow_id}:${data.amount_locked}:${data.locked_at}`)
    .digest('hex')
    .substring(0, 16); // 16 hex chars = 64 bits — sufficient for ETag
  return `"receipt-${hash}"`;
}

// ─── Receipt Generator ──────────────────────────────────────────────────────

/**
 * Generate a PDF donation receipt for a specific escrow entry.
 *
 * D-9 Enhancement: Returns a Buffer + ETag instead of a stream.
 * The route handler uses the ETag for 304 responses and the buffer
 * for streaming. The buffer is cached in-memory for 1 hour.
 *
 * @param userId   Authenticated user's user_id (ownership check)
 * @param escrowId The escrow entry to generate a receipt for
 * @returns { buffer, filename, etag }
 */
export async function generateReceipt(
  userId: string,
  escrowId: string,
): Promise<{ buffer: Buffer; filename: string; etag: string }> {
  // ── Check buffer cache first (Layer 3) ──────────────────────────────
  const cacheKey = `${userId}:${escrowId}`;
  const cached = pdfCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < PDF_CACHE_TTL_MS) {
    logger.debug('D-9: Receipt served from cache', { escrow_id: escrowId });
    // Move to end of Map for LRU freshness
    pdfCache.delete(cacheKey);
    pdfCache.set(cacheKey, cached);
    return { buffer: cached.buffer, filename: cached.filename, etag: cached.etag };
  }

  // ── Fetch receipt data with ownership check ─────────────────────────
  const result = await query<ReceiptData>(
    `SELECT
            el.transaction_id AS escrow_id,
            u.full_name AS donor_name,
            u.email AS donor_email,
            p.title AS project_title,
            el.project_id,
            b.material_name,
            el.amount_locked,
            el.currency,
            el.payment_method,
            el.locked_at,
            el.payment_status,
            el.gift_recipient_name,
            el.donation_intent
         FROM escrow_ledger el
         JOIN users u ON u.user_id = el.user_id
         JOIN projects p ON p.project_id = el.project_id
         JOIN itemized_boq b ON b.item_id = el.item_id
         WHERE el.transaction_id = $1 AND el.user_id = $2`,
    [escrowId, userId],
  );

  const data = result.rows[0];
  if (!data) {
    throw new Error('Escrow entry not found or does not belong to you');
  }

  // ── Generate ETag (Layer 2) ─────────────────────────────────────────
  const etag = generateETag(data);

  // ── Generate PDF into Buffer ────────────────────────────────────────
  const buffer = await buildPdfBuffer(data);

  const filename = `nammerha-receipt-${data.escrow_id.substring(0, 8)}.pdf`;

  // ── Store in cache (Layer 3) ────────────────────────────────────────
  evictStaleEntries();
  pdfCache.set(cacheKey, {
    buffer,
    etag,
    filename,
    cachedAt: Date.now(),
  });

  logger.info('ENH-3: Donation receipt generated', {
    escrow_id: escrowId,
    user_id: userId,
    amount: data.amount_locked,
    buffer_size: buffer.length,
    cache_size: pdfCache.size,
  });

  return { buffer, filename, etag };
}

// ─── PDF Builder (Internal) ─────────────────────────────────────────────────

/**
 * Builds the PDF document and collects all chunks into a single Buffer.
 * This allows the result to be cached and streamed multiple times.
 */
function buildPdfBuffer(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Donation Receipt — ${data.escrow_id}`,
        Author: 'Nammerha Platform',
        Subject: 'Donation Receipt',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    const amountFormatted = `$${(Number(data.amount_locked) / 100).toFixed(2)} ${data.currency}`;
    const dateFormatted = new Date(data.locked_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Header
    doc.fontSize(24).text('Nammerha', { align: 'center' });
    doc.fontSize(10).text('Syria Reconstruction Platform', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text('منصة نمّرها لإعادة إعمار سوريا', { align: 'center' });
    doc.moveDown(1.5);

    // Title
    doc.fontSize(18).text('Donation Receipt', { align: 'center' });
    doc.fontSize(14).text('إيصال تبرع', { align: 'center' });
    doc.moveDown(1.5);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(1);

    // Receipt details
    const leftCol = 50;
    const rightCol = 250;
    let y = doc.y;

    const addField = (label: string, value: string) => {
      doc.fontSize(10).fillColor('#666666').text(label, leftCol, y);
      doc.fontSize(11).fillColor('#000000').text(value, rightCol, y);
      y += 22;
    };

    addField('Receipt No. / رقم الإيصال', data.escrow_id.substring(0, 8).toUpperCase());
    addField('Date / التاريخ', dateFormatted);
    addField('Donor / المتبرع', data.donor_name);
    addField('Email / البريد', data.donor_email);
    addField('Amount / المبلغ', amountFormatted);
    addField('Project / المشروع', data.project_title);
    addField('Project ID / رقم المشروع', data.project_id);
    addField('Material / المادة', data.material_name);
    addField('Status / الحالة', data.payment_status.toUpperCase());

    if (data.payment_method) {
      addField('Payment Method / طريقة الدفع', data.payment_method.toUpperCase());
    }
    if (data.gift_recipient_name) {
      addField('Gift Recipient / المُهدى إليه', data.gift_recipient_name);
    }
    if (data.donation_intent && data.donation_intent !== 'general') {
      addField(
        'Intent / النية',
        data.donation_intent === 'zakat' ? 'زكاة / Zakat' : 'صدقة / Sadaqah',
      );
    }

    doc.y = y + 20;

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(1);

    // Footer
    doc
      .fontSize(9)
      .fillColor('#888888')
      .text(
        'This receipt is generated automatically by the Nammerha platform. ' +
          'Donations are held in escrow and released only upon GPS-verified delivery proof.',
        leftCol,
        doc.y,
        { width: 495, align: 'center' },
      );
    doc.moveDown(0.5);
    doc.text(
      'هذا الإيصال تم إنشاؤه تلقائياً من منصة نمّرها. ' +
        'التبرعات محفوظة في الضمان ويتم تحريرها فقط بعد التحقق من الإثبات المكاني بالـ GPS.',
      leftCol,
      doc.y,
      { width: 495, align: 'center' },
    );

    doc.end();
  });
}
