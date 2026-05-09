/**
 * Nammerha i18n — Common Dictionary (shared across ALL portals)
 * PLAT-AUD-R4: These keys are used in every portal HTML via data-i18n
 * but were never defined in any dictionary file.
 * Keys: 17
 */
(function () {
    'use strict';
    if (typeof window.__nmDictMerge === 'function') {
        window.__nmDictMerge({
        /* ── Navigation & Layout ────────────────────────────────────────── */
        'skip_to_content': { ar: 'تخطي إلى المحتوى', de: 'Zum Inhalt springen', fr: 'Aller au contenu', tr: 'İçeriğe geç' },
        'nav_profile': { ar: 'الملف الشخصي', de: 'Profil', fr: 'Profil', tr: 'Profil' },
        'nav_projects': { ar: 'المشاريع', de: 'Projekte', fr: 'Projets', tr: 'Projeler' },
        'common_dashboard': { ar: 'لوحة التحكم', de: 'Dashboard', fr: 'Tableau de bord', tr: 'Kontrol Paneli' },
        'common_logout': { ar: 'تسجيل الخروج', de: 'Abmelden', fr: 'Déconnexion', tr: 'Çıkış Yap' },
        'admin_dashboard': { ar: 'لوحة الإدارة', de: 'Admin-Dashboard', fr: "Tableau de bord admin", tr: 'Yönetim Paneli' },

        /* ── Common Actions ─────────────────────────────────────────────── */
        'common_cancel': { ar: 'إلغاء', de: 'Abbrechen', fr: 'Annuler', tr: 'İptal' },
        'common_done': { ar: 'تم', de: 'Fertig', fr: 'Terminé', tr: 'Tamam' },
        'common_edit': { ar: 'تعديل', de: 'Bearbeiten', fr: 'Modifier', tr: 'Düzenle' },
        'common_filter': { ar: 'تصفية', de: 'Filtern', fr: 'Filtrer', tr: 'Filtrele' },
        'common_verified': { ar: 'موثّق', de: 'Verifiziert', fr: 'Vérifié', tr: 'Doğrulanmış' },

        /* ── Empty States ───────────────────────────────────────────────── */
        'common_no_data': { ar: 'لا توجد بيانات', de: 'Keine Daten', fr: 'Aucune donnée', tr: 'Veri yok' },
        'common_no_data_desc': { ar: 'لا توجد بيانات للعرض حالياً', de: 'Keine Daten zur Anzeige', fr: 'Aucune donnée à afficher', tr: 'Gösterilecek veri yok' },

        /* ── Footer ─────────────────────────────────────────────────────── */
        'footer_copyright': { ar: '© 2026 نعمِّرها. جميع الحقوق محفوظة.', de: '© 2026 Nammerha. Alle Rechte vorbehalten.', fr: '© 2026 Nammerha. Tous droits réservés.', tr: '© 2026 Nammerha. Tüm hakları saklıdır.' },
        'footer_terms': { ar: 'الشروط والأحكام', de: 'AGB', fr: "Conditions d'utilisation", tr: 'Kullanım Koşulları' },
        'footer_privacy': { ar: 'سياسة الخصوصية', de: 'Datenschutz', fr: 'Politique de confidentialité', tr: 'Gizlilik Politikası' },
        'footer_refund': { ar: 'سياسة الاسترداد', de: 'Rückerstattung', fr: 'Politique de remboursement', tr: 'İade Politikası' },

        /* ── 404 Error Page ────────────────────────────────────────────── */
        'error_404_title': { ar: 'الصفحة غير موجودة', de: 'Seite nicht gefunden', fr: 'Page introuvable', tr: 'Sayfa Bulunamadı' },
        'error_404_desc': { ar: 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها. دعنا نعيدك إلى المسار الصحيح.', de: 'Die gesuchte Seite existiert nicht oder wurde verschoben. Lassen Sie uns Sie zurückbringen.', fr: 'La page que vous recherchez n\'existe pas ou a été déplacée. Remettons-vous sur la bonne voie.', tr: 'Aradığınız sayfa mevcut değil veya taşınmış. Sizi doğru yola geri götürelim.' },
        'error_404_go_home': { ar: 'الذهاب للصفحة الرئيسية', de: 'Zur Startseite', fr: 'Aller à l\'accueil', tr: 'Ana Sayfaya Git' },
        'error_404_go_back': { ar: 'العودة للخلف', de: 'Zurück', fr: 'Retour', tr: 'Geri Dön' }
        });
    }
})();
