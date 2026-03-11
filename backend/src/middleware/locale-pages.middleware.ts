// ============================================================================
// Locale Pages Middleware — Server-Side HTML Injection (SSI)
// ============================================================================
// Solves 3 deferred requirements from the translation doc:
//   §5.1: URL Subdirectories (/ar/, /en/, /de/, /fr/, /tr/)
//   §5.2: Hreflang <link> tag injection into HTML <head>
//   §5.3: Metadata localization (<title>, <meta description>)
//
// Architecture:
//   1. Express router catches /:locale/:page routes
//   2. Reads the static HTML file from stitch/
//   3. Injects: lang, dir, hreflang tags, localized title/meta, og:locale
//   4. Serves the modified HTML to both users AND crawlers (Googlebot)
//
// Per doc §4.3: NO forced redirects — root "/" does NOT redirect
// Per doc §5.2: All hreflang tags are bidirectional + x-default included
// ============================================================================

import express, { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────
interface LocaleConfig {
    code: string;
    dir: 'rtl' | 'ltr';
    nativeName: string;
    ogLocale: string; // OpenGraph locale format: language_TERRITORY
}

// PageMeta interface defined below with PAGE_REGISTRY

// ─── Locale Configuration ───────────────────────────────────────────────────
const LOCALE_CONFIGS: Record<string, LocaleConfig> = {
    ar: { code: 'ar', dir: 'rtl', nativeName: 'العربية', ogLocale: 'ar_SA' },
    en: { code: 'en', dir: 'ltr', nativeName: 'English', ogLocale: 'en_US' },
    de: { code: 'de', dir: 'ltr', nativeName: 'Deutsch', ogLocale: 'de_DE' },
    fr: { code: 'fr', dir: 'ltr', nativeName: 'Français', ogLocale: 'fr_FR' },
    tr: { code: 'tr', dir: 'ltr', nativeName: 'Türkçe', ogLocale: 'tr_TR' },
};

const SUPPORTED_LOCALES = Object.keys(LOCALE_CONFIGS);

// ─── Page Registry ──────────────────────────────────────────────────────────
// P1-004 FIX: Full i18n metadata for all 5 locales.
// Maps URL slugs to stitch page directories and localized SEO metadata.

interface LocalizedMeta {
    title: string;
    description: string;
}

interface PageMeta {
    slug: string;
    stitchDir: string;
    meta: Record<string, LocalizedMeta>;
}

const PAGE_REGISTRY: Record<string, PageMeta> = {
    dashboard: {
        slug: 'dashboard',
        stitchDir: 'nammerha_dashboard',
        meta: {
            ar: { title: 'نَمِّرها — لوحة المتابعة', description: 'تابع مشاريع إعادة الإعمار وراقب التمويل وتصفّح بيانات OCDS المفتوحة.' },
            en: { title: 'Nammerha Dashboard', description: 'Track reconstruction projects, monitor impact funding, and explore transparent OCDS-compliant data.' },
            de: { title: 'Nammerha — Übersicht', description: 'Verfolgen Sie Wiederaufbauprojekte, überwachen Sie die Finanzierung und erkunden Sie transparente OCDS-konforme Daten.' },
            fr: { title: 'Nammerha — Tableau de bord', description: 'Suivez les projets de reconstruction, surveillez le financement et explorez les données conformes à l\'OCDS.' },
            tr: { title: 'Nammerha — Kontrol Paneli', description: 'Yeniden yapılanma projelerini takip edin, finansmanı izleyin ve şeffaf OCDS uyumlu verileri keşfedin.' },
        },
    },
    basket: {
        slug: 'basket',
        stitchDir: 'donor_construction_basket',
        meta: {
            ar: { title: 'نَمِّرها — سلة مواد البناء', description: 'موّل مواد بناء محددة عبر تمويل جماعي شفاف مع حماية الأمانات.' },
            en: { title: 'Nammerha — Construction Materials Basket', description: 'Fund specific reconstruction materials through transparent itemized crowdfunding with escrow protection.' },
            de: { title: 'Nammerha — Baumaterial-Warenkorb', description: 'Finanzieren Sie spezifische Baumaterialien durch transparentes Crowdfunding mit Treuhandschutz.' },
            fr: { title: 'Nammerha — Panier de matériaux', description: 'Financez des matériaux de reconstruction via un financement participatif transparent avec protection d\'entiercement.' },
            tr: { title: 'Nammerha — İnşaat Malzeme Sepeti', description: 'Emanet koruması ile şeffaf kitle fonlama yoluyla inşaat malzemelerini finanse edin.' },
        },
    },
    verification: {
        slug: 'verification',
        stitchDir: 'donor_delivery_verification_notification',
        meta: {
            ar: { title: 'نَمِّرها — التحقق من التسليم', description: 'تأكيد التسليم المُتحقق منه بنظام GPS مع توثيق الإثبات المكاني.' },
            en: { title: 'Nammerha — Delivery Verification', description: 'GPS-verified delivery confirmation with spatial proof documentation.' },
            de: { title: 'Nammerha — Lieferungsverifikation', description: 'GPS-verifizierte Lieferbestätigung mit räumlicher Nachweisdokumentation.' },
            fr: { title: 'Nammerha — Vérification de livraison', description: 'Confirmation de livraison vérifiée par GPS avec documentation de preuve spatiale.' },
            tr: { title: 'Nammerha — Teslimat Doğrulama', description: 'GPS ile doğrulanmış teslimat onayı ve mekansal kanıt belgeleri.' },
        },
    },
    boq: {
        slug: 'boq',
        stitchDir: 'engineer_boq_builder',
        meta: {
            ar: { title: 'نَمِّرها — مُنشئ جدول الكميات', description: 'أداة احترافية لبناء جدول الكميات للمهندسين الميدانيين.' },
            en: { title: 'Nammerha — Engineer BOQ Builder', description: 'Professional Bill of Quantities builder for field engineers documenting reconstruction projects.' },
            de: { title: 'Nammerha — Leistungsverzeichnis-Editor', description: 'Professioneller Leistungsverzeichnis-Editor für Ingenieure bei Wiederaufbauprojekten.' },
            fr: { title: 'Nammerha — Éditeur de devis quantitatif', description: 'Éditeur professionnel de devis quantitatif pour les ingénieurs de terrain.' },
            tr: { title: 'Nammerha — Metraj Düzenleyici', description: 'Yeniden yapılanma projelerini belgeleyen saha mühendisleri için metraj düzenleyici.' },
        },
    },
    engineer: {
        slug: 'engineer',
        stitchDir: 'generated_screen_1',
        meta: {
            ar: { title: 'نَمِّرها — إدارة الموقع', description: 'لوحة المهندس الميداني لإدارة عمليات التفتيش وأنشطة إعادة الإعمار.' },
            en: { title: 'Nammerha — Field Engineer & Site Management', description: 'Field engineer dashboard for managing site inspections and reconstruction activities.' },
            de: { title: 'Nammerha — Baustellenmanagement', description: 'Dashboard für Baustelleninspektionen und Wiederaufbauaktivitäten.' },
            fr: { title: 'Nammerha — Gestion de chantier', description: 'Tableau de bord pour la gestion des inspections et des activités de reconstruction.' },
            tr: { title: 'Nammerha — Saha Yönetimi', description: 'Saha denetimleri ve yeniden yapılanma faaliyetleri için mühendis paneli.' },
        },
    },
    escrow: {
        slug: 'escrow',
        stitchDir: 'generated_screen_2',
        meta: {
            ar: { title: 'نَمِّرها — إدارة الأمانات', description: 'إدارة حسابات الأمانات الشفافة مع التتبع المالي المتوافق مع OCDS.' },
            en: { title: 'Nammerha — Escrow Management', description: 'Transparent escrow account management with OCDS-compliant financial tracking.' },
            de: { title: 'Nammerha — Treuhandverwaltung', description: 'Transparente Treuhandkontenverwaltung mit OCDS-konformer Finanzverfolgung.' },
            fr: { title: 'Nammerha — Gestion d\'entiercement', description: 'Gestion transparente des comptes d\'entiercement avec suivi financier conforme à l\'OCDS.' },
            tr: { title: 'Nammerha — Emanet Yönetimi', description: 'OCDS uyumlu finansal takip ile şeffaf emanet hesap yönetimi.' },
        },
    },
    request: {
        slug: 'request',
        stitchDir: 'homeowner_repair_request_step_1',
        meta: {
            ar: { title: 'نَمِّرها — طلب خدمة الترميم', description: 'قدّم طلبات المساعدة في إعادة الإعمار مع تقييم الأضرار الآلي.' },
            en: { title: 'Nammerha — Service Request', description: 'Submit reconstruction assistance requests with automated damage assessment.' },
            de: { title: 'Nammerha — Serviceanfrage', description: 'Senden Sie Wiederaufbauhilfeanfragen mit automatischer Schadensbewertung.' },
            fr: { title: 'Nammerha — Demande de service', description: 'Soumettez des demandes d\'aide à la reconstruction avec évaluation automatique des dommages.' },
            tr: { title: 'Nammerha — Hizmet Talebi', description: 'Otomatik hasar değerlendirmesi ile yeniden yapılanma yardım talepleri gönderin.' },
        },
    },
    project: {
        slug: 'project',
        stitchDir: 'itemized_project_details',
        meta: {
            ar: { title: 'نَمِّرها — تفاصيل المشروع', description: 'عرض تفصيلي للمشروع مع التمويل البنديّ والتوثيق المكاني وتتبع التقدم.' },
            en: { title: 'Nammerha — Project Details', description: 'Detailed project view with itemized funding, spatial documentation, and progress tracking.' },
            de: { title: 'Nammerha — Projektdetails', description: 'Detaillierte Projektansicht mit Einzelfinanzierung, räumlicher Dokumentation und Fortschrittsverfolgung.' },
            fr: { title: 'Nammerha — Détails du projet', description: 'Vue détaillée du projet avec financement détaillé, documentation spatiale et suivi des progrès.' },
            tr: { title: 'Nammerha — Proje Detayları', description: 'Kalem bazlı finansman, mekansal belgeleme ve ilerleme takibi ile detaylı proje görünümü.' },
        },
    },
    oracle: {
        slug: 'oracle',
        stitchDir: 'pricing_oracle_epa_engine',
        meta: {
            ar: { title: 'نَمِّرها — محرك تعديل الأسعار FIDIC', description: 'محرك تعديل الأسعار المتوافق مع FIDIC 13.8 مع بيانات السوق اللحظية.' },
            en: { title: 'Nammerha — Pricing Oracle & EPA Engine', description: 'FIDIC 13.8 compliant price adjustment engine with real-time market data.' },
            de: { title: 'Nammerha — FIDIC-Preisanpassung', description: 'FIDIC 13.8 konformer Preisanpassungsmotor mit Echtzeit-Marktdaten.' },
            fr: { title: 'Nammerha — Moteur d\'ajustement des prix FIDIC', description: 'Moteur d\'ajustement des prix conforme FIDIC 13.8 avec données de marché en temps réel.' },
            tr: { title: 'Nammerha — FIDIC Fiyat Ayarlama Motoru', description: 'Gerçek zamanlı piyasa verileri ile FIDIC 13.8 uyumlu fiyat ayarlama motoru.' },
        },
    },
};

// ─── Stitch Root Path ─────────────────────────────────────────────────────────────────
// P3-005 FIX: Use STITCH_DIR env var with robust __dirname fallback.
// In Docker: STITCH_DIR=/app/stitch (explicit). In dev: resolves from compiled JS path.
const STITCH_ROOT = process.env['STITCH_DIR'] || path.resolve(__dirname, '../../stitch');

// ─── HTML Injection Engine ──────────────────────────────────────────────────

/**
 * Generate hreflang <link> tags for injection into <head>.
 * Per doc §5.2: bidirectional, includes x-default.
 */
function buildHreflangLinks(pageSlug: string, baseUrl: string): string {
    const links = SUPPORTED_LOCALES.map(
        (locale) =>
            `<link rel="alternate" hreflang="${locale}" href="${baseUrl}/${locale}/${pageSlug}"/>`
    );
    // x-default → Arabic (platform primary language per doc)
    links.push(
        `<link rel="alternate" hreflang="x-default" href="${baseUrl}/ar/${pageSlug}"/>`
    );
    return links.join('\n    ');
}

/**
 * Generate OpenGraph locale meta tags.
 * Primary locale + alternate locales for social sharing.
 */
function buildOgLocaleTags(currentLocale: string): string {
    if (!SUPPORTED_LOCALES.includes(currentLocale)) {
        return '';
    }
    const config = LOCALE_CONFIGS[currentLocale] as LocaleConfig;

    const tags = [`<meta property="og:locale" content="${config.ogLocale}"/>`];

    for (const locale of SUPPORTED_LOCALES) {
        if (locale !== currentLocale) {
            const altConfig = LOCALE_CONFIGS[locale] as LocaleConfig | undefined;
            if (altConfig) {
                tags.push(
                    `<meta property="og:locale:alternate" content="${altConfig.ogLocale}"/>`
                );
            }
        }
    }

    return tags.join('\n    ');
}

/**
 * Inject locale-specific attributes and tags into raw HTML.
 *
 * Performs 5 server-side injections:
 *   1. <html lang="X" dir="Y">
 *   2. <title> localization
 *   3. <meta name="description"> localization
 *   4. <link rel="alternate" hreflang="..."> tags
 *   5. <meta property="og:locale"> tags
 */
function injectLocaleIntoHtml(
    html: string,
    locale: string,
    pageSlug: string,
    pageMeta: PageMeta,
    baseUrl: string
): string {
    if (!SUPPORTED_LOCALES.includes(locale)) {
        return html;
    }
    const config = LOCALE_CONFIGS[locale] as LocaleConfig;

    let result = html;

    // 1. Replace <html> attributes: lang and dir
    result = result.replace(
        /<html([^>]*?)lang="[^"]*"([^>]*)>/,
        `<html$1lang="${config.code}"$2 dir="${config.dir}">`
    );
    // If dir was already present, clean duplicate
    result = result.replace(/dir="[^"]*"\s*dir="[^"]*"/, `dir="${config.dir}"`);
    // If no dir existed and no class, add it
    if (!result.includes(`dir="${config.dir}"`)) {
        result = result.replace(
            /<html([^>]*)>/,
            `<html$1 dir="${config.dir}">`
        );
    }

    // 2. Title: P1-004 FIX — resolve locale-specific title with English fallback
    const localizedMeta = pageMeta.meta[locale] ?? pageMeta.meta['en'];
    const localizedTitle = localizedMeta?.title ?? 'Nammerha';
    if (result.includes('<title>')) {
        result = result.replace(
            /<title>[^<]*<\/title>/,
            `<title>${localizedTitle}</title>`
        );
    } else {
        // No title tag exists — inject one
        result = result.replace(
            '</head>',
            `<title>${localizedTitle}</title>\n</head>`
        );
    }

    // 3. Meta description: P1-004 FIX — locale-specific description
    const localizedDescription = localizedMeta?.description ?? '';
    if (result.includes('name="description"')) {
        result = result.replace(
            /<meta\s+name="description"\s+content="[^"]*"[^>]*>/,
            `<meta name="description" content="${localizedDescription}"/>`
        );
    } else {
        result = result.replace(
            '</head>',
            `<meta name="description" content="${localizedDescription}"/>\n</head>`
        );
    }

    // 4. Hreflang tags — inject before </head>
    const hreflangLinks = buildHreflangLinks(pageSlug, baseUrl);
    result = result.replace(
        '</head>',
        `    ${hreflangLinks}\n    ${buildOgLocaleTags(config.code)}\n</head>`
    );

    return result;
}

