/**
 * vite-plugin-seo-locale.ts — Build-time hreflang & SEO metadata injection
 * ═══════════════════════════════════════════════════════════════════════════
 * P2-NEW-001 FIX: 17 of 27 Vite pages had no hreflang tags or localized SEO
 * metadata. This plugin injects them at build time — the same pattern used
 * by Next.js, Nuxt, and other production MPA frameworks.
 *
 * This plugin runs in Vite's transformIndexHtml hook, which processes every
 * HTML entry point registered in rollupOptions.input. It injects:
 *   1. <link rel="alternate" hreflang="..."> tags for all 5 locales
 *   2. <link rel="alternate" hreflang="x-default"> (Arabic = platform default)
 *   3. <meta property="og:locale"> and og:locale:alternate tags
 *
 * Architecture:
 *   - Runs at BUILD TIME, not runtime — zero performance cost
 *   - Works with the Nginx-served Vite dist bundle (no backend dependency)
 *   - Complements the backend locale-pages middleware (which handles stitch pages)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Plugin, IndexHtmlTransformResult } from 'vite';

// ─── Locale Configuration ───────────────────────────────────────────────────
// Mirrors LOCALE_CONFIGS in locale-pages.middleware.ts for consistency.
const SUPPORTED_LOCALES = ['ar', 'en', 'de', 'fr', 'tr'] as const;

const OG_LOCALE_MAP: Record<string, string> = {
    ar: 'ar_SA',
    en: 'en_US',
    de: 'de_DE',
    fr: 'fr_FR',
    tr: 'tr_TR',
};

// ─── SEO Metadata Registry ─────────────────────────────────────────────────
// Localized titles and descriptions for all Vite-built pages.
// Pages NOT listed here get a generic Nammerha title/description.
interface LocalizedMeta {
    title: Record<string, string>;
    description: Record<string, string>;
}

const PAGE_SEO: Record<string, LocalizedMeta> = {
    'index': {
        title: {
            ar: 'نعمِّرها — منصة إعادة الإعمار',
            en: 'Nammerha — Transparent Reconstruction Platform',
            de: 'Nammerha — Transparente Wiederaufbauplattform',
            fr: 'Nammerha — Plateforme de reconstruction transparente',
            tr: 'Nammerha — Şeffaf Yeniden Yapım Platformu',
        },
        description: {
            ar: 'منصة تمويل جماعي لإعادة إعمار سوريا مع ضمان الأمانات والتحقق المكاني.',
            en: 'Transparent crowdfunding platform for Syria\'s reconstruction with escrow protection and spatial verification.',
            de: 'Transparente Crowdfunding-Plattform für den Wiederaufbau Syriens mit Treuhandschutz und räumlicher Verifizierung.',
            fr: 'Plateforme de financement participatif transparent pour la reconstruction de la Syrie avec protection d\'entiercement.',
            tr: 'Emanet koruması ve mekansal doğrulama ile Suriye\'nin yeniden yapımı için şeffaf kitle fonlama platformu.',
        },
    },
    'auth': {
        title: {
            ar: 'نعمِّرها — تسجيل الدخول',
            en: 'Nammerha — Sign In',
            de: 'Nammerha — Anmelden',
            fr: 'Nammerha — Connexion',
            tr: 'Nammerha — Giriş Yap',
        },
        description: {
            ar: 'تسجيل الدخول إلى منصة نعمِّرها لإدارة مشاريع إعادة الإعمار.',
            en: 'Sign in to the Nammerha platform to manage reconstruction projects.',
            de: 'Melden Sie sich bei der Nammerha-Plattform an.',
            fr: 'Connectez-vous à la plateforme Nammerha.',
            tr: 'Nammerha platformuna giriş yapın.',
        },
    },
    'reset-password': {
        title: {
            ar: 'نعمِّرها — إعادة تعيين كلمة المرور',
            en: 'Nammerha — Reset Password',
            de: 'Nammerha — Passwort zurücksetzen',
            fr: 'Nammerha — Réinitialiser le mot de passe',
            tr: 'Nammerha — Şifre Sıfırla',
        },
        description: {
            ar: 'إعادة تعيين كلمة المرور لحساب نعمِّرها.',
            en: 'Reset your Nammerha account password.',
            de: 'Setzen Sie Ihr Nammerha-Passwort zurück.',
            fr: 'Réinitialisez votre mot de passe Nammerha.',
            tr: 'Nammerha hesap şifrenizi sıfırlayın.',
        },
    },
    'verify-email': {
        title: {
            ar: 'نعمِّرها — تأكيد البريد الإلكتروني',
            en: 'Nammerha — Verify Email',
            de: 'Nammerha — E-Mail bestätigen',
            fr: 'Nammerha — Vérifier l\'email',
            tr: 'Nammerha — E-posta Doğrula',
        },
        description: {
            ar: 'تأكيد عنوان البريد الإلكتروني لتفعيل حساب نعمِّرها.',
            en: 'Verify your email address to activate your Nammerha account.',
            de: 'Bestätigen Sie Ihre E-Mail-Adresse.',
            fr: 'Vérifiez votre adresse e-mail.',
            tr: 'E-posta adresinizi doğrulayın.',
        },
    },
    'wallet': {
        title: {
            ar: 'نعمِّرها — المحفظة المالية',
            en: 'Nammerha — Financial Wallet',
            de: 'Nammerha — Finanz-Wallet',
            fr: 'Nammerha — Portefeuille financier',
            tr: 'Nammerha — Finansal Cüzdan',
        },
        description: {
            ar: 'إدارة أموالك والتبرعات في محفظة نعمِّرها.',
            en: 'Manage your funds and donations in the Nammerha wallet.',
            de: 'Verwalten Sie Ihre Gelder im Nammerha-Wallet.',
            fr: 'Gérez vos fonds dans le portefeuille Nammerha.',
            tr: 'Nammerha cüzdanında fonlarınızı yönetin.',
        },
    },
    'profile': {
        title: {
            ar: 'نعمِّرها — الملف الشخصي',
            en: 'Nammerha — Profile',
            de: 'Nammerha — Profil',
            fr: 'Nammerha — Profil',
            tr: 'Nammerha — Profil',
        },
        description: {
            ar: 'إدارة معلومات الملف الشخصي والإعدادات.',
            en: 'Manage your profile information and settings.',
            de: 'Verwalten Sie Ihre Profilinformationen.',
            fr: 'Gérez vos informations de profil.',
            tr: 'Profil bilgilerinizi yönetin.',
        },
    },
    'homeowner-portal': {
        title: {
            ar: 'نعمِّرها — بوابة صاحب المنزل',
            en: 'Nammerha — Homeowner Portal',
            de: 'Nammerha — Hausbesitzer-Portal',
            fr: 'Nammerha — Portail propriétaire',
            tr: 'Nammerha — Ev Sahibi Portalı',
        },
        description: {
            ar: 'بوابة أصحاب المنازل لتقديم طلبات إعادة الإعمار ومتابعة المشاريع.',
            en: 'Homeowner portal for submitting reconstruction requests and tracking projects.',
            de: 'Portal für Hausbesitzer zum Einreichen von Wiederaufbauanträgen.',
            fr: 'Portail propriétaire pour les demandes de reconstruction.',
            tr: 'Yeniden yapılanma talepleri için ev sahibi portalı.',
        },
    },
    'homeowner-report': {
        title: {
            ar: 'نعمِّرها — تقرير الأضرار',
            en: 'Nammerha — Damage Report',
            de: 'Nammerha — Schadensbericht',
            fr: 'Nammerha — Rapport de dommages',
            tr: 'Nammerha — Hasar Raporu',
        },
        description: {
            ar: 'تقديم تقرير أضرار مفصل مع صور وإحداثيات GPS.',
            en: 'Submit a detailed damage report with photos and GPS coordinates.',
            de: 'Reichen Sie einen detaillierten Schadensbericht ein.',
            fr: 'Soumettez un rapport de dommages détaillé.',
            tr: 'Fotoğraflar ve GPS koordinatları ile detaylı hasar raporu gönderin.',
        },
    },
    'donor-portal': {
        title: {
            ar: 'نعمِّرها — بوابة المتبرع',
            en: 'Nammerha — Donor Portal',
            de: 'Nammerha — Spender-Portal',
            fr: 'Nammerha — Portail donateur',
            tr: 'Nammerha — Bağışçı Portalı',
        },
        description: {
            ar: 'بوابة المتبرعين لمتابعة التبرعات والتأثير.',
            en: 'Donor portal for tracking donations and impact.',
            de: 'Spenderportal zur Verfolgung von Spenden und Wirkung.',
            fr: 'Portail donateur pour suivre les dons et l\'impact.',
            tr: 'Bağışları ve etkiyi takip etmek için bağışçı portalı.',
        },
    },
    'donor-basket': {
        title: {
            ar: 'نعمِّرها — سلة التبرع',
            en: 'Nammerha — Donation Basket',
            de: 'Nammerha — Spendenkorb',
            fr: 'Nammerha — Panier de dons',
            tr: 'Nammerha — Bağış Sepeti',
        },
        description: {
            ar: 'اختر مواد البناء المحددة لتمويلها عبر التمويل الجماعي.',
            en: 'Select specific construction materials to fund through crowdfunding.',
            de: 'Wählen Sie bestimmte Baumaterialien zur Finanzierung.',
            fr: 'Sélectionnez des matériaux de construction à financer.',
            tr: 'Kitle fonlama yoluyla finanse edilecek inşaat malzemelerini seçin.',
        },
    },
    'donor-proof': {
        title: {
            ar: 'نعمِّرها — إثبات التسليم',
            en: 'Nammerha — Delivery Proof',
            de: 'Nammerha — Liefernachweis',
            fr: 'Nammerha — Preuve de livraison',
            tr: 'Nammerha — Teslimat Kanıtı',
        },
        description: {
            ar: 'عرض إثبات التسليم المُتحقق منه بنظام GPS للتبرعات.',
            en: 'View GPS-verified delivery proof for your donations.',
            de: 'GPS-verifizierter Liefernachweis für Ihre Spenden.',
            fr: 'Preuve de livraison vérifiée par GPS pour vos dons.',
            tr: 'Bağışlarınız için GPS doğrulamalı teslimat kanıtını görüntüleyin.',
        },
    },
    'supplier-dashboard': {
        title: {
            ar: 'نعمِّرها — لوحة المورد',
            en: 'Nammerha — Supplier Dashboard',
            de: 'Nammerha — Lieferanten-Dashboard',
            fr: 'Nammerha — Tableau de bord fournisseur',
            tr: 'Nammerha — Tedarikçi Paneli',
        },
        description: {
            ar: 'إدارة أوامر الشراء والمخزون كمورد معتمد.',
            en: 'Manage purchase orders and inventory as a verified supplier.',
            de: 'Verwalten Sie Bestellungen als verifizierter Lieferant.',
            fr: 'Gérez les commandes en tant que fournisseur vérifié.',
            tr: 'Doğrulanmış tedarikçi olarak siparişleri yönetin.',
        },
    },
    'contractor-portal': {
        title: {
            ar: 'نعمِّرها — بوابة المقاول',
            en: 'Nammerha — Contractor Portal',
            de: 'Nammerha — Auftragnehmer-Portal',
            fr: 'Nammerha — Portail entrepreneur',
            tr: 'Nammerha — Yüklenici Portalı',
        },
        description: {
            ar: 'بوابة المقاولين لتقديم العطاءات وإدارة مشاريع إعادة الإعمار.',
            en: 'Contractor portal for bidding and managing reconstruction projects.',
            de: 'Portal für Auftragnehmer zur Angebotsabgabe.',
            fr: 'Portail entrepreneur pour les appels d\'offres.',
            tr: 'İhale ve yeniden yapılanma projeleri için yüklenici portalı.',
        },
    },
    'contractor-dashboard': {
        title: {
            ar: 'نعمِّرها — لوحة المقاول',
            en: 'Nammerha — Contractor Dashboard',
            de: 'Nammerha — Auftragnehmer-Dashboard',
            fr: 'Nammerha — Tableau de bord entrepreneur',
            tr: 'Nammerha — Yüklenici Paneli',
        },
        description: {
            ar: 'لوحة تحكم المقاول لمتابعة المشاريع والعطاءات.',
            en: 'Contractor dashboard for tracking projects and bids.',
            de: 'Dashboard zur Verfolgung von Projekten und Angeboten.',
            fr: 'Tableau de bord pour suivre les projets et les offres.',
            tr: 'Projeleri ve teklifleri takip etmek için yüklenici paneli.',
        },
    },
    'tradesperson-portal': {
        title: {
            ar: 'نعمِّرها — بوابة الحرفي',
            en: 'Nammerha — Tradesperson Portal',
            de: 'Nammerha — Handwerker-Portal',
            fr: 'Nammerha — Portail artisan',
            tr: 'Nammerha — Esnaf Portalı',
        },
        description: {
            ar: 'بوابة الحرفيين للعثور على فرص عمل في مشاريع إعادة الإعمار.',
            en: 'Tradesperson portal for finding work opportunities in reconstruction.',
            de: 'Portal für Handwerker zur Suche nach Aufträgen.',
            fr: 'Portail artisan pour trouver des opportunités de travail.',
            tr: 'Yeniden yapılanmada iş fırsatları bulmak için esnaf portalı.',
        },
    },
    'compliance-dashboard': {
        title: {
            ar: 'نعمِّرها — لوحة الامتثال',
            en: 'Nammerha — Compliance Dashboard',
            de: 'Nammerha — Compliance-Dashboard',
            fr: 'Nammerha — Tableau de bord conformité',
            tr: 'Nammerha — Uyumluluk Paneli',
        },
        description: {
            ar: 'لوحة الامتثال لمراقبة الفحوصات التنظيمية ومطابقة العقوبات.',
            en: 'Compliance dashboard for monitoring regulatory checks and sanctions screening.',
            de: 'Dashboard zur Überwachung regulatorischer Prüfungen.',
            fr: 'Tableau de bord de conformité pour les contrôles réglementaires.',
            tr: 'Düzenleyici kontrolleri izlemek için uyumluluk paneli.',
        },
    },
    'terms': {
        title: {
            ar: 'نعمِّرها — شروط الاستخدام',
            en: 'Nammerha — Terms of Service',
            de: 'Nammerha — Nutzungsbedingungen',
            fr: 'Nammerha — Conditions d\'utilisation',
            tr: 'Nammerha — Kullanım Şartları',
        },
        description: {
            ar: 'شروط الاستخدام لمنصة نعمِّرها لإعادة الإعمار.',
            en: 'Terms of service for the Nammerha reconstruction platform.',
            de: 'Nutzungsbedingungen der Nammerha-Plattform.',
            fr: 'Conditions d\'utilisation de la plateforme Nammerha.',
            tr: 'Nammerha yeniden yapım platformu kullanım şartları.',
        },
    },
    'privacy': {
        title: {
            ar: 'نعمِّرها — سياسة الخصوصية',
            en: 'Nammerha — Privacy Policy',
            de: 'Nammerha — Datenschutzrichtlinie',
            fr: 'Nammerha — Politique de confidentialité',
            tr: 'Nammerha — Gizlilik Politikası',
        },
        description: {
            ar: 'سياسة الخصوصية وحماية البيانات لمنصة نعمِّرها.',
            en: 'Privacy policy and data protection for the Nammerha platform.',
            de: 'Datenschutzrichtlinie der Nammerha-Plattform.',
            fr: 'Politique de confidentialité de la plateforme Nammerha.',
            tr: 'Nammerha platformu gizlilik politikası.',
        },
    },
    'refund-policy': {
        title: {
            ar: 'نعمِّرها — سياسة الاسترداد',
            en: 'Nammerha — Refund Policy',
            de: 'Nammerha — Rückerstattungsrichtlinie',
            fr: 'Nammerha — Politique de remboursement',
            tr: 'Nammerha — İade Politikası',
        },
        description: {
            ar: 'سياسة الاسترداد والضمان لمنصة نعمِّرها.',
            en: 'Refund and escrow policy for the Nammerha platform.',
            de: 'Rückerstattungs- und Treuhandrichtlinie der Nammerha-Plattform.',
            fr: 'Politique de remboursement de la plateforme Nammerha.',
            tr: 'Nammerha platformu iade ve emanet politikası.',
        },
    },
    'contact': {
        title: {
            ar: 'نعمِّرها — تواصل معنا',
            en: 'Nammerha — Contact Us',
            de: 'Nammerha — Kontakt',
            fr: 'Nammerha — Contactez-nous',
            tr: 'Nammerha — İletişim',
        },
        description: {
            ar: 'تواصل مع فريق نعمِّرها لأي استفسارات.',
            en: 'Get in touch with the Nammerha team.',
            de: 'Kontaktieren Sie das Nammerha-Team.',
            fr: 'Contactez l\'équipe Nammerha.',
            tr: 'Nammerha ekibiyle iletişime geçin.',
        },
    },
};

// ─── Default Metadata (fallback for pages not in PAGE_SEO) ──────────────
const DEFAULT_META: LocalizedMeta = {
    title: {
        ar: 'نعمِّرها — إعادة الإعمار',
        en: 'Nammerha — Reconstruction',
        de: 'Nammerha — Wiederaufbau',
        fr: 'Nammerha — Reconstruction',
        tr: 'Nammerha — Yeniden Yapım',
    },
    description: {
        ar: 'منصة لإعادة إعمار سوريا.',
        en: 'Transparent platform for Syria\'s reconstruction.',
        de: 'Transparente Plattform für den Wiederaufbau Syriens.',
        fr: 'Plateforme transparente pour la reconstruction de la Syrie.',
        tr: 'Suriye\'nin yeniden yapımı için şeffaf platform.',
    },
};

const BASE_URL = 'https://nammerha.com';

// ─── Vite Plugin ────────────────────────────────────────────────────────────

export default function seoLocalePlugin(): Plugin {
    return {
        name: 'nammerha-seo-locale',
        enforce: 'post', // Run after all other transforms

        transformIndexHtml: {
            order: 'post',
            handler(html: string, ctx): IndexHtmlTransformResult {
                // Extract page name from filename (e.g., 'donor-basket.html' → 'donor-basket')
                const filename = ctx.filename ?? ctx.path ?? '';
                const pageName = filename
                    .split('/')
                    .pop()
                    ?.replace('.html', '') ?? 'index';

                // Lookup SEO metadata
                const seo = PAGE_SEO[pageName] ?? DEFAULT_META;

                // Build hreflang link tags
                const hreflangTags = SUPPORTED_LOCALES.map(
                    (locale) =>
                        `<link rel="alternate" hreflang="${locale}" href="${BASE_URL}/${locale}/${pageName === 'index' ? '' : pageName}"/>`
                );
                // x-default → Arabic (platform primary language)
                hreflangTags.push(
                    `<link rel="alternate" hreflang="x-default" href="${BASE_URL}/ar/${pageName === 'index' ? '' : pageName}"/>`
                );

                // Build OpenGraph locale tags
                const ogTags = [
                    `<meta property="og:locale" content="${OG_LOCALE_MAP['ar']}"/>`,
                    ...SUPPORTED_LOCALES
                        .filter((l) => l !== 'ar')
                        .map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE_MAP[l]}"/>`),
                ];

                // Build multilingual meta description (default to Arabic for crawlers)
                const descriptionTag = `<meta name="description" content="${seo.description['ar'] ?? ''}"/>`;

                // Inject into <head>
                const injection = [
                    `    <!-- P2-NEW-001: SEO Locale tags injected by vite-plugin-seo-locale -->`,
                    `    ${hreflangTags.join('\n    ')}`,
                    `    ${ogTags.join('\n    ')}`,
                ].join('\n');

                // Replace or inject description
                let result = html;
                if (result.includes('name="description"')) {
                    result = result.replace(
                        /<meta\s+name="description"\s+content="[^"]*"[^>]*>/,
                        descriptionTag
                    );
                } else {
                    result = result.replace('</head>', `    ${descriptionTag}\n</head>`);
                }

                // Inject hreflang and og tags before </head>
                result = result.replace('</head>', `${injection}\n</head>`);

                return result;
            },
        },
    };
}
