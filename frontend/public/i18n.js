/**
 * Nammerha — Client-Side i18n Engine (Production v3)
 * ═══════════════════════════════════════════════════════════════
 * Zero-API, instant language switching with embedded static dictionary.
 *
 * Per "تأسيس محرك ترجمة احترافي للمنصة.md":
 *   §6.1: RTL/LTR mirroring via dir="rtl" on <html>
 *   §6.2: Bilingual typography (IBM Plex Sans Arabic / Plus Jakarta Sans)
 *   §6.4: Native language names (no flags), localStorage persistence
 *   §6.5: Sustainable UX — zero network dependency for UI translation
 *
 * Features:
 *   - 5 languages: AR, EN, DE, FR, TR
 *   - 120+ translation keys covering all 11 pages
 *   - RTL/LTR switching with dir="" on <html>
 *   - Dynamic bilingual font injection (IBM Plex Sans Arabic)
 *   - localStorage persistence (nm_preferred_locale)
 *   - Translates data-i18n elements, data-i18n-placeholder, data-i18n-aria, and text nodes
 *   - Language selector widget (Phosphor Globe icon)
 */
(function () {
    'use strict';

    // ─── Supported Languages ──────────────────────────────────────────────
    var LANGS = [
        { code: 'ar', name: 'العربية', dir: 'rtl' },
        { code: 'en', name: 'English', dir: 'ltr' },
        { code: 'de', name: 'Deutsch', dir: 'ltr' },
        { code: 'fr', name: 'Français', dir: 'ltr' },
        { code: 'tr', name: 'Türkçe', dir: 'ltr' },
    ];

    var STORAGE_KEY = 'nm_preferred_locale';
    var BANNER_DISMISS_KEY = 'nm_suggestion_dismissed';

    // ─── Suggestion Banner Messages (Doc §4.3) ──────────────────────────
    // "لافتة إشعار علوية ذكية (Inline Suggestion/Banner)"
    // "هل تفضل الانتقال إلى النسخة الألمانية؟" — NO forced redirects.
    var BANNER_MSGS = {
        ar: { suggest: 'يبدو أنك تفضل {lang}. هل تود التبديل؟', switch: 'تبديل', dismiss: 'لاحقاً' },
        en: { suggest: 'It looks like you prefer {lang}. Would you like to switch?', switch: 'Switch', dismiss: 'Later' },
        de: { suggest: 'Es sieht so aus, als würden Sie {lang} bevorzugen. Möchten Sie wechseln?', switch: 'Wechseln', dismiss: 'Später' },
        fr: { suggest: 'Il semble que vous préfériez {lang}. Souhaitez-vous changer ?', switch: 'Changer', dismiss: 'Plus tard' },
        tr: { suggest: '{lang} tercih ettiğiniz görünüyor. Değiştirmek ister misiniz?', switch: 'Değiştir', dismiss: 'Sonra' },
    };

    // ─── Bilingual Typography (Doc §6.2) ─────────────────────────────────
    // "Plus Jakarta Sans" for Latin/European, "IBM Plex Sans Arabic" for Arabic
    // PLT-OPT-002: Self-hosted woff2 fonts — zero Google CDN dependency.
    // Critical for Sustainable UX §6.5 (Syria low-bandwidth environments).
    var ARABIC_FONT_LOADED = false;
    function loadArabicFont() {
        if (ARABIC_FONT_LOADED) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/fonts/ibm-plex-sans-arabic.css';
        document.head.appendChild(link);
        ARABIC_FONT_LOADED = true;
    }

    function applyTypography(langCode) {
        if (langCode === 'ar') {
            loadArabicFont();
            document.body.style.fontFamily = '"IBM Plex Sans Arabic", "Plus Jakarta Sans", sans-serif';
        } else {
            document.body.style.fontFamily = '"Plus Jakarta Sans", "Inter", sans-serif';
        }
    }

    // ─── Static Translation Dictionary ────────────────────────────────────
    // Key = data-i18n attribute value OR exact English text for TreeWalker
    // Each key maps to { ar, de, fr, tr } translations (English = original)
    var DICT = {
        // ═══ NAVIGATION (all pages) ═══
        'nav_home': { ar: 'الرئيسية', de: 'Startseite', fr: 'Accueil', tr: 'Ana Sayfa' },
        'nav_projects': { ar: 'المشاريع', de: 'Projekte', fr: 'Projets', tr: 'Projeler' },
        'nav_impact': { ar: 'الأثر', de: 'Wirkung', fr: 'Impact', tr: 'Etki' },
        'nav_wallet': { ar: 'المحفظة', de: 'Geldbörse', fr: 'Portefeuille', tr: 'Cüzdan' },
        'nav_profile': { ar: 'الحساب', de: 'Profil', fr: 'Profil', tr: 'Profil' },
        'nav_explore': { ar: 'استكشاف', de: 'Entdecken', fr: 'Explorer', tr: 'Keşfet' },
        // P2-AUD-003 FIX: nav.js theme toggle titles (was hardcoded Arabic)
        'nav_theme_light': { ar: 'وضع النهار', de: 'Heller Modus', fr: 'Mode clair', tr: 'Açık Mod' },
        'nav_theme_dark': { ar: 'وضع الليل', de: 'Dunkler Modus', fr: 'Mode sombre', tr: 'Karanlık Mod' },

        // ═══ COMMON UI ELEMENTS ═══
        'save': { ar: 'حفظ', de: 'Speichern', fr: 'Enregistrer', tr: 'Kaydet' },
        'submit': { ar: 'إرسال', de: 'Einreichen', fr: 'Soumettre', tr: 'Gönder' },
        'cancel': { ar: 'إلغاء', de: 'Abbrechen', fr: 'Annuler', tr: 'İptal' },
        'next': { ar: 'التالي', de: 'Weiter', fr: 'Suivant', tr: 'İleri' },
        'back': { ar: 'رجوع', de: 'Zurück', fr: 'Retour', tr: 'Geri' },
        'remove': { ar: 'إزالة', de: 'Entfernen', fr: 'Supprimer', tr: 'Kaldır' },
        'total': { ar: 'المجموع', de: 'Gesamt', fr: 'Total', tr: 'Toplam' },
        'verified': { ar: 'معتمد', de: 'Verifiziert', fr: 'Vérifié', tr: 'Doğrulandı' },
        'funded': { ar: 'ممول', de: 'Finanziert', fr: 'Financé', tr: 'Finanse Edildi' },
        'raised': { ar: 'تم جمع', de: 'Gesammelt', fr: 'Collecté', tr: 'Toplanan' },
        'verify': { ar: 'تحقق', de: 'Verifizieren', fr: 'Vérifier', tr: 'Doğrula' },
        'cost': { ar: 'التكلفة:', de: 'Kosten:', fr: 'Coût :', tr: 'Maliyet:' },
        'status': { ar: 'الحالة', de: 'Status', fr: 'Statut', tr: 'Durum' },
        'value': { ar: 'القيمة', de: 'Wert', fr: 'Valeur', tr: 'Değer' },
        'title': { ar: 'العنوان', de: 'Titel', fr: 'Titre', tr: 'Başlık' },
        'project_id': { ar: 'معرف المشروع', de: 'Projekt-ID', fr: 'ID du projet', tr: 'Proje Kimliği' },

        // ═══ SEARCH ═══

        // ═══ TRUST / ESCROW BANNER ═══
        'funds_held_in_escrow': { ar: 'أموال محفوظة في حساب ضمان', de: 'Gelder auf Treuhandkonto', fr: 'Fonds en entiercement', tr: 'Emanette tutulan fonlar' },

        // ═══ FUND NOW BUTTON ═══
        'fund_now': { ar: 'موّل الآن', de: 'Jetzt finanzieren', fr: 'Financer maintenant', tr: 'Şimdi Finanse Et' },

        // ═══ INTERACTIVE MAP ═══
        // Filter Controls (map-controls.ts)
        'filter_all': { ar: 'الكل', de: 'Alle', fr: 'Tout', tr: 'Tümü' },
        'filter_needs_funding': { ar: 'بحاجة لتمويل', de: 'Finanzierung benötigt', fr: 'Besoin de financement', tr: 'Finansman Gerekli' },
        'filter_in_progress': { ar: 'قيد التنفيذ', de: 'In Bearbeitung', fr: 'En cours', tr: 'Devam Ediyor' },
        'filter_completed': { ar: 'مكتمل', de: 'Abgeschlossen', fr: 'Terminé', tr: 'Tamamlandı' },

        // Marker Popup Labels (map-markers.ts)
        'map_funded': { ar: 'ممول', de: 'Finanziert', fr: 'Financé', tr: 'Finanse Edildi' },
        'map_view_project': { ar: 'عرض المشروع ←', de: 'Projekt ansehen →', fr: 'Voir le projet →', tr: 'Projeyi Görüntüle →' },

        // Status Badges
        'map_status_needs_funding': { ar: '🟡 بحاجة لتمويل', de: '🟡 Finanzierung benötigt', fr: '🟡 Besoin de financement', tr: '🟡 Finansman Gerekli' },
        'map_status_in_progress': { ar: '🔵 قيد التنفيذ', de: '🔵 In Bearbeitung', fr: '🔵 En cours', tr: '🔵 Devam Ediyor' },
        'map_status_completed': { ar: '🟢 مكتمل', de: '🟢 Abgeschlossen', fr: '🟢 Terminé', tr: '🟢 Tamamlandı' },

        // Stats Overlay (homepage-map.ts)
        'map_loading': { ar: 'جاري التحميل...', de: 'Wird geladen...', fr: 'Chargement...', tr: 'Yükleniyor...' },
        'map_active_projects_count': { ar: '{count} مشروع نشط', de: '{count} aktive Projekte', fr: '{count} projets actifs', tr: '{count} Aktif Proje' },

        // Syrian Governorate Names (region resolver)
        'map_region_syria': { ar: 'سوريا', de: 'Syrien', fr: 'Syrie', tr: 'Suriye' },
        'map_region_damascus': { ar: 'دمشق', de: 'Damaskus', fr: 'Damas', tr: 'Şam' },
        'map_region_aleppo': { ar: 'حلب', de: 'Aleppo', fr: 'Alep', tr: 'Halep' },
        'map_region_homs': { ar: 'حمص', de: 'Homs', fr: 'Homs', tr: 'Humus' },
        'map_region_hama': { ar: 'حماة', de: 'Hama', fr: 'Hama', tr: 'Hama' },
        'map_region_lattakia': { ar: 'اللاذقية', de: 'Latakia', fr: 'Lattaquié', tr: 'Lazkiye' },
        'map_region_deir_ez_zor': { ar: 'دير الزور', de: 'Deir ez-Zor', fr: 'Deir ez-Zor', tr: 'Deyrizor' },
        'map_region_raqqa': { ar: 'الرقة', de: 'ar-Raqqa', fr: 'Raqqa', tr: 'Rakka' },
        'map_region_daraa': { ar: 'درعا', de: 'Daraa', fr: 'Daraa', tr: 'Dera' },
        'map_region_idlib': { ar: 'إدلب', de: 'Idlib', fr: 'Idleb', tr: 'İdlib' },
        'map_region_hasakah': { ar: 'الحسكة', de: 'al-Hasaka', fr: 'Hassaké', tr: 'Haseke' },

        // ═══ COMMON UI / SHARED KEYS ═══
        'common_loading': { ar: 'جاري التحميل...', de: 'Wird geladen...', fr: 'Chargement...', tr: 'Yükleniyor...' },
        'common_logout': { ar: 'تسجيل خروج', de: 'Abmelden', fr: 'Déconnexion', tr: 'Çıkış Yap' },
        'common_profile': { ar: 'الملف الشخصي', de: 'Profil', fr: 'Profil', tr: 'Profil' },
        'common_status': { ar: 'الحالة', de: 'Status', fr: 'Statut', tr: 'Durum' },
        'common_action': { ar: 'إجراء', de: 'Aktion', fr: 'Action', tr: 'İşlem' },
        'common_project': { ar: 'المشروع', de: 'Projekt', fr: 'Projet', tr: 'Proje' },
        'common_amount': { ar: 'المبلغ', de: 'Betrag', fr: 'Montant', tr: 'Tutar' },
        'common_material': { ar: 'المادة', de: 'Material', fr: 'Matériau', tr: 'Malzeme' },
        'common_qty': { ar: 'الكمية', de: 'Menge', fr: 'Quantité', tr: 'Miktar' },
        'common_verified': { ar: 'معتمد', de: 'Verifiziert', fr: 'Vérifié', tr: 'Doğrulandı' },
        'common_po_number': { ar: 'رقم أمر الشراء', de: 'Bestellnummer', fr: 'N° de commande', tr: 'Sipariş No' },
        // P2-U1 FIX: Error retry and skip link i18n keys
        'failed_to_load': { ar: 'فشل في التحميل', de: 'Laden fehlgeschlagen', fr: 'Échec du chargement', tr: 'Yükleme başarısız' },
        'retry': { ar: 'إعادة المحاولة', de: 'Erneut versuchen', fr: 'Réessayer', tr: 'Tekrar Dene' },
        'skip_to_content': { ar: 'تخطي إلى المحتوى', de: 'Zum Inhalt springen', fr: 'Aller au contenu', tr: 'İçeriğe atla' },

        // ═══ ARIA-LABEL TRANSLATIONS (P1-I18N-002 FIX: WCAG accessible names) ═══
        'aria_toggle_sidebar': { ar: 'تبديل الشريط الجانبي', de: 'Seitenleiste umschalten', fr: 'Basculer la barre latérale', tr: 'Kenar çubuğunu aç/kapat' },
        'aria_toggle_password': { ar: 'إظهار/إخفاء كلمة المرور', de: 'Passwort-Sichtbarkeit umschalten', fr: 'Afficher/masquer le mot de passe', tr: 'Şifre görünürlüğünü değiştir' },
        'aria_notifications': { ar: 'الإشعارات', de: 'Benachrichtigungen', fr: 'Notifications', tr: 'Bildirimler' },
        'aria_construction_basket': { ar: 'سلة البناء', de: 'Baukorb', fr: 'Panier de construction', tr: 'İnşaat Sepeti' },
        'aria_clear_cart': { ar: 'إفراغ السلة', de: 'Warenkorb leeren', fr: 'Vider le panier', tr: 'Sepeti temizle' },
        'aria_custom_amount': { ar: 'مبلغ دعم مخصص', de: 'Benutzerdefinierter Unterstützungsbetrag', fr: 'Montant de soutien personnalisé', tr: 'Özel destek tutarı' },
        'aria_back': { ar: 'رجوع', de: 'Zurück', fr: 'Retour', tr: 'Geri' },
        'aria_go_back': { ar: 'الرجوع للخلف', de: 'Zurückgehen', fr: 'Revenir en arrière', tr: 'Geri dön' },
        'aria_search': { ar: 'بحث', de: 'Suchen', fr: 'Rechercher', tr: 'Ara' },
        'aria_profile': { ar: 'الملف الشخصي', de: 'Profil', fr: 'Profil', tr: 'Profil' },
        'aria_toggle_billing': { ar: 'تبديل الفوترة السنوية', de: 'Jährliche Abrechnung umschalten', fr: 'Basculer la facturation annuelle', tr: 'Yıllık faturalamayı değiştir' },
        'aria_refresh_data': { ar: 'تحديث البيانات', de: 'Daten aktualisieren', fr: 'Actualiser les données', tr: 'Verileri yenile' },
        'aria_transaction_history': { ar: 'سجل المعاملات', de: 'Transaktionsverlauf', fr: 'Historique des transactions', tr: 'İşlem geçmişi' },
        'loading': { ar: 'جاري التحميل...', de: 'Wird geladen...', fr: 'Chargement...', tr: 'Yükleniyor...' },
        'settings': { ar: 'الإعدادات', de: 'Einstellungen', fr: 'Paramètres', tr: 'Ayarlar' },
        'profile': { ar: 'الملف الشخصي', de: 'Profil', fr: 'Profil', tr: 'Profil' },
        'projects': { ar: 'المشاريع', de: 'Projekte', fr: 'Projets', tr: 'Projeler' },
        'location': { ar: 'الموقع', de: 'Standort', fr: 'Emplacement', tr: 'Konum' },
        'type': { ar: 'النوع', de: 'Typ', fr: 'Type', tr: 'Tür' },
        'electrical': { ar: 'كهربائي', de: 'Elektrisch', fr: 'Électrique', tr: 'Elektrik' },
        'plumbing': { ar: 'سباكة', de: 'Sanitär', fr: 'Plomberie', tr: 'Tesisat' },
        'structural_damage': { ar: 'أضرار هيكلية', de: 'Strukturschäden', fr: 'Dommages structurels', tr: 'Yapısal Hasar' },
        'general_repair': { ar: 'إصلاح عام', de: 'Allgemeine Reparatur', fr: 'Réparation générale', tr: 'Genel Onarım' },
        'governorate': { ar: 'المحافظة', de: 'Gouvernement', fr: 'Gouvernorat', tr: 'İl' },
        'photos': { ar: 'الصور', de: 'Fotos', fr: 'Photos', tr: 'Fotoğraflar' },
        'estimated': { ar: 'مُقدّر', de: 'Geschätzt', fr: 'Estimé', tr: 'Tahmini' },
        'in_progress': { ar: 'قيد التنفيذ', de: 'In Bearbeitung', fr: 'En cours', tr: 'Devam Ediyor' },
        'fully_funded': { ar: 'مموّل بالكامل', de: 'Voll finanziert', fr: 'Entièrement financé', tr: 'Tamamen Finanse' },
        'matched': { ar: 'مُطابق', de: 'Zugeordnet', fr: 'Associé', tr: 'Eşleştirildi' },
        'sync': { ar: 'مزامنة', de: 'Synchronisieren', fr: 'Synchroniser', tr: 'Senkronize Et' },
        'gallery': { ar: 'المعرض', de: 'Galerie', fr: 'Galerie', tr: 'Galeri' },
        'oracle': { ar: 'المؤشر', de: 'Orakel', fr: 'Oracle', tr: 'Oracle' },
        'vendor_id': { ar: 'معرف المورد', de: 'Lieferanten-ID', fr: 'ID fournisseur', tr: 'Tedarikçi Kimliği' },
        'purchase_order': { ar: 'أمر الشراء', de: 'Bestellung', fr: 'Bon de commande', tr: 'Satın Alma Siparişi' },

        // ═══ ADMIN DASHBOARD NAVIGATION ═══
        'nav_dashboard': { ar: 'لوحة المتابعة', de: 'Dashboard', fr: 'Tableau de bord', tr: 'Kontrol Paneli' },
        'nav_donations': { ar: 'التبرعات', de: 'Spenden', fr: 'Dons', tr: 'Bağışlar' },
        'nav_escrow_management': { ar: 'إدارة الأمانات', de: 'Treuhandverwaltung', fr: 'Gestion d\'entiercement', tr: 'Emanet Yönetimi' },
        'nav_kyc_verification': { ar: 'التحقق من الهوية', de: 'KYC-Verifizierung', fr: 'Vérification KYC', tr: 'KYC Doğrulaması' },
        'nav_pricing_oracle': { ar: 'مؤشر الأسعار', de: 'Preisorakel', fr: 'Oracle des prix', tr: 'Fiyat Endeksi' },
        'nav_settings': { ar: 'الإعدادات', de: 'Einstellungen', fr: 'Paramètres', tr: 'Ayarlar' },
        'admin_portal': { ar: 'بوابة الإدارة', de: 'Admin-Portal', fr: 'Portail admin', tr: 'Yönetici Portalı' },
        'admin_command_center': { ar: 'مركز القيادة', de: 'Kommandozentrale', fr: 'Centre de commande', tr: 'Komuta Merkezi' },
        'admin_dashboard': { ar: 'لوحة المتابعة', de: 'Dashboard', fr: 'Tableau de bord', tr: 'Kontrol Paneli' },
        /* GAP-M02 FIX: Non-admin portals were reusing admin_dashboard (semantically wrong).
           common_dashboard is the correct key for generic "Dashboard" tabs. */
        'common_dashboard': { ar: 'لوحة التحكم', de: 'Dashboard', fr: 'Tableau de bord', tr: 'Kontrol Paneli' },
        'admin_active_projects': { ar: 'المشاريع النشطة', de: 'Aktive Projekte', fr: 'Projets actifs', tr: 'Aktif Projeler' },
        'admin_projects_desc': { ar: 'إجمالي المشاريع النشطة حالياً', de: 'Gesamte derzeit aktive Projekte', fr: 'Total des projets actuellement actifs', tr: 'Toplam aktif proje sayısı' },
        'admin_registered_eng': { ar: 'المهندسون المسجلون', de: 'Registrierte Ingenieure', fr: 'Ingénieurs inscrits', tr: 'Kayıtlı Mühendisler' },
        'admin_escrow_mgmt': { ar: 'إدارة الأمانات', de: 'Treuhandverwaltung', fr: 'Gestion d\'entiercement', tr: 'Emanet Yönetimi' },
        'admin_escrow_queue': { ar: 'قائمة التحقق', de: 'Verifizierungswarteschlange', fr: 'File de vérification', tr: 'Doğrulama Kuyruğu' },
        'admin_escrow_queue_desc': { ar: 'معاملات بانتظار المراجعة', de: 'Transaktionen ausstehend zur Prüfung', fr: 'Transactions en attente d\'examen', tr: 'İnceleme bekleyen işlemler' },
        'admin_pending_verify': { ar: 'بانتظار التحقق', de: 'Ausstehende Verifizierung', fr: 'Vérification en attente', tr: 'Doğrulama Bekliyor' },
        'admin_kyc_verify': { ar: 'التحقق من الهوية', de: 'Identitätsverifizierung', fr: 'Vérification d\'identité', tr: 'Kimlik Doğrulaması' },
        'admin_pricing_oracle': { ar: 'مؤشر الأسعار', de: 'Preisorakel', fr: 'Oracle des prix', tr: 'Fiyat Endeksi' },
        'admin_pricing_desc': { ar: 'مراقبة أسعار مواد البناء', de: 'Baumaterialpreise überwachen', fr: 'Surveiller les prix des matériaux', tr: 'Yapı malzemesi fiyatlarını izle' },
        'admin_pricing_oracle_epa': { ar: 'مؤشر EPA للأسعار', de: 'EPA-Preisindex', fr: 'Indice des prix EPA', tr: 'EPA Fiyat Endeksi' },
        'admin_settings': { ar: 'الإعدادات', de: 'Einstellungen', fr: 'Paramètres', tr: 'Ayarlar' },
        'admin_institutional': { ar: 'الوصول المؤسسي', de: 'Institutioneller Zugang', fr: 'Accès institutionnel', tr: 'Kurumsal Erişim' },
        'admin_ocds_compliant': { ar: 'متوافق مع OCDS', de: 'OCDS-konform', fr: 'Conforme OCDS', tr: 'OCDS Uyumlu' },
        'admin_ocds_desc': { ar: 'معيار البيانات المفتوحة للتعاقد', de: 'Offener Vergabedatenstandard', fr: 'Standard de données ouvertes de la commande publique', tr: 'Açık İhale Veri Standardı' },
        'expected_response': { ar: 'وقت الاستجابة المتوقع', de: 'Erwartete Antwortzeit', fr: 'Temps de réponse prévu', tr: 'Beklenen yanıt süresi' },
        'export_report': { ar: 'تصدير التقرير', de: 'Bericht exportieren', fr: 'Exporter le rapport', tr: 'Raporu Dışa Aktar' },
        'institutional_access': { ar: 'الوصول المؤسسي', de: 'Institutioneller Zugang', fr: 'Accès institutionnel', tr: 'Kurumsal Erişim' },
        'automated_audit_log': { ar: 'سجل التدقيق التلقائي', de: 'Automatisches Prüfprotokoll', fr: 'Journal d\'audit automatique', tr: 'Otomatik Denetim Günlüğü' },
        'financial_audit_docs': { ar: 'وثائق التدقيق المالي', de: 'Finanzprüfungsdokumente', fr: 'Documents d\'audit financier', tr: 'Finansal Denetim Belgeleri' },

        // ═══ MATERIAL NAMES & STATIC DATA ═══
        'reinforcement_steel': { ar: 'حديد التسليح', de: 'Bewehrungsstahl', fr: 'Acier d\'armature', tr: 'İnşaat Demiri' },
        'opc_cement_grade_43': { ar: 'أسمنت OPC درجة ٤٣', de: 'OPC-Zement Klasse 43', fr: 'Ciment OPC grade 43', tr: 'OPC Çimento Sınıf 43' },
        'tmt_steel_bars_12mm': { ar: 'قضبان فولاذ TMT ١٢مم', de: 'TMT-Stahlstäbe 12mm', fr: 'Barres d\'acier TMT 12mm', tr: 'TMT Çelik Çubuk 12mm' },
        'flush_wood_door_32': { ar: 'باب خشب مسطح ٣٢', de: 'Bündige Holztür 32', fr: 'Porte bois affleurante 32', tr: 'Kaplamalı Ahşap Kapı 32' },
        'harbor_view': { ar: 'منظر الميناء', de: 'Hafenblick', fr: 'Vue du port', tr: 'Liman Manzarası' },
        'harbor_view_reconstruction': { ar: 'إعادة إعمار منظر الميناء', de: 'Wiederaufbau Hafenblick', fr: 'Reconstruction Vue du port', tr: 'Liman Manzarası Yeniden İnşa' },

        // ═══ STATIC DATA / UNIT PRICES / REFERENCE CODES ═══
        'unit_10_00_bag': { ar: '١٠٫٠٠ / كيس', de: '10,00 / Sack', fr: '10,00 / sac', tr: '10,00 / torba' },
        'unit_35_00_panel': { ar: '٣٥٫٠٠ / لوح', de: '35,00 / Paneel', fr: '35,00 / panneau', tr: '35,00 / panel' },
        'unit_4_50_meter': { ar: '٤٫٥٠ / متر', de: '4,50 / Meter', fr: '4,50 / mètre', tr: '4,50 / metre' },
        'unit_6_00_meter': { ar: '٦٫٠٠ / متر', de: '6,00 / Meter', fr: '6,00 / mètre', tr: '6,00 / metre' },
        'cost_850_00': { ar: '٨٥٠٫٠٠ $', de: '850,00 $', fr: '850,00 $', tr: '850,00 $' },
        'nmr_hvr_001': { ar: 'NMR-HVR-001', de: 'NMR-HVR-001', fr: 'NMR-HVR-001', tr: 'NMR-HVR-001' },
        'po_nmr_po_20260001_al_shams_materials': { ar: 'أمر شراء NMR-PO-20260001 — مواد الشمس', de: 'PO NMR-PO-20260001 — Al Shams Materials', fr: 'PO NMR-PO-20260001 — Matériaux Al Shams', tr: 'PO NMR-PO-20260001 — Al Shams Malzemeleri' },
        '50_bags_opc_cement': { ar: '٥٠ كيس أسمنت OPC', de: '50 Sack OPC-Zement', fr: '50 sacs de ciment OPC', tr: '50 torba OPC çimento' },
        '50_bags_of_cement': { ar: '٥٠ كيس أسمنت', de: '50 Sack Zement', fr: '50 sacs de ciment', tr: '50 torba çimento' },
        '20m_copper_wiring': { ar: '٢٠م أسلاك نحاسية', de: '20m Kupferverdrahtung', fr: '20m câblage cuivre', tr: '20m bakır kablo' },
        '30m_pvc_plumbing_pipes': { ar: '٣٠م أنابيب PVC', de: '30m PVC-Rohre', fr: '30m tuyaux PVC', tr: '30m PVC tesisat borusu' },
        '12_glass_window_panels': { ar: '١٢ لوح زجاج نوافذ', de: '12 Glasfensterpaneele', fr: '12 panneaux de vitrage', tr: '12 cam pencere paneli' },
        'funds_held_in_escrow_released_only_upo': { ar: 'الأموال محتجزة في الضمان — تُحرَّر فقط بعد التحقق', de: 'Gelder treuhänderisch verwahrt — Freigabe nur nach Verifizierung', fr: 'Fonds sous séquestre — libérés uniquement après vérification', tr: 'Fonlar emanette — yalnızca doğrulama sonrası serbest bırakılır' },
        '15_funded': { ar: 'مموّل ١٥٪', de: '15 % finanziert', fr: '15 % financé', tr: '%15 finanse' },
        '35_funded': { ar: 'مموّل ٣٥٪', de: '35 % finanziert', fr: '35 % financé', tr: '%35 finanse' },
        '50_funded': { ar: 'مموّل ٥٠٪', de: '50 % finanziert', fr: '50 % financé', tr: '%50 finanse' },
        '64_raised': { ar: 'تم جمع ٦٤٪', de: '64 % gesammelt', fr: '64 % collecté', tr: '%64 toplandı' },
        '80_funded': { ar: 'مموّل ٨٠٪', de: '80 % finanziert', fr: '80 % financé', tr: '%80 finanse' },
        '360_captured': { ar: 'تم التصوير ٣٦٠°', de: '360° aufgenommen', fr: '360° capturé', tr: '360° çekildi' },
        '3_items': { ar: '٣ بنود', de: '3 Artikel', fr: '3 articles', tr: '3 kalem' },
        '1_440_00': { ar: '١٬٤٤٠٫٠٠', de: '1.440,00', fr: '1 440,00', tr: '1.440,00' },
        '2_810_00': { ar: '٢٬٨١٠٫٠٠', de: '2.810,00', fr: '2 810,00', tr: '2.810,00' },
        '450_00': { ar: '٤٥٠٫٠٠', de: '450,00', fr: '450,00', tr: '450,00' },
        '920_00': { ar: '٩٢٠٫٠٠', de: '920,00', fr: '920,00', tr: '920,00' },

        // ═══ ABOUT: TRUST & COMPLIANCE ═══
        'about_trust_title': { ar: 'الثقة والامتثال', de: 'Vertrauen & Compliance', fr: 'Confiance & Conformité', tr: 'Güven & Uyumluluk' },
        'about_stat_transparency': { ar: 'شفافية مالية', de: 'Finanzielle Transparenz', fr: 'Transparence financière', tr: 'Finansal Şeffaflık' },
        'about_stat_gps': { ar: 'تسليمات موثقة', de: 'Verifizierte Lieferungen', fr: 'Livraisons vérifiées', tr: 'Doğrulanmış Teslimatlar' },
        'about_stat_ocds': { ar: 'معيار البيانات', de: 'Datenstandard', fr: 'Standard de données', tr: 'Veri Standardı' },
        'about_stat_fees': { ar: 'رسوم تبرع', de: 'Spendengebühren', fr: 'Frais de don', tr: 'Bağış Ücreti' },
        'about_trust_body': { ar: 'مسارنا التشغيلي مصمم تقنياً وتشريعياً للامتثال التام مع متطلبات الامتثال لما بعد العقوبات الديناميكية والقوانين الدولية المنظمة للعمليات المالية — لضمان استمرارية الأعمال وحماية الشركاء والمانحين من أي مخاطر قانونية أو سمعية.', de: 'Unser operativer Weg ist technisch und rechtlich für die volle Einhaltung der dynamischen Post-Sanktions-Compliance und internationaler Finanzvorschriften konzipiert — zum Schutz aller Beteiligten.', fr: 'Notre parcours opérationnel est conçu techniquement et juridiquement pour une conformité totale avec les exigences post-sanctions dynamiques et les réglementations financières internationales.', tr: 'Operasyonel yolumuz, dinamik yaptırım sonrası uyumluluk ve uluslararası mali düzenlemelere tam uyum için teknik ve yasal olarak tasarlanmıştır.' },

        'about_cta_title': { ar: 'رؤيتك في بناء عالم أكثر أماناً تبدأ من هنا', de: 'Ihre Vision einer sichereren Welt beginnt hier', fr: 'Votre vision d\'un monde plus sûr commence ici', tr: 'Daha güvenli bir dünya vizyonunuz burada başlıyor' },
        'about_cta_body': { ar: 'لأن مجتمعات تحمّلت الدمار بأكمله تستحق أكثر من التعاطف — تستحق شريكاً يحوّل سخاءك إلى تغيير دائم وقابل للقياس. نحن نوفر الأدوات. أنت تصنع الأثر.', de: 'Weil Gemeinschaften, die Zerstörung ertragen haben, mehr als Mitgefühl verdienen — sie verdienen jemanden, der Ihre Großzügigkeit in messbaren, dauerhaften Wandel verwandelt.', fr: 'Parce que les communautés qui ont enduré la destruction méritent plus que de la sympathie — elles méritent un partenaire qui transforme votre générosité en changement mesurable et permanent.', tr: 'Çünkü yıkıma katlanan topluluklar sempetiden fazlasını hak ediyor — cömertliğinizi ölçülebilir, kalıcı değişime dönüştüren bir ortağı hak ediyor.' },
        'about_cta_btn': { ar: 'موّل مشروعاً الآن', de: 'Jetzt ein Projekt finanzieren', fr: 'Financer un projet maintenant', tr: 'Şimdi bir proje finanse edin' },
        'about_cta_contact': { ar: 'تواصل معنا', de: 'Kontakt', fr: 'Contactez-nous', tr: 'Bize Ulaşın' },
        'about_cta_pricing': { ar: 'خطط الشراكة', de: 'Partnerschaftspläne', fr: 'Plans de partenariat', tr: 'Ortaklık Planları' },
        'about_footer_copy': { ar: '© ٢٠٢٥ نعمِّرها. منصة إعادة إعمار متوافقة مع OCDS.', de: '© 2025 Nammerha. OCDS-konforme Wiederaufbauplattform.', fr: '© 2025 Nammerha. Plateforme de reconstruction conforme OCDS.', tr: '© 2025 Nammerha. OCDS uyumlu yeniden yapım platformu.' },

        'cat_cement': { ar: 'أسمنت', de: 'Zement', fr: 'Ciment', tr: 'Çimento' },
        'cat_steel_rebar': { ar: 'حديد تسليح', de: 'Bewehrungsstahl', fr: 'Acier d\'armature', tr: 'İnşaat Demiri' },
        'cat_blocks_bricks': { ar: 'بلوك وطوب', de: 'Blöcke & Ziegel', fr: 'Blocs & Briques', tr: 'Blok & Tuğla' },
        'cat_sand_aggregate': { ar: 'رمل وحصى', de: 'Sand & Zuschlag', fr: 'Sable & Granulats', tr: 'Kum & Agrega' },
        'cat_wood_timber': { ar: 'خشب وأخشاب', de: 'Holz & Bauholz', fr: 'Bois & Bois de construction', tr: 'Ahşap & Kereste' },
        'cat_electrical': { ar: 'مواد كهربائية', de: 'Elektromaterial', fr: 'Matériel électrique', tr: 'Elektrik Malzemeleri' },
        'cat_pipes_plumbing': { ar: 'أنابيب وسباكة', de: 'Rohre & Sanitär', fr: 'Tuyaux & Plomberie', tr: 'Boru & Tesisat' },
        'cat_paint_finishing': { ar: 'دهان وتشطيب', de: 'Farbe & Ausbau', fr: 'Peinture & Finition', tr: 'Boya & Son Kat' },
        'cat_roofing': { ar: 'مواد سقف', de: 'Dachmaterial', fr: 'Matériaux de toiture', tr: 'Çatı Malzemeleri' },
        'cat_insulation': { ar: 'عزل', de: 'Isolierung', fr: 'Isolation', tr: 'Yalıtım' },
        'cat_glass_windows': { ar: 'زجاج ونوافذ', de: 'Glas & Fenster', fr: 'Verre & Fenêtres', tr: 'Cam & Pencere' },
        'cat_concrete': { ar: 'خرسانة', de: 'Beton', fr: 'Béton', tr: 'Beton' },
        'cat_other': { ar: 'أخرى', de: 'Sonstiges', fr: 'Autre', tr: 'Diğer' },

        'unit_ton': { ar: 'طن', de: 'Tonne', fr: 'Tonne', tr: 'Ton' },
        'unit_piece': { ar: 'قطعة', de: 'Stück', fr: 'Pièce', tr: 'Adet' },
        'unit_box': { ar: 'صندوق', de: 'Karton', fr: 'Boîte', tr: 'Kutu' },
        'unit_roll': { ar: 'لفة', de: 'Rolle', fr: 'Rouleau', tr: 'Rulo' },
        'unit_liter': { ar: 'لتر', de: 'Liter', fr: 'Litre', tr: 'Litre' },

        'contractor_th_proposed_cost': { ar: 'التكلفة المقترحة', de: 'Vorgeschlagene Kosten', fr: 'Coût proposé', tr: 'Teklif Edilen Maliyet' },
        'contractor_th_status': { ar: 'الحالة', de: 'Status', fr: 'Statut', tr: 'Durum' },
        'contractor_th_submitted': { ar: 'تاريخ التقديم', de: 'Eingereicht am', fr: 'Soumis le', tr: 'Gönderim Tarihi' },
        'contractor_th_timeline': { ar: 'الجدول الزمني', de: 'Zeitplan', fr: 'Calendrier', tr: 'Zaman Çizelgesi' },

        'th_project': { ar: 'المشروع', de: 'Projekt', fr: 'Projet', tr: 'Proje' },
        'th_type': { ar: 'النوع', de: 'Typ', fr: 'Type', tr: 'Tür' },
        'th_status': { ar: 'الحالة', de: 'Status', fr: 'Statut', tr: 'Durum' },
        'th_action': { ar: 'الإجراء', de: 'Aktion', fr: 'Action', tr: 'İşlem' },
        'th_amount': { ar: 'المبلغ', de: 'Betrag', fr: 'Montant', tr: 'Tutar' },
        'th_date': { ar: 'التاريخ', de: 'Datum', fr: 'Date', tr: 'Tarih' },
        'th_engineer': { ar: 'المهندس', de: 'Ingenieur', fr: 'Ingénieur', tr: 'Mühendis' },
        'th_contractor': { ar: 'المقاول', de: 'Auftragnehmer', fr: 'Entrepreneur', tr: 'Yüklenici' },
        'th_bids': { ar: 'العروض', de: 'Angebote', fr: 'Offres', tr: 'Teklifler' },
        'th_region': { ar: 'المنطقة', de: 'Region', fr: 'Région', tr: 'Bölge' },
        'th_phase': { ar: 'المرحلة', de: 'Phase', fr: 'Phase', tr: 'Aşama' },
        'th_progress': { ar: 'التقدم', de: 'Fortschritt', fr: 'Progression', tr: 'İlerleme' },
        'th_est_cost': { ar: 'التكلفة التقديرية', de: 'Geschätzte Kosten', fr: 'Coût estimé', tr: 'Tahmini Maliyet' },
        'th_boq_items': { ar: 'بنود الكميات', de: 'LV-Posten', fr: 'Articles DQE', tr: 'BOQ Kalemleri' },
        'th_material': { ar: 'المادة', de: 'Material', fr: 'Matériau', tr: 'Malzeme' },
        'th_title': { ar: 'العنوان', de: 'Titel', fr: 'Titre', tr: 'Başlık' },
        'th_trade': { ar: 'المهنة', de: 'Gewerk', fr: 'Métier', tr: 'Meslek' },
        'th_urgency': { ar: 'الأولوية', de: 'Dringlichkeit', fr: 'Urgence', tr: 'Aciliyet' },
        'th_matched_to': { ar: 'مطابق مع', de: 'Zugeordnet an', fr: 'Associé à', tr: 'Eşleşen' },
        'th_job': { ar: 'العمل', de: 'Auftrag', fr: 'Travail', tr: 'İş' },
        'th_source': { ar: 'المصدر', de: 'Quelle', fr: 'Source', tr: 'Kaynak' },
        'th_scope': { ar: 'النطاق', de: 'Umfang', fr: 'Portée', tr: 'Kapsam' },
        'th_rate': { ar: 'السعر', de: 'Satz', fr: 'Tarif', tr: 'Ücret' },
        'th_completed': { ar: 'مكتمل', de: 'Abgeschlossen', fr: 'Terminé', tr: 'Tamamlandı' },

        'ho_lbl_trade': { ar: 'المهنة المطلوبة', de: 'Benötigtes Gewerk', fr: 'Métier nécessaire', tr: 'Gereken Meslek' },
        'ho_lbl_urgency': { ar: 'الأولوية', de: 'Dringlichkeit', fr: 'Urgence', tr: 'Aciliyet' },
        'ho_lbl_title': { ar: 'العنوان', de: 'Titel', fr: 'Titre', tr: 'Başlık' },
        'ho_lbl_description': { ar: 'الوصف (اختياري)', de: 'Beschreibung (optional)', fr: 'Description (optionnel)', tr: 'Açıklama (isteğe bağlı)' },
        'ho_lbl_location': { ar: 'الموقع', de: 'Standort', fr: 'Emplacement', tr: 'Konum' },
        'ho_lbl_max_budget': { ar: 'الميزانية القصوى ($)', de: 'Max. Budget ($)', fr: 'Budget max. ($)', tr: 'Maks. Bütçe ($)' },

        'trade_tiling': { ar: 'بلاط', de: 'Fliesen', fr: 'Carrelage', tr: 'Fayans' },
        'trade_painting': { ar: 'دهان', de: 'Malerei', fr: 'Peinture', tr: 'Boyama' },
        'trade_plumbing': { ar: 'سباكة', de: 'Sanitär', fr: 'Plomberie', tr: 'Tesisat' },
        'trade_electrical': { ar: 'كهرباء', de: 'Elektrik', fr: 'Électricité', tr: 'Elektrik' },
        'trade_carpentry': { ar: 'نجارة', de: 'Schreinerei', fr: 'Menuiserie', tr: 'Marangozluk' },
        'trade_welding': { ar: 'لحام', de: 'Schweißen', fr: 'Soudure', tr: 'Kaynak' },
        'trade_masonry': { ar: 'بناء حجر', de: 'Mauerwerk', fr: 'Maçonnerie', tr: 'Taş işçiliği' },
        'trade_plastering': { ar: 'قصارة', de: 'Verputzen', fr: 'Plâtrage', tr: 'Sıvacılık' },
        'trade_hvac': { ar: 'تكييف', de: 'Klimatechnik', fr: 'CVC', tr: 'İklimlendirme' },
        'trade_general': { ar: 'أعمال عامة', de: 'Allgemein', fr: 'Général', tr: 'Genel' },

        'urgency_routine': { ar: 'عادي', de: 'Routine', fr: 'Routine', tr: 'Rutin' },
        'urgency_urgent': { ar: 'مستعجل', de: 'Dringend', fr: 'Urgent', tr: 'Acil' },
        'urgency_emergency': { ar: 'طارئ', de: 'Notfall', fr: 'Urgence', tr: 'Acil Durum' },

    };


    // ═══════════════════════════════════════════════════════════════════════
    // P3-NEW-002 FIX: Key Aliases — Canonical Deduplication
    // ═══════════════════════════════════════════════════════════════════════
    // During the migration from English-text keys to snake_case keys,
    // ~12 entries existed in both formats with identical translations.
    // This alias map redirects legacy English-text keys to the canonical
    // snake_case entry, eliminating dictionary duplication.
    //
    // Usage: translatePage() and translateTextNodes() resolve through this
    // map before DICT lookup. HTML pages using either format work correctly.
    // ═══════════════════════════════════════════════════════════════════════
    var KEY_ALIASES = {
        // INC-02: Auto-generated aliases for backward compatibility
        'Project Details': 'project_details',
        'Overall Funding': 'overall_funding',
        'Itemized Needs (BOQ)': 'itemized_needs_boq',
        'Verified List': 'verified_list',
        'Add to Cart': 'add_to_cart',
        'Funding Complete': 'funding_complete',
        'Secure Escrow': 'secure_escrow',
        'Harbor View Reconstruction': 'harbor_view_reconstruction',
        'Construction Basket': 'construction_basket',
        'Your Basket': 'your_basket',
        'Proceed to Payment': 'proceed_to_payment',
        'Checkout': 'checkout',
        'Your basket is empty': 'your_basket_is_empty',
        'Proof of Delivery': 'proof_of_delivery',
        'Blockchain Verified': 'blockchain_verified',
        'View Project Progress': 'view_project_progress',
        'Tax Deductible Receipt': 'tax_deductible_receipt',
        'GPS-stamped delivery verification': 'gps_stamped_delivery_verification',
        'Engineer BOQ Builder': 'engineer_boq_builder',
        'BOQ Builder': 'boq_builder',
        'Add Item': 'add_item',
        'Added Materials': 'added_materials',
        'Total Project Estimate': 'total_project_estimate',
        'Site Validation & Proof of Work': 'site_validation_proof_of_work',
        'Field Photo Proof': 'field_photo_proof',
        'Voice Snag': 'voice_snag',
        'Capture 360 & Sync': 'capture_360_sync',
        'Verified Field Engineer': 'verified_field_engineer',
        'Site Verification': 'site_verification',
        'GPS Coordinates': 'gps_coordinates',
        'Timestamp': 'timestamp',
        'Signature': 'signature',
        'Submit Repair Request': 'submit_repair_request',
        'Upload Photos': 'upload_photos',
        'Description': 'description',
        'Category': 'category',
        'Priority': 'priority',
        'Urgent': 'urgent',
        'Request Summary': 'request_summary',
        'Request Submitted!': 'request_submitted',
        'Admin Portal': 'admin_portal',
        'Command Center': 'command_center',
        'Dashboard': 'dashboard',
        'Active Projects': 'active_projects',
        'Total Users': 'total_users',
        'Donations': 'donations',
        'Registered Engineers': 'registered_engineers',
        'Recent Audit Trail': 'recent_audit_trail',
        'View Full Log': 'view_full_log',
        'Escrow': 'escrow',
        'Verification': 'verification',
        'Engineer': 'engineer',
        'Settings': 'settings',
        'Escrow Management': 'escrow_management',
        'Escrow Verification Queue': 'escrow_verification_queue',
        'Escrow Release Verification': 'escrow_release_verification',
        'Funds Locked in Escrow': 'funds_locked_in_escrow',
        'Action Required': 'action_required',
        'Identity Verification Queue': 'identity_verification_queue',
        'Applications Pending Review': 'applications_pending_review',
        'Select an Application': 'select_an_application',
        'Confidence Score': 'confidence_score',
        'Under Review': 'under_review',
        'Approved': 'approved',
        'Rejected': 'rejected',
        'Active': 'active',
        'Pricing Oracle': 'pricing_oracle',
        'Regional Supply Forecast': 'regional_supply_forecast',
        'Steel Index Volatility': 'steel_index_volatility',
        'Stable': 'stable',
        'Constraint Risk': 'constraint_risk',
        'Total Adjusted Cost': 'total_adjusted_cost',
        'Verified by Oracle': 'verified_by_oracle',
        'Market Data': 'market_data',
        'Save': 'save',
        'Submit': 'submit',
        'Cancel': 'cancel',
        'Next': 'next',
        'Back': 'back',
        'Remove': 'remove',
        'Total': 'total',
        'Verified': 'verified',
        'Funded': 'funded',
        'Raised': 'raised',
        'Verify': 'verify',
        'Cost:': 'cost',
        'Status': 'status',
        'Value': 'value',
        'Title': 'title',
        'Project ID': 'project_id',
        'BOQ': 'boq',
        'Funds held in escrow': 'funds_held_in_escrow',
        '50_bags_opc_cement': '50_bags_opc_cement',
        '50_bags_of_cement': '50_bags_of_cement',
        '20m_copper_wiring': '20m_copper_wiring',
        '30m_pvc_plumbing_pipes': '30m_pvc_plumbing_pipes',
        '12_glass_window_panels': '12_glass_window_panels',
        '15_funded': '15_funded',
        '35_funded': '35_funded',
        '50_funded': '50_funded',
        '64_raised': '64_raised',
        '80_funded': '80_funded',
        '360_captured': '360_captured',
        '3_items': '3_items',
        '1_440_00': '1_440_00',
        '2_810_00': '2_810_00',
        '450_00': '450_00',
        '920_00': '920_00',
        'In Progress': 'in_progress',
        'Fully Funded': 'fully_funded',
        'Structural Damage': 'structural_damage',
        'Electrical': 'electrical',
        'General Repair': 'general_repair',
        'Gallery': 'gallery',
        'Sync': 'sync',
        'Governorate': 'governorate',
        'Location': 'location',
        'Estimated': 'estimated',
        'Purchase Order': 'purchase_order',
        'Vendor ID': 'vendor_id',
    };

    /**
     * Resolve a key through KEY_ALIASES, returning the canonical key.
     * Falls through to the original key if no alias exists.
     */
    function resolveKey(key) {
        return KEY_ALIASES[key] || key;
    }

    // ─── PERF-01: Dictionary Merge API ─────────────────────────────────────
    // Page-scoped dictionary files call __nmDictMerge() to register their keys.
    // This merges page keys into DICT at runtime — only the keys each page needs.
    window.__nmDictMerge = function(pageDict) {
        for (var key in pageDict) {
            if (pageDict.hasOwnProperty(key)) {
                DICT[key] = pageDict[key];
            }
        }
        // Re-translate if engine is already initialized
        if (currentLang && currentLang !== 'en') {
            translatePage(currentLang);
        }
    };

        // ─── State ────────────────────────────────────────────────────────────
    var currentLang = getStored() || detectBrowserLang() || 'en';
    var dropdownOpen = false;

    function getStored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }
    function setStored(code) {
        try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* noop */ }
    }
    function getLang(code) {
        for (var i = 0; i < LANGS.length; i++) {
            if (LANGS[i].code === code) return LANGS[i];
        }
        return LANGS[1]; // English default
    }
    function detectBrowserLang() {
        var navLang = (navigator.language || '').split('-')[0];
        for (var i = 0; i < LANGS.length; i++) {
            if (LANGS[i].code === navLang) return navLang;
        }
        return null;
    }

    // ─── Phosphor Globe SVG ───────────────────────────────────────────────
    var GLOBE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="18" height="18" fill="currentColor" style="opacity:0.7"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-6.4,32.94l-44.7-27.49a15.92,15.92,0,0,0-6.24-2.23l-22.82-3.08a16.11,16.11,0,0,0-16,7.86h-8.72l-3.8-7.86a15.91,15.91,0,0,0-11-8.67l-8-1.73L96.14,104h16.71a16.06,16.06,0,0,0,7.73-2l12.25-6.76a16.62,16.62,0,0,0,3-2.14l26.91-24.34A15.93,15.93,0,0,0,168,57.48V49.23A88.12,88.12,0,0,1,216,128ZM40,128a87.53,87.53,0,0,1,8.54-37.8l11.34,30.27a16,16,0,0,0,11.62,10l21.43,4.61L96.74,143a16.09,16.09,0,0,0,14.4,9h1.48l-7.23,38.61A16.08,16.08,0,0,0,109,207.32l-1,1.74A88.17,88.17,0,0,1,40,128Z"/></svg>';
    var CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="14" height="14" fill="currentColor" style="opacity:0"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>';

    // ─── Core: Apply Language ─────────────────────────────────────────────
    function applyLanguage(langCode) {
        var cfg = getLang(langCode);
        var html = document.documentElement;

        html.setAttribute('lang', cfg.code);
        html.setAttribute('dir', cfg.dir);
        currentLang = cfg.code;
        setStored(cfg.code);

        // §6.2: Apply bilingual typography
        applyTypography(cfg.code);

        // Update selector label
        var lbl = document.getElementById('nm-lang-label');
        if (lbl) lbl.textContent = cfg.name;

        // Update active option
        var opts = document.querySelectorAll('.nm-lang-opt');
        for (var i = 0; i < opts.length; i++) {
            var isActive = opts[i].dataset.lang === cfg.code;
            opts[i].classList.toggle('active', isActive);
            var chk = opts[i].querySelector('svg:last-child');
            if (chk) chk.style.opacity = isActive ? '1' : '0';
        }

        closeDropdown();
        translatePage(cfg.code);
    }

    // ─── Translation Core ─────────────────────────────────────────────────
    function translatePage(langCode) {
        // 1. Translate data-i18n keyed elements
        var keyed = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < keyed.length; i++) {
            var el = keyed[i];
            var rawKey = el.getAttribute('data-i18n');
            // P3-NEW-002 FIX: Resolve through KEY_ALIASES for canonical lookup
            var key = resolveKey(rawKey);

            // Store original English text on first run
            if (!el.dataset.i18nOriginal) {
                el.dataset.i18nOriginal = el.textContent;
            }

            if (langCode === 'en') {
                el.textContent = el.dataset.i18nOriginal;
            } else if (DICT[key] && DICT[key][langCode]) {
                el.textContent = DICT[key][langCode];
            }
        }

        // 2. Translate data-i18n-placeholder elements (search inputs)
        var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
        for (var j = 0; j < placeholders.length; j++) {
            var inp = placeholders[j];
            var phKey = inp.getAttribute('data-i18n-placeholder');
            if (!inp.dataset.i18nPlaceholderOriginal) {
                inp.dataset.i18nPlaceholderOriginal = inp.placeholder;
            }
            if (langCode === 'en') {
                inp.placeholder = inp.dataset.i18nPlaceholderOriginal;
            } else if (DICT[phKey] && DICT[phKey][langCode]) {
                inp.placeholder = DICT[phKey][langCode];
            }
        }

        // 2.5 Translate data-i18n-aria elements (P1-I18N-002 FIX: WCAG accessible names)
        var ariaEls = document.querySelectorAll('[data-i18n-aria]');
        for (var a = 0; a < ariaEls.length; a++) {
            var ariaEl = ariaEls[a];
            var ariaKey = ariaEl.getAttribute('data-i18n-aria');
            if (!ariaEl.dataset.i18nAriaOriginal) {
                ariaEl.dataset.i18nAriaOriginal = ariaEl.getAttribute('aria-label') || '';
            }
            if (langCode === 'en') {
                ariaEl.setAttribute('aria-label', ariaEl.dataset.i18nAriaOriginal);
            } else if (DICT[ariaKey] && DICT[ariaKey][langCode]) {
                ariaEl.setAttribute('aria-label', DICT[ariaKey][langCode]);
            }
        }

        // 2.7 Translate data-i18n-html elements (P1-F3 FIX: full-sentence HTML translation)
        // For elements that contain inline HTML like links, where textContent would strip tags.
        var htmlEls = document.querySelectorAll('[data-i18n-html]');
        for (var h = 0; h < htmlEls.length; h++) {
            var htmlEl = htmlEls[h];
            var htmlKey = htmlEl.getAttribute('data-i18n-html');
            if (!htmlEl.dataset.i18nHtmlOriginal) {
                htmlEl.dataset.i18nHtmlOriginal = htmlEl.innerHTML;
            }
            if (langCode === 'en') {
                htmlEl.innerHTML = htmlEl.dataset.i18nHtmlOriginal;
            } else if (DICT[htmlKey] && DICT[htmlKey][langCode]) {
                htmlEl.innerHTML = DICT[htmlKey][langCode];
            }
        }

        // 3. Deep translate: walk all visible text nodes and check against dictionary
        translateTextNodes(document.body, langCode);
    }

    /**
     * Walk all text nodes in the DOM and translate matching strings.
     * Saves original text in a WeakMap for reverting to English.
     */
    var originals = new WeakMap();

    function translateTextNodes(root, langCode) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                var tag = parent.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip elements already handled by data-i18n
                if (parent.hasAttribute('data-i18n')) return NodeFilter.FILTER_REJECT;
                // Skip language selector widget
                if (parent.closest('#nm-lang-widget')) return NodeFilter.FILTER_REJECT;
                // Only non-empty text
                if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        var node;
        while ((node = walker.nextNode())) {
            var text = node.textContent.trim();
            if (!text) continue;

            // Save original
            if (!originals.has(node)) {
                originals.set(node, node.textContent);
            }

            if (langCode === 'en') {
                // Restore original
                node.textContent = originals.get(node);
                continue;
            }

            // Check dictionary for exact match
            // P3-NEW-002 FIX: Resolve through KEY_ALIASES for canonical lookup
            var resolvedText = resolveKey(text);
            if (DICT[resolvedText] && DICT[resolvedText][langCode]) {
                node.textContent = node.textContent.replace(text, DICT[resolvedText][langCode]);
            }
        }
    }

    // ─── Language Selector Widget ─────────────────────────────────────────
    // NOTE: Widget is injected INTO the navbar (not fixed-position overlay)
    // to prevent overlap with user avatar and cart icon.
    function createSelector() {
        var wrap = document.createElement('div');
        wrap.id = 'nm-lang-widget';
        wrap.style.cssText = 'position:relative;z-index:10;font-family:"Plus Jakarta Sans",sans-serif;flex-shrink:0;';

        var btn = document.createElement('button');
        btn.id = 'nm-lang-btn';
        btn.setAttribute('aria-label', 'Select language');
        btn.setAttribute('aria-expanded', 'false');
        btn.style.cssText =
            'display:flex;align-items:center;gap:6px;padding:6px 12px;' +
            'border-radius:999px;border:1px solid rgba(100,116,139,0.25);' +
            'background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);' +
            '-webkit-backdrop-filter:blur(12px);cursor:pointer;font-size:13px;' +
            'font-weight:500;color:#334155;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.08);';
        btn.innerHTML = GLOBE + '<span id="nm-lang-label">' + getLang(currentLang).name + '</span>' +
            '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="opacity:0.5"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleDropdown();
        });

        // Dropdown
        var dd = document.createElement('div');
        dd.id = 'nm-lang-dd';
        dd.style.cssText =
            'position:absolute;top:calc(100% + 6px);right:0;min-width:160px;padding:6px;' +
            'border-radius:12px;background:rgba(255,255,255,0.97);backdrop-filter:blur(16px);' +
            '-webkit-backdrop-filter:blur(16px);border:1px solid rgba(100,116,139,0.12);' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.12);opacity:0;transform:translateY(-4px) scale(0.97);' +
            'pointer-events:none;transition:all 0.2s cubic-bezier(0.22,1,0.36,1);';

        for (var i = 0; i < LANGS.length; i++) {
            (function (lang) {
                var opt = document.createElement('div');
                opt.className = 'nm-lang-opt' + (lang.code === currentLang ? ' active' : '');
                opt.dataset.lang = lang.code;
                opt.style.cssText =
                    'display:flex;align-items:center;justify-content:space-between;' +
                    'padding:8px 12px;border-radius:8px;font-size:14px;cursor:pointer;' +
                    'transition:background 0.15s;color:' + (lang.code === currentLang ? '#1A73E8' : '#334155') + ';' +
                    'font-weight:' + (lang.code === currentLang ? '600' : '400') + ';';
                var chkSvg = CHECK.replace('opacity:0', 'opacity:' + (lang.code === currentLang ? '1' : '0'));
                opt.innerHTML = '<span>' + lang.name + '</span>' + chkSvg;

                opt.addEventListener('mouseenter', function () {
                    opt.style.background = 'rgba(26,115,232,0.08)';
                });
                opt.addEventListener('mouseleave', function () {
                    opt.style.background = 'transparent';
                });
                opt.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var allOpts = dd.querySelectorAll('.nm-lang-opt');
                    for (var j = 0; j < allOpts.length; j++) {
                        allOpts[j].style.color = '#334155';
                        allOpts[j].style.fontWeight = '400';
                    }
                    opt.style.color = '#1A73E8';
                    opt.style.fontWeight = '600';
                    applyLanguage(lang.code);
                });
                dd.appendChild(opt);
            })(LANGS[i]);
        }

        wrap.appendChild(btn);
        wrap.appendChild(dd);

        // Dark mode adaptation
        if (isDark()) {
            btn.style.background = 'rgba(24,17,33,0.85)';
            btn.style.borderColor = 'rgba(255,255,255,0.15)';
            btn.style.color = '#e2e8f0';
            dd.style.background = 'rgba(24,17,33,0.97)';
            dd.style.borderColor = 'rgba(255,255,255,0.1)';
            dd.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
        }

        return wrap;
    }

    function isDark() {
        return document.documentElement.classList.contains('dark') ||
            document.body.classList.contains('dark');
    }

    function toggleDropdown() {
        dropdownOpen = !dropdownOpen;
        var dd = document.getElementById('nm-lang-dd');
        var btn = document.getElementById('nm-lang-btn');
        if (dd) {
            dd.style.opacity = dropdownOpen ? '1' : '0';
            dd.style.transform = dropdownOpen ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.97)';
            dd.style.pointerEvents = dropdownOpen ? 'auto' : 'none';
        }
        if (btn) btn.setAttribute('aria-expanded', String(dropdownOpen));
    }

    function closeDropdown() {
        dropdownOpen = false;
        var dd = document.getElementById('nm-lang-dd');
        var btn = document.getElementById('nm-lang-btn');
        if (dd) {
            dd.style.opacity = '0';
            dd.style.transform = 'translateY(-4px) scale(0.97)';
            dd.style.pointerEvents = 'none';
        }
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    // ─── RTL Direction Fix for Widget ─────────────────────────────────────
    // Since the widget is now inside the navbar (flex container), RTL
    // direction is handled automatically by the parent's flex direction.
    // We only need to flip the dropdown anchor side.
    function updateWidgetPosition() {
        var dd = document.getElementById('nm-lang-dd');
        if (!dd) return;
        var isRTL = document.documentElement.getAttribute('dir') === 'rtl';
        dd.style.right = isRTL ? 'auto' : '0';
        dd.style.left = isRTL ? '0' : 'auto';
    }

    // ─── Suggestion Banner (Doc §4.3) ──────────────────────────────────
    // "لافتة إشعار علوية ذكية" — NO forced redirects, suggestion only.
    // Zero backend dependency: uses navigator.language (Sustainable UX §6.5).
    function showSuggestionBanner() {
        // Don't show if user explicitly chose a language (has stored preference)
        var storedPref = getStored();
        if (storedPref) return;

        // Don't show if previously dismissed
        try {
            var dismissed = localStorage.getItem(BANNER_DISMISS_KEY);
            if (dismissed) return;
        } catch (e) { /* noop */ }

        // Detect browser language
        var browserLang = detectBrowserLang();
        if (!browserLang || browserLang === currentLang) return;

        var browserCfg = getLang(browserLang);
        var currentCfg = getLang(currentLang);

        // Get message in current page language
        var msgs = BANNER_MSGS[currentLang] || BANNER_MSGS.en;
        var message = msgs.suggest.replace('{lang}', browserCfg.name);

        // Build banner DOM
        var banner = document.createElement('div');
        banner.id = 'nm-suggestion-banner';
        banner.className = 'nm-suggestion-banner';
        banner.setAttribute('role', 'alert');
        banner.setAttribute('aria-live', 'polite');

        // Globe icon (Phosphor)
        var globeIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="16" height="16" fill="currentColor" style="flex-shrink:0;opacity:0.9"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-6.4,32.94l-44.7-27.49a15.92,15.92,0,0,0-6.24-2.23l-22.82-3.08a16.11,16.11,0,0,0-16,7.86h-8.72l-3.8-7.86a15.91,15.91,0,0,0-11-8.67l-8-1.73L96.14,104h16.71a16.06,16.06,0,0,0,7.73-2l12.25-6.76a16.62,16.62,0,0,0,3-2.14l26.91-24.34A15.93,15.93,0,0,0,168,57.48V49.23A88.12,88.12,0,0,1,216,128ZM40,128a87.53,87.53,0,0,1,8.54-37.8l11.34,30.27a16,16,0,0,0,11.62,10l21.43,4.61L96.74,143a16.09,16.09,0,0,0,14.4,9h1.48l-7.23,38.61A16.08,16.08,0,0,0,109,207.32l-1,1.74A88.17,88.17,0,0,1,40,128Z"/></svg>';

        // X dismiss icon (Phosphor)
        var xIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="14" height="14" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';

        banner.innerHTML =
            globeIcon +
            '<span class="nm-banner-text">' + message + '</span>' +
            '<button class="nm-banner-switch" aria-label="' + msgs.switch + '">' + msgs.switch + '</button>' +
            '<button class="nm-banner-dismiss" aria-label="' + msgs.dismiss + '">' + xIcon + '</button>';

        document.body.insertBefore(banner, document.body.firstChild);

        // Animate in after DOM insertion
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                banner.classList.add('visible');
            });
        });

        // Switch button → apply suggested language
        banner.querySelector('.nm-banner-switch').addEventListener('click', function (e) {
            e.stopPropagation();
            dismissBanner(banner);
            applyLanguage(browserLang);
        });

        // Dismiss button → hide banner, persist
        banner.querySelector('.nm-banner-dismiss').addEventListener('click', function (e) {
            e.stopPropagation();
            dismissBanner(banner);
            try { localStorage.setItem(BANNER_DISMISS_KEY, Date.now().toString()); } catch (err) { /* noop */ }
        });
    }

    function dismissBanner(banner) {
        banner.classList.remove('visible');
        setTimeout(function () { banner.remove(); }, 400);
    }

    // ─── Mount ────────────────────────────────────────────────────────────
    function mount() {
        // Remove any old i18n widget
        var old = document.getElementById('nm-lang-widget');
        if (old) old.remove();

        // Inject widget INTO the navbar (between cart and user avatar)
        // This prevents the fixed-position overlap issue.
        var widget = createSelector();
        var navbar = document.querySelector('nav.glass-nav');
        if (navbar) {
            // Find the user avatar (last child = avatar div with rounded-full)
            var userAvatar = navbar.querySelector('.rounded-full.border-2');
            if (userAvatar) {
                navbar.insertBefore(widget, userAvatar);
            } else {
                navbar.appendChild(widget);
            }
        } else {
            // Admin dashboard pages: inject into the header bar
            var dashHeader = document.querySelector('header .page-header-title');
            if (dashHeader) {
                var headerBar = dashHeader.closest('header');
                if (headerBar) {
                    // Insert into the right-side flex container of the header
                    var rightGroup = headerBar.querySelector('.flex.items-center.gap-4');
                    if (rightGroup) {
                        rightGroup.insertBefore(widget, rightGroup.firstChild);
                    } else {
                        headerBar.appendChild(widget);
                    }
                } else {
                    document.body.appendChild(widget);
                }
            } else {
                // C-AUD-006 FIX: Check for a dedicated mount point (e.g., auth.html).
                // This prevents collision with the fixed-position theme toggle.
                var langMount = document.getElementById('nm-lang-mount');
                if (langMount) {
                    langMount.appendChild(widget);
                } else {
                    // Final fallback: append to body with fixed positioning
                    widget.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10000;font-family:"Plus Jakarta Sans",sans-serif;';
                    document.body.appendChild(widget);
                }
            }
        }

        // Apply stored/detected language
        applyLanguage(currentLang);
        updateWidgetPosition();

        // §4.3: Show suggestion banner if browser language differs
        showSuggestionBanner();

        // Close dropdown on outside click
        document.addEventListener('click', function () {
            if (dropdownOpen) closeDropdown();
        });

        // ─── MutationObserver: auto-translate dynamically inserted elements ──
        var observer = new MutationObserver(function (mutations) {
            if (currentLang === 'en') return;
            var needsUpdate = false;
            for (var m = 0; m < mutations.length; m++) {
                var added = mutations[m].addedNodes;
                for (var n = 0; n < added.length; n++) {
                    var node = added[n];
                    if (node.nodeType !== 1) continue;
                    if (node.id === 'nm-lang-widget' || node.id === 'nm-suggestion-banner') continue;
                    if (node.hasAttribute && (node.hasAttribute('data-i18n') || node.querySelector && node.querySelector('[data-i18n]'))) {
                        needsUpdate = true;
                        break;
                    }
                }
                if (needsUpdate) break;
            }
            if (needsUpdate) {
                translatePage(currentLang);
                updateWidgetPosition();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ─── Init ─────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }

    // ─── Public API ───────────────────────────────────────────────────────
    window.NammerhaI18n = {
        switchLanguage: applyLanguage,
        getCurrentLang: function () { return currentLang; },
        getSupportedLangs: function () { return LANGS.slice(); },
        t: function (key, fallback) {
            if (currentLang === 'en') return fallback || key;
            var resolved = resolveKey(key);
            if (DICT[resolved] && DICT[resolved][currentLang]) {
                return DICT[resolved][currentLang];
            }
            return fallback || key;
        },
    };

})();