// ─── Router ─────────────────────────────────────────────────────────────────
const localeRouter = Router();

/**
 * Serve locale-prefixed pages.
 * Routes: /:locale/:page
 * Example: /ar/dashboard, /en/project, /de/basket
 */
localeRouter.get(
    `/:locale(${SUPPORTED_LOCALES.join('|')})/:page`,
    async (req: Request, res: Response, _next: NextFunction) => {
        const locale = req.params['locale'] as string;
        const pageSlug = req.params['page'] as string;

        // Validate locale is supported
        if (!SUPPORTED_LOCALES.includes(locale)) {
            res.status(400).json({ success: false, error: 'Unsupported locale.' });
            return;
        }

        // Validate page exists — safe lookup via Object.hasOwn
        if (!Object.hasOwn(PAGE_REGISTRY, pageSlug)) {
            res.status(404).json({
                success: false,
                error: 'Page not found.',
            });
            return;
        }

        const pageMeta = PAGE_REGISTRY[pageSlug] as PageMeta;
        const localeConfig = LOCALE_CONFIGS[locale] as LocaleConfig;

        // Construct safe path — sanitize stitchDir (no traversal)
        const safeStitchDir = pageMeta.stitchDir.replace(/[^a-zA-Z0-9_-]/g, '');
        const htmlPath = path.join(STITCH_ROOT, safeStitchDir, 'code.html');

        // Validate resolved path stays within STITCH_ROOT
        const resolvedPath = path.resolve(htmlPath);
        if (!resolvedPath.startsWith(path.resolve(STITCH_ROOT))) {
            res.status(403).json({ success: false, error: 'Path traversal denied.' });
            return;
        }

        try {
            await fs.promises.access(resolvedPath, fs.constants.R_OK);
        } catch {
            res.status(404).json({
                success: false,
                error: `HTML file not found for page "${pageSlug}".`,
            });
            return;
        }

        try {
            const rawHtml = await fs.promises.readFile(resolvedPath, 'utf-8');
            const baseUrl = process.env['PLATFORM_URL'] || 'https://nammerha.com';

            const localizedHtml = injectLocaleIntoHtml(
                rawHtml,
                locale,
                pageSlug,
                pageMeta,
                baseUrl
            );

            // Set cache headers for crawler friendliness
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1h
            res.setHeader('Content-Language', localeConfig.code);
            res.send(localizedHtml);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
                `[Locale Middleware] Error serving ${locale}/${pageSlug}:`,
                error
            );
            res.status(500).json({
                success: false,
                error: 'Internal server error while rendering locale page.',
            });
        }
    }
);

/**
 * Locale root redirect: /:locale → /:locale/dashboard
 * Per doc §4.3: This is NOT a forced redirect from "/".
 * Only triggers when user explicitly navigates to /ar, /en, etc.
 */
localeRouter.get(
    `/:locale(${SUPPORTED_LOCALES.join('|')})`,
    (req: Request, res: Response) => {
        res.redirect(301, `/${req.params['locale']}/dashboard`);
    }
);

/**
 * Serve static assets (CSS, JS, images, fonts) from stitch directory.
 * P3-003 FIX: Actually serves files instead of being a no-op.
 * Rewrites /:locale/assets/* → stitch root static serve.
 */
localeRouter.use(
    `/:locale(${SUPPORTED_LOCALES.join('|')})/assets`,
    express.static(STITCH_ROOT, {
        maxAge: '7d',
        immutable: true,
        fallthrough: true,
    })
);

export default localeRouter;
export { PAGE_REGISTRY, LOCALE_CONFIGS, SUPPORTED_LOCALES };
