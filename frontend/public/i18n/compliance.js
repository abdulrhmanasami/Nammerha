/**
 * Nammerha i18n — compliance dictionary chunk
 * P0-I18N-001 FIX: Added 2 orphan keys — auditor dashboard heading and description.
 * Keys: 2
 */
(function () {
    'use strict';
    if (typeof window.__nmDictMerge === 'function') {
        window.__nmDictMerge({
        'auditor_dashboard_heading': { ar: 'لوحة التدقيق المالي', de: 'Finanzprüfungs-Dashboard', fr: 'Tableau de bord d\'audit financier', tr: 'Finansal Denetim Paneli' },
        'auditor_dashboard_desc': { ar: 'مراقبة الامتثال والشفافية المالية', de: 'Compliance- und Finanztransparenzüberwachung', fr: 'Surveillance de la conformité et de la transparence financière', tr: 'Uyumluluk ve finansal şeffaflık izleme' },

        // ═══ CP1: compliance-dashboard HTML keys (not in admin.js) ═══
        'coming_soon': { ar: 'قريباً', de: 'Demnächst', fr: 'Bientôt', tr: 'Yakında' },
        'contractor_pending': { ar: 'مقاولون بانتظار المراجعة', de: 'Auftragnehmer ausstehend', fr: 'Entrepreneurs en attente', tr: 'Bekleyen yükleniciler' },
        'rev_loading': { ar: 'جاري التحميل...', de: 'Wird geladen...', fr: 'Chargement...', tr: 'Yükleniyor...' },

        // ═══ CP2: compliance-dashboard.ts runtime keys ═══
        'compliance_action_failed': { ar: 'فشل الإجراء', de: 'Aktion fehlgeschlagen', fr: 'Échec de l\'action', tr: 'İşlem başarısız' },
        'compliance_intact': { ar: 'سليم', de: 'Intakt', fr: 'Intact', tr: 'Sağlam' }
        });
    }
})();
