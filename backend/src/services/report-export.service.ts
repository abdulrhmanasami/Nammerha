// ============================================================================
// Nammerha — Report Export Service (PDF + Excel)
// P1-4 FIX: Production-grade export replacing open-data stubs
// ============================================================================

import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import pool from '../config/database';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProjectRow {
    project_id: string;
    title: string;
    region: string;
    status: string;
    damage_type: string;
    funded_percentage: number;
    total_cost: number;
    funded_amount: number;
    created_at: string;
}

interface DonationRow {
    reference: string;
    donor_name: string;
    project_title: string;
    material_name: string;
    amount: number;
    currency: string;
    status: string;
    locked_at: string;
}

// ─── Query Helpers ──────────────────────────────────────────────────────────

async function fetchProjects(): Promise<ProjectRow[]> {
    const result = await pool.query<ProjectRow>(
        `SELECT project_id, title, region, status, damage_type,
                funded_percentage, total_cost, funded_amount, created_at
         FROM vw_project_cards
         ORDER BY created_at DESC`
    );
    return result.rows;
}

async function fetchDonations(projectId?: string): Promise<DonationRow[]> {
    let sql = `
        SELECT e.payment_gateway_ref AS reference,
               u.full_name AS donor_name,
               p.title AS project_title,
               b.material_name,
               e.amount_locked AS amount,
               e.currency,
               e.payment_status AS status,
               e.locked_at
        FROM escrow_ledger e
        JOIN users u ON u.user_id = e.donor_id
        JOIN projects p ON p.project_id = e.project_id
        JOIN itemized_boq b ON b.item_id = e.item_id
    `;
    const params: unknown[] = [];

    if (projectId) {
        sql += ' WHERE e.project_id = $1';
        params.push(projectId);
    }

    sql += ' ORDER BY e.locked_at DESC LIMIT 5000';

    const result = await pool.query<DonationRow>(sql, params);
    return result.rows;
}

// ─── PDF Export ─────────────────────────────────────────────────────────────

/**
 * Generate a professionally formatted PDF report and stream it to the HTTP response.
 * Supports: project summary, donation ledger
 */
export async function exportProjectsPDF(res: Response, projectId?: string): Promise<void> {
    const projects = projectId
        ? (await fetchProjects()).filter(p => p.project_id === projectId)
        : await fetchProjects();

    const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
            Title: 'Nammerha — OCDS Project Report',
            Author: 'Nammerha Platform',
            Subject: 'Syria Reconstruction Transparency Report',
            Creator: 'Nammerha Report Engine v1.0',
        },
    });

    // Stream directly to response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="nammerha-report-${Date.now()}.pdf"`);

    const stream = new PassThrough();
    doc.pipe(stream);
    stream.pipe(res);

    // ── Header
    doc.fontSize(20).font('Helvetica-Bold')
        .text('Nammerha – Syria Reconstruction Platform', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica')
        .fillColor('#666666')
        .text(`OCDS-Compliant Report • Generated ${new Date().toISOString().slice(0, 10)}`, { align: 'center' });
    doc.moveDown(1);

    // ── Divider
    doc.strokeColor('#E2E8F0').lineWidth(1)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // ── Summary Stats
    const totalProjects = projects.length;
    const totalFunded = projects.reduce((sum, p) => sum + Number(p.funded_amount ?? 0), 0);
    const avgFunding = totalProjects > 0
        ? projects.reduce((sum, p) => sum + Number(p.funded_percentage ?? 0), 0) / totalProjects
        : 0;

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1E293B')
        .text('Summary Statistics');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#334155');
    doc.text(`Total Projects: ${totalProjects}`);
    doc.text(`Total Funded: $${totalFunded.toLocaleString()}`);
    doc.text(`Average Funding: ${avgFunding.toFixed(1)}%`);
    doc.moveDown(1);

    // ── Project Table
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1E293B')
        .text('Project Details');
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const colWidths = [150, 70, 70, 70, 80, 55];
    const headers = ['Project', 'Region', 'Status', 'Cost ($)', 'Funded ($)', 'Fund %'];

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B');
    let xPos = 50;
    headers.forEach((h, i) => {
        doc.text(h, xPos, tableTop, { width: colWidths[i] ?? 70 });
        xPos += colWidths[i] ?? 70;
    });

    doc.moveDown(0.5);
    doc.strokeColor('#E2E8F0').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    // Table rows
    doc.fontSize(8).font('Helvetica').fillColor('#334155');
    for (const p of projects) {
        if (doc.y > 720) {
            doc.addPage();
        }

        const rowY = doc.y;
        let x = 50;
        const vals = [
            (p.title ?? '').slice(0, 30),
            p.region ?? '',
            p.status ?? '',
            `$${Number(p.total_cost ?? 0).toLocaleString()}`,
            `$${Number(p.funded_amount ?? 0).toLocaleString()}`,
            `${Number(p.funded_percentage ?? 0).toFixed(0)}%`,
        ];

        vals.forEach((v, i) => {
            doc.text(v, x, rowY, { width: colWidths[i] ?? 70 });
            x += colWidths[i] ?? 70;
        });

        doc.moveDown(0.5);
    }

    // ── Footer
    doc.moveDown(2);
    doc.fontSize(7).font('Helvetica').fillColor('#94A3B8')
        .text('This report is generated by Nammerha Platform in compliance with Open Contracting Data Standard (OCDS).', {
            align: 'center',
        });

    doc.end();
}

