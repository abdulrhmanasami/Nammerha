// ============================================================================
// Nammerha Backend — Locale Service (Ticket 10.2)
// Locale Detection, Hreflang Generation, Suggestion Banner
// ============================================================================
// Per "تأسيس محرك ترجمة احترافي للمنصة.md":
//   §4: IP Geolocation with GDPR compliance (no IP storage)
//   §4.3: NO forced redirects — suggestion banner only
//   §5: International SEO with hreflang tags
//   §6.4: Language names in native script (no flags)
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export type SupportedLocale = 'ar' | 'en' | 'de' | 'fr' | 'tr';

export interface LocaleDetectionResult {
    detected_locale: SupportedLocale;
    confidence: 'high' | 'medium' | 'low';
    source: 'accept_language' | 'ip_geolocation' | 'default';
    country_code?: string;
    suggested_currency?: string;
}

export interface HreflangTag {
    locale: SupportedLocale;
    href: string;
    rel: string;
    hreflang: string;
}

export interface SuggestionBanner {
    show: boolean;
    message_ar?: string;
    message_en?: string;
    suggested_locale: SupportedLocale;
    suggested_locale_name: string;
    current_locale: SupportedLocale;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SUPPORTED_LOCALES: SupportedLocale[] = ['ar', 'en', 'de', 'fr', 'tr'];

/**
 * Doc §6.4: Language names in NATIVE script (no flags).
 * "العربية، English، Deutsch، Français، Türkçe"
 */
const LOCALE_NAMES: Record<SupportedLocale, string> = {
    ar: 'العربية',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    tr: 'Türkçe',
};

/**
 * Map country codes to suggested locales + currencies.
 * Doc §4: "استنتاج لغة وعملة المستخدم بناءً على عنوان بروتوكول الإنترنت"
 */
const COUNTRY_TO_LOCALE: Record<string, { locale: SupportedLocale; currency: string }> = {
    // Arabic
    SY: { locale: 'ar', currency: 'SYP' },
    SA: { locale: 'ar', currency: 'SAR' },
    AE: { locale: 'ar', currency: 'AED' },
    QA: { locale: 'ar', currency: 'QAR' },
    KW: { locale: 'ar', currency: 'KWD' },
    JO: { locale: 'ar', currency: 'JOD' },
    LB: { locale: 'ar', currency: 'LBP' },
    IQ: { locale: 'ar', currency: 'IQD' },
    EG: { locale: 'ar', currency: 'EGP' },
    // German
    DE: { locale: 'de', currency: 'EUR' },
    AT: { locale: 'de', currency: 'EUR' },
    CH: { locale: 'de', currency: 'CHF' },
    LI: { locale: 'de', currency: 'CHF' },
    // French
    FR: { locale: 'fr', currency: 'EUR' },
    BE: { locale: 'fr', currency: 'EUR' },
    LU: { locale: 'fr', currency: 'EUR' },
    MC: { locale: 'fr', currency: 'EUR' },
    // Turkish
    TR: { locale: 'tr', currency: 'TRY' },
    CY: { locale: 'tr', currency: 'TRY' },
    // English (default for others)
    US: { locale: 'en', currency: 'USD' },
    GB: { locale: 'en', currency: 'GBP' },
    CA: { locale: 'en', currency: 'CAD' },
    AU: { locale: 'en', currency: 'AUD' },
    NZ: { locale: 'en', currency: 'NZD' },
};

// ─── Locale Detection ───────────────────────────────────────────────────────

/**
 * Detect user's preferred locale from Accept-Language header.
 * Doc §4.3: Combined with IP, but Accept-Language takes priority.
 */
export function detectLocaleFromHeader(acceptLanguage?: string): LocaleDetectionResult {
    if (!acceptLanguage) {
        return {
            detected_locale: 'ar',
            confidence: 'low',
            source: 'default',
        };
    }

    // Parse Accept-Language header (e.g. "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7,ar;q=0.5")
    const languages = acceptLanguage
        .split(',')
        .map((lang) => {
            const parts = lang.trim().split(';');
            const code = parts[0]?.trim().toLowerCase() ?? '';
            const qMatch = parts[1]?.match(/q=([\d.]+)/);
            const quality = qMatch ? Number(qMatch[1] ?? '1') : 1.0;
            return { code, quality };
        })
        .sort((a, b) => b.quality - a.quality);

    // Find first supported locale
    for (const lang of languages) {
        const shortCode = lang.code.substring(0, 2) as SupportedLocale;
        if (SUPPORTED_LOCALES.includes(shortCode)) {
            return {
                detected_locale: shortCode,
                confidence: lang.quality >= 0.8 ? 'high' : 'medium',
                source: 'accept_language',
            };
        }
    }

    // No match — default to Arabic (platform primary language)
    return {
        detected_locale: 'ar',
        confidence: 'low',
        source: 'default',
    };
}

/**
 * Detect locale from country code (from IP geolocation).
 * Doc §4.2: IP is used ONLY for suggestion, NOT stored (GDPR).
 */
export function detectLocaleFromCountry(countryCode: string): LocaleDetectionResult {
    const upper = countryCode.toUpperCase();
    const mapping = COUNTRY_TO_LOCALE[upper];

    if (mapping) {
        return {
            detected_locale: mapping.locale,
            confidence: 'medium',
            source: 'ip_geolocation',
            country_code: upper,
            suggested_currency: mapping.currency,
        };
    }

    return {
        detected_locale: 'en',
        confidence: 'low',
        source: 'ip_geolocation',
        country_code: upper,
        suggested_currency: 'USD',
    };
}

/**
 * Combined locale detection: Accept-Language header + optional IP country code.
 * Accept-Language takes priority (doc §4.3).
 */
export function detectLocale(
    acceptLanguage?: string,
    countryCode?: string
): LocaleDetectionResult {
    const headerResult = detectLocaleFromHeader(acceptLanguage);

    // If header gave high confidence, use it
    if (headerResult.confidence === 'high') {
        // Enrich with country-based currency if available
        if (countryCode) {
            const countryResult = detectLocaleFromCountry(countryCode);
            headerResult.country_code = countryResult.country_code;
            headerResult.suggested_currency = countryResult.suggested_currency;
        }
        return headerResult;
    }

    // If country code available and header was low confidence, prefer IP
    if (countryCode) {
        const countryResult = detectLocaleFromCountry(countryCode);
        if (countryResult.confidence === 'medium' && headerResult.confidence === 'low') {
            return countryResult;
        }
    }

    return headerResult;
}

// ─── Hreflang Generation (Doc §5.2) ────────────────────────────────────────

/**
 * Generate hreflang link tags for a given URL path.
 * Doc §5.2: Prevents Google "duplicate content" penalties.
 *
 * Output example for path "/projects/123":
 * [
 *   { locale: 'ar', href: 'https://nammerha.com/ar/projects/123', hreflang: 'ar' },
 *   { locale: 'en', href: 'https://nammerha.com/en/projects/123', hreflang: 'en' },
 *   ...
 *   { locale: 'ar', href: 'https://nammerha.com/ar/projects/123', hreflang: 'x-default' }
 * ]
 */
export function generateHreflangTags(
    urlPath: string,
    baseUrl?: string
): HreflangTag[] {
    const base = baseUrl || process.env.PLATFORM_URL || 'https://nammerha.com';
    // Clean path
    const cleanPath = urlPath.replace(/^\/(ar|en|de|fr|tr)\//, '/');

    const tags: HreflangTag[] = SUPPORTED_LOCALES.map((locale) => ({
        locale,
        href: `${base}/${locale}${cleanPath}`,
        rel: 'alternate',
        hreflang: locale,
    }));

    // x-default points to Arabic (platform primary language)
    tags.push({
        locale: 'ar',
        href: `${base}/ar${cleanPath}`,
        rel: 'alternate',
        hreflang: 'x-default',
    });

    return tags;
}

// ─── Suggestion Banner (Doc §4.3) ───────────────────────────────────────────

/**
 * Build suggestion banner data.
 * Doc §4.3: "لافتة إشعار علوية ذكية (Inline Suggestion/Banner)"
 * "هل تفضل الانتقال إلى النسخة الألمانية؟"
 *
 * NO forced redirects — suggestion only.
 */
export function buildSuggestionBanner(
    currentLocale: SupportedLocale,
    detectedLocale: SupportedLocale
): SuggestionBanner {
    // Don't show banner if already on the right locale
    if (currentLocale === detectedLocale) {
        return {
            show: false,
            suggested_locale: detectedLocale,
            suggested_locale_name: LOCALE_NAMES[detectedLocale],
            current_locale: currentLocale,
        };
    }

    const suggestedName = LOCALE_NAMES[detectedLocale];

    return {
        show: true,
        message_ar: `يبدو أنك تفضل ${suggestedName}. هل تود الانتقال؟`,
        message_en: `It looks like you prefer ${suggestedName}. Would you like to switch?`,
        suggested_locale: detectedLocale,
        suggested_locale_name: suggestedName,
        current_locale: currentLocale,
    };
}

/**
 * Get list of supported languages with native names.
 * Doc §6.4: Native names only, no flags.
 */
export function getSupportedLanguages(): Array<{
    code: SupportedLocale;
    name: string;
    dir: 'rtl' | 'ltr';
}> {
    return [
        { code: 'ar', name: 'العربية', dir: 'rtl' },
        { code: 'en', name: 'English', dir: 'ltr' },
        { code: 'de', name: 'Deutsch', dir: 'ltr' },
        { code: 'fr', name: 'Français', dir: 'ltr' },
        { code: 'tr', name: 'Türkçe', dir: 'ltr' },
    ];
}

export { SUPPORTED_LOCALES, LOCALE_NAMES };
