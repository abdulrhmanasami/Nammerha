// ============================================================================
// Nammerha Frontend — i18n Bridge for Map Modules
// Lightweight accessor for the global i18n DICT from i18n.js
// ============================================================================

/**
 * Global i18n dictionary type (injected by public/i18n.js IIFE).
 * The dictionary is a var-scoped `DICT` inside the IIFE, so we access it
 * indirectly via the DOM: reading data-i18n-original attributes or
 * by accessing the window's language state.
 *
 * For programmatic JS modules that generate DOM dynamically (map popups,
 * filter labels), we keep a local mini-dictionary that mirrors the keys
 * from i18n.js. This avoids coupling to the IIFE's internal scope.
 */

// Mini-dictionary for map-specific keys (mirrors public/i18n.js entries)
const MAP_DICT: Record<string, Record<string, string>> = {
    // Filter Controls
    filter_all: { ar: 'الكل', de: 'Alle', fr: 'Tout', tr: 'Tümü', en: 'All' },
    filter_needs_funding: { ar: 'بحاجة لتمويل', de: 'Finanzierung benötigt', fr: 'Besoin de financement', tr: 'Finansman Gerekli', en: 'Needs Funding' },
    filter_in_progress: { ar: 'قيد التنفيذ', de: 'In Bearbeitung', fr: 'En cours', tr: 'Devam Ediyor', en: 'In Progress' },
    filter_completed: { ar: 'مكتمل', de: 'Abgeschlossen', fr: 'Terminé', tr: 'Tamamlandı', en: 'Completed' },

    // Popup Labels
    map_funded: { ar: 'ممول', de: 'Finanziert', fr: 'Financé', tr: 'Finanse Edildi', en: 'Funded' },
    map_view_project: { ar: 'عرض المشروع ←', de: 'Projekt ansehen →', fr: 'Voir le projet →', tr: 'Projeyi Görüntüle →', en: 'View Project →' },

    // Status Badges
    map_status_needs_funding: { ar: '🟡 بحاجة لتمويل', de: '🟡 Finanzierung benötigt', fr: '🟡 Besoin de financement', tr: '🟡 Finansman Gerekli', en: '🟡 Needs Funding' },
    map_status_in_progress: { ar: '🔵 قيد التنفيذ', de: '🔵 In Bearbeitung', fr: '🔵 En cours', tr: '🔵 Devam Ediyor', en: '🔵 In Progress' },
    map_status_completed: { ar: '🟢 مكتمل', de: '🟢 Abgeschlossen', fr: '🟢 Terminé', tr: '🟢 Tamamlandı', en: '🟢 Completed' },

    // Stats Overlay
    map_loading: { ar: 'جاري التحميل...', de: 'Wird geladen...', fr: 'Chargement...', tr: 'Yükleniyor...', en: 'Loading...' },
    map_active_projects_count: { ar: '{count} مشروع نشط', de: '{count} aktive Projekte', fr: '{count} projets actifs', tr: '{count} Aktif Proje', en: '{count} Active Projects' },

    // Region Names
    map_region_syria: { ar: 'سوريا', de: 'Syrien', fr: 'Syrie', tr: 'Suriye', en: 'Syria' },
    map_region_damascus: { ar: 'دمشق', de: 'Damaskus', fr: 'Damas', tr: 'Şam', en: 'Damascus' },
    map_region_aleppo: { ar: 'حلب', de: 'Aleppo', fr: 'Alep', tr: 'Halep', en: 'Aleppo' },
    map_region_homs: { ar: 'حمص', de: 'Homs', fr: 'Homs', tr: 'Humus', en: 'Homs' },
    map_region_hama: { ar: 'حماة', de: 'Hama', fr: 'Hama', tr: 'Hama', en: 'Hama' },
    map_region_lattakia: { ar: 'اللاذقية', de: 'Latakia', fr: 'Lattaquié', tr: 'Lazkiye', en: 'Lattakia' },
    map_region_deir_ez_zor: { ar: 'دير الزور', de: 'Deir ez-Zor', fr: 'Deir ez-Zor', tr: 'Deyrizor', en: 'Deir ez-Zor' },
    map_region_raqqa: { ar: 'الرقة', de: 'ar-Raqqa', fr: 'Raqqa', tr: 'Rakka', en: 'Raqqa' },
    map_region_daraa: { ar: 'درعا', de: 'Daraa', fr: 'Daraa', tr: 'Dera', en: 'Daraa' },
    map_region_idlib: { ar: 'إدلب', de: 'Idlib', fr: 'Idleb', tr: 'İdlib', en: 'Idlib' },
    map_region_hasakah: { ar: 'الحسكة', de: 'al-Hasaka', fr: 'Hassaké', tr: 'Haseke', en: 'Al-Hasakah' },
};

/**
 * Get the current page language from the <html lang="..."> attribute.
 * Falls back to 'en' if not set.
 */
function getCurrentLang(): string {
    return document.documentElement.getAttribute('lang') ?? 'en';
}

/**
 * Translate a key using the map's mini-dictionary.
 * Falls back to the provided English default if the key is not found.
 *
 * @param key - i18n key (must match a key in MAP_DICT and i18n.js DICT)
 * @param fallback - English fallback text
 * @returns Translated string in the current language
 */
export function t(key: string, fallback: string): string {
    const lang = getCurrentLang();
    if (lang === 'en') {
        return fallback;
    }

    const entry = MAP_DICT[key];
    if (entry && entry[lang]) {
        return entry[lang];
    }

    return fallback;
}

/**
 * Translate a key with parameter substitution.
 * Use {paramName} placeholders in the translation strings.
 *
 * @example
 * tParams('map_active_projects_count', '{count} Active Projects', { count: 42 })
 * // Arabic: "42 مشروع نشط"
 */
export function tParams(key: string, fallback: string, params: Record<string, string | number>): string {
    let result = t(key, fallback);
    for (const [paramKey, paramValue] of Object.entries(params)) {
        result = result.replace(`{${paramKey}}`, String(paramValue));
    }
    return result;
}