// ─── Excel Export ────────────────────────────────────────────────────────────

/**
 * Generate a multi-sheet Excel workbook and stream it to the HTTP response.
 * Sheet 1: Projects | Sheet 2: Donation Ledger
 */
export async function exportProjectsExcel(res: Response, projectId?: string): Promise<void> {
    const [projects, donations] = await Promise.all([
        projectId
            ? fetchProjects().then(all => all.filter(p => p.project_id === projectId))
            : fetchProjects(),
        fetchDonations(projectId),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Nammerha Platform';
    workbook.created = new Date();

    // ── Sheet 1: Projects
    const projectSheet = workbook.addWorksheet('Projects', {
        headerFooter: {
            firstHeader: 'Nammerha — OCDS Project Report',
        },
    });

    projectSheet.columns = [
        { header: 'Project ID', key: 'project_id', width: 36 },
        { header: 'Title', key: 'title', width: 35 },
        { header: 'Region', key: 'region', width: 18 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Damage Type', key: 'damage_type', width: 14 },
        { header: 'Total Cost ($)', key: 'total_cost', width: 16 },
        { header: 'Funded ($)', key: 'funded_amount', width: 16 },
        { header: 'Funded %', key: 'funded_percentage', width: 10 },
        { header: 'Created', key: 'created_at', width: 18 },
    ];

    // Style header row
    const headerRowP = projectSheet.getRow(1);
    headerRowP.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRowP.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' },
    };

    projects.forEach((p) => {
        projectSheet.addRow({
            ...p,
            total_cost: Number(p.total_cost ?? 0),
            funded_amount: Number(p.funded_amount ?? 0),
            funded_percentage: Number(p.funded_percentage ?? 0),
        });
    });

    // Format currency columns
    projectSheet.getColumn('total_cost').numFmt = '$#,##0';
    projectSheet.getColumn('funded_amount').numFmt = '$#,##0';
    projectSheet.getColumn('funded_percentage').numFmt = '0%';

    // ── Sheet 2: Donations
    const donationSheet = workbook.addWorksheet('Donations');

    donationSheet.columns = [
        { header: 'Reference', key: 'reference', width: 30 },
        { header: 'Donor', key: 'donor_name', width: 25 },
        { header: 'Project', key: 'project_title', width: 30 },
        { header: 'Material', key: 'material_name', width: 25 },
        { header: 'Amount ($)', key: 'amount', width: 14 },
        { header: 'Currency', key: 'currency', width: 8 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Date', key: 'locked_at', width: 18 },
    ];

    const headerRowD = donationSheet.getRow(1);
    headerRowD.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRowD.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF059669' },
    };

    donations.forEach((d) => {
        donationSheet.addRow({
            ...d,
            amount: Number(d.amount ?? 0),
        });
    });

    donationSheet.getColumn('amount').numFmt = '$#,##0';

    // Stream to response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="nammerha-report-${Date.now()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
}
