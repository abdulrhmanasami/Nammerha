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
 *   - Translates data-i18n elements, data-i18n-placeholder, and text nodes
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
    var ARABIC_FONT_LOADED = false;
    function loadArabicFont() {
        if (ARABIC_FONT_LOADED) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap';
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

        // ═══ INDEX / DASHBOARD PAGE ═══
        'active_region': { ar: 'المنطقة النشطة', de: 'Aktive Region', fr: 'Région active', tr: 'Aktif Bölge' },
        'active_projects': { ar: '12 مشروع نشط', de: '12 aktive Projekte', fr: '12 projets actifs', tr: '12 Aktif Proje' },
        'featured_projects': { ar: 'مشاريع مميزة', de: 'Ausgewählte Projekte', fr: 'Projets en vedette', tr: 'Öne Çıkan Projeler' },
        'view_all': { ar: 'عرض الكل', de: 'Alle anzeigen', fr: 'Tout voir', tr: 'Tümünü Gör' },
        'invest_now': { ar: 'استثمر الآن', de: 'Jetzt investieren', fr: 'Investir maintenant', tr: 'Şimdi Yatır' },
        'total_impact': { ar: 'إجمالي التأثير المموّل', de: 'Gesamtfinanzierte Wirkung', fr: 'Impact total financé', tr: 'Toplam Finanse Edilen Etki' },
        'vs_quarter': { ar: 'مقارنة بالربع السابق', de: 'ggü. letztem Quartal', fr: 'vs trimestre précédent', tr: 'önceki çeyreğe göre' },
        'transparency': { ar: 'الشفافية المؤسسية', de: 'Institutionelle Transparenz', fr: 'Transparence institutionnelle', tr: 'Kurumsal Şeffaflık' },
        'interactive_map': { ar: 'خريطة إعادة الإعمار التفاعلية', de: 'Interaktive Wiederaufbaukarte', fr: 'Carte interactive de reconstruction', tr: 'İnteraktif Yeniden Yapım Haritası' },
        'fund_project': { ar: 'موّل هذا المشروع', de: 'Projekt finanzieren', fr: 'Financer ce projet', tr: 'Bu Projeyi Finanse Et' },
        'quick_actions': { ar: 'إجراءات سريعة', de: 'Schnellaktionen', fr: 'Actions rapides', tr: 'Hızlı İşlemler' },
        'report_damage': { ar: 'الإبلاغ عن أضرار', de: 'Schaden melden', fr: 'Signaler des dégâts', tr: 'Hasar Bildir' },
        'build_boq': { ar: 'إنشاء جدول كميات', de: 'LV erstellen', fr: 'Créer le DQE', tr: 'BOQ Oluştur' },
        'fund_materials': { ar: 'تمويل المواد', de: 'Materialien finanzieren', fr: 'Financer les matériaux', tr: 'Malzemeleri Finanse Et' },
        'price_oracle': { ar: 'مؤشر الأسعار', de: 'Preisorakel', fr: 'Oracle des prix', tr: 'Fiyat Kehaneti' },

        // ═══ PROJECT DETAILS PAGE ═══
        'Project Details': { ar: 'تفاصيل المشروع', de: 'Projektdetails', fr: 'Détails du projet', tr: 'Proje Detayları' },
        'Overall Funding': { ar: 'التمويل الإجمالي', de: 'Gesamtfinanzierung', fr: 'Financement global', tr: 'Genel Finansman' },
        'Itemized Needs (BOQ)': { ar: 'الاحتياجات المفصلة', de: 'Detaillierte Bedarfe (LV)', fr: 'Besoins détaillés (DQE)', tr: 'Detaylı İhtiyaçlar (BOQ)' },
        'Verified List': { ar: 'قائمة معتمدة', de: 'Verifizierte Liste', fr: 'Liste vérifiée', tr: 'Doğrulanmış Liste' },
        'Add to Cart': { ar: 'أضف إلى السلة', de: 'In den Warenkorb', fr: 'Ajouter au panier', tr: 'Sepete Ekle' },
        'Funding Complete': { ar: 'التمويل مكتمل', de: 'Finanzierung abgeschlossen', fr: 'Financement terminé', tr: 'Finansman Tamamlandı' },
        'Secure Escrow': { ar: 'ضمان آمن', de: 'Sicheres Treuhandkonto', fr: 'Séquestre sécurisé', tr: 'Güvenli Emanet' },
        'In Progress': { ar: 'قيد التنفيذ', de: 'In Bearbeitung', fr: 'En cours', tr: 'Devam Ediyor' },
        'Harbor View Reconstruction': { ar: 'إعادة إعمار المرفأ', de: 'Harbor View Wiederaufbau', fr: 'Reconstruction Harbor View', tr: 'Harbor View Yeniden Yapımı' },

        // ═══ DONOR BASKET PAGE ═══
        'Construction Basket': { ar: 'سلة البناء', de: 'Baukorb', fr: 'Panier de construction', tr: 'İnşaat Sepeti' },
        'Your Basket': { ar: 'سلتك', de: 'Ihr Warenkorb', fr: 'Votre panier', tr: 'Sepetiniz' },
        'Proceed to Payment': { ar: 'المتابعة للدفع', de: 'Zur Zahlung', fr: 'Procéder au paiement', tr: 'Ödemeye Geç' },
        'Checkout': { ar: 'الدفع', de: 'Bezahlen', fr: 'Payer', tr: 'Ödeme' },
        'Your basket is empty': { ar: 'سلتك فارغة', de: 'Ihr Warenkorb ist leer', fr: 'Votre panier est vide', tr: 'Sepetiniz boş' },

        // ═══ DONOR PROOF PAGE ═══
        'Proof of Delivery': { ar: 'إثبات التسليم', de: 'Liefernachweis', fr: 'Preuve de livraison', tr: 'Teslimat Kanıtı' },
        'Blockchain Verified': { ar: 'تم التحقق عبر البلوكتشين', de: 'Blockchain-verifiziert', fr: 'Vérifié par blockchain', tr: 'Blockchain Doğrulanmış' },
        'View Project Progress': { ar: 'عرض تقدم المشروع', de: 'Projektfortschritt anzeigen', fr: 'Voir la progression', tr: 'Proje İlerlemesini Gör' },
        'Tax Deductible Receipt': { ar: 'إيصال قابل للخصم الضريبي', de: 'Steuerlich absetzbare Quittung', fr: 'Reçu déductible d\'impôt', tr: 'Vergiden Düşülebilir Makbuz' },
        'GPS-stamped delivery verification': { ar: 'تحقق التسليم بطابع GPS', de: 'GPS-gestempelte Lieferverifizierung', fr: 'Vérification de livraison GPS', tr: 'GPS damgalı teslimat doğrulaması' },

        // ═══ ENGINEER BOQ PAGE ═══
        'Engineer BOQ Builder': { ar: 'منشئ جدول الكميات للمهندس', de: 'Ingenieur-LV-Editor', fr: 'Éditeur DQE pour ingénieur', tr: 'Mühendis BOQ Oluşturucu' },
        'BOQ Builder': { ar: 'منشئ جدول الكميات', de: 'LV-Editor', fr: 'Éditeur DQE', tr: 'BOQ Oluşturucu' },
        'Add Item': { ar: 'إضافة بند', de: 'Artikel hinzufügen', fr: 'Ajouter un article', tr: 'Kalem Ekle' },
        'Added Materials': { ar: 'المواد المضافة', de: 'Hinzugefügte Materialien', fr: 'Matériaux ajoutés', tr: 'Eklenen Malzemeler' },
        'Total Project Estimate': { ar: 'إجمالي تقدير المشروع', de: 'Gesamte Projektschätzung', fr: 'Estimation totale du projet', tr: 'Toplam Proje Tahmini' },
        'Site Validation & Proof of Work': { ar: 'التحقق الميداني وإثبات العمل', de: 'Standortvalidierung & Arbeitsnachweis', fr: 'Validation sur site & preuve de travail', tr: 'Saha Doğrulama & İş Kanıtı' },
        'Field Photo Proof': { ar: 'إثبات الصور الميدانية', de: 'Fotobeweis vor Ort', fr: 'Preuve photo de terrain', tr: 'Saha Fotoğraf Kanıtı' },
        'Voice Snag': { ar: 'ملاحظة صوتية', de: 'Sprachmangel', fr: 'Note vocale', tr: 'Sesli Not' },
        'Capture 360 & Sync': { ar: 'تصوير 360 ومزامنة', de: '360° aufnehmen & synchronisieren', fr: 'Capturer 360 & Synchroniser', tr: '360 Çek & Senkronize Et' },
        'Gallery': { ar: 'المعرض', de: 'Galerie', fr: 'Galerie', tr: 'Galeri' },
        'Verified Field Engineer': { ar: 'مهندس ميداني معتمد', de: 'Verifizierter Feldingenieur', fr: 'Ingénieur de terrain vérifié', tr: 'Doğrulanmış Saha Mühendisi' },

        // ═══ ENGINEER CAMERA PAGE ═══
        'Site Verification': { ar: 'التحقق الميداني', de: 'Standortverifizierung', fr: 'Vérification du site', tr: 'Saha Doğrulaması' },
        'GPS Coordinates': { ar: 'إحداثيات GPS', de: 'GPS-Koordinaten', fr: 'Coordonnées GPS', tr: 'GPS Koordinatları' },
        'Timestamp': { ar: 'الطابع الزمني', de: 'Zeitstempel', fr: 'Horodatage', tr: 'Zaman Damgası' },
        'Signature': { ar: 'التوقيع', de: 'Unterschrift', fr: 'Signature', tr: 'İmza' },
        'Sync': { ar: 'مزامنة', de: 'Synchronisieren', fr: 'Synchroniser', tr: 'Senkronize Et' },

        // ═══ HOMEOWNER REPORT PAGE ═══
        'Submit Repair Request': { ar: 'تقديم طلب إصلاح', de: 'Reparaturanfrage einreichen', fr: 'Soumettre une demande de réparation', tr: 'Onarım Talebi Gönder' },
        'Upload Photos': { ar: 'رفع الصور', de: 'Fotos hochladen', fr: 'Télécharger des photos', tr: 'Fotoğraf Yükle' },
        'Location': { ar: 'الموقع', de: 'Standort', fr: 'Emplacement', tr: 'Konum' },
        'Description': { ar: 'الوصف', de: 'Beschreibung', fr: 'Description', tr: 'Açıklama' },
        'Category': { ar: 'الفئة', de: 'Kategorie', fr: 'Catégorie', tr: 'Kategori' },
        'Priority': { ar: 'الأولوية', de: 'Priorität', fr: 'Priorité', tr: 'Öncelik' },
        'Governorate': { ar: 'المحافظة', de: 'Gouvernement', fr: 'Gouvernorat', tr: 'İl' },
        'Structural Damage': { ar: 'أضرار هيكلية', de: 'Strukturschäden', fr: 'Dommages structurels', tr: 'Yapısal Hasar' },
        'Electrical': { ar: 'كهربائي', de: 'Elektrisch', fr: 'Électrique', tr: 'Elektrik' },
        'General Repair': { ar: 'إصلاح عام', de: 'Allgemeine Reparatur', fr: 'Réparation générale', tr: 'Genel Onarım' },
        'Urgent': { ar: 'عاجل', de: 'Dringend', fr: 'Urgent', tr: 'Acil' },
        'Request Summary': { ar: 'ملخص الطلب', de: 'Anfragezusammenfassung', fr: 'Résumé de la demande', tr: 'Talep Özeti' },
        'Request Submitted!': { ar: 'تم تقديم الطلب!', de: 'Anfrage eingereicht!', fr: 'Demande soumise !', tr: 'Talep Gönderildi!' },

        // ═══ ADMIN DASHBOARD PAGE ═══
        'Admin Portal': { ar: 'بوابة الإدارة', de: 'Admin-Portal', fr: 'Portail d\'administration', tr: 'Yönetici Portalı' },
        'Command Center': { ar: 'مركز القيادة', de: 'Kommandozentrale', fr: 'Centre de commande', tr: 'Komuta Merkezi' },
        'Dashboard': { ar: 'لوحة المتابعة', de: 'Dashboard', fr: 'Tableau de bord', tr: 'Kontrol Paneli' },
        'Active Projects': { ar: 'المشاريع النشطة', de: 'Aktive Projekte', fr: 'Projets actifs', tr: 'Aktif Projeler' },
        'Total Users': { ar: 'إجمالي المستخدمين', de: 'Gesamtbenutzer', fr: 'Utilisateurs totaux', tr: 'Toplam Kullanıcılar' },
        'Donations': { ar: 'التبرعات', de: 'Spenden', fr: 'Dons', tr: 'Bağışlar' },
        'Registered Engineers': { ar: 'المهندسون المسجلون', de: 'Registrierte Ingenieure', fr: 'Ingénieurs inscrits', tr: 'Kayıtlı Mühendisler' },
        'Recent Audit Trail': { ar: 'آخر سجلات التدقيق', de: 'Letzter Prüfpfad', fr: 'Dernière piste d\'audit', tr: 'Son Denetim İzi' },
        'View Full Log': { ar: 'عرض السجل الكامل', de: 'Vollständiges Protokoll anzeigen', fr: 'Voir le journal complet', tr: 'Tam Günlüğü Gör' },
        'Escrow': { ar: 'الأمانات', de: 'Treuhand', fr: 'Entiercement', tr: 'Emanet' },
        'Verification': { ar: 'التحقق', de: 'Verifizierung', fr: 'Vérification', tr: 'Doğrulama' },
        'Engineer': { ar: 'مهندس', de: 'Ingenieur', fr: 'Ingénieur', tr: 'Mühendis' },
        'Settings': { ar: 'الإعدادات', de: 'Einstellungen', fr: 'Paramètres', tr: 'Ayarlar' },

        // ═══ ADMIN ESCROW PAGE ═══
        'Escrow Management': { ar: 'إدارة الأمانات', de: 'Treuhandverwaltung', fr: 'Gestion d\'entiercement', tr: 'Emanet Yönetimi' },
        'Escrow Verification Queue': { ar: 'قائمة التحقق من الأمانات', de: 'Treuhand-Verifizierungswarteschlange', fr: 'File de vérification d\'entiercement', tr: 'Emanet Doğrulama Kuyruğu' },
        'Escrow Release Verification': { ar: 'التحقق من تحرير الأمانة', de: 'Treuhand-Freigabeprüfung', fr: 'Vérification de libération d\'entiercement', tr: 'Emanet Serbest Bırakma Doğrulaması' },
        'Funds Locked in Escrow': { ar: 'أموال محجوزة في الأمانة', de: 'Gelder in Treuhand gesperrt', fr: 'Fonds bloqués en entiercement', tr: 'Emanette Kilitli Fonlar' },
        'Purchase Order': { ar: 'أمر الشراء', de: 'Bestellung', fr: 'Bon de commande', tr: 'Satın Alma Siparişi' },
        'Vendor ID': { ar: 'معرف المورد', de: 'Lieferanten-ID', fr: 'ID fournisseur', tr: 'Tedarikçi Kimliği' },
        'Action Required': { ar: 'إجراء مطلوب', de: 'Aktion erforderlich', fr: 'Action requise', tr: 'İşlem Gerekli' },

        // ═══ ADMIN KYC PAGE ═══
        'Identity Verification Queue': { ar: 'قائمة التحقق من الهوية', de: 'Identitätsverifizierungswarteschlange', fr: 'File de vérification d\'identité', tr: 'Kimlik Doğrulama Kuyruğu' },
        'Applications Pending Review': { ar: 'طلبات بانتظار المراجعة', de: 'Ausstehende Anträge', fr: 'Demandes en attente', tr: 'İnceleme Bekleyen Başvurular' },
        'Select an Application': { ar: 'اختر طلباً', de: 'Antrag auswählen', fr: 'Sélectionner une demande', tr: 'Bir Başvuru Seçin' },
        'Confidence Score': { ar: 'درجة الثقة', de: 'Vertrauensbewertung', fr: 'Score de confiance', tr: 'Güven Skoru' },
        'Under Review': { ar: 'قيد المراجعة', de: 'Wird überprüft', fr: 'En cours d\'examen', tr: 'İnceleniyor' },
        'Approved': { ar: 'مُعتمد', de: 'Genehmigt', fr: 'Approuvé', tr: 'Onaylandı' },
        'Rejected': { ar: 'مرفوض', de: 'Abgelehnt', fr: 'Rejeté', tr: 'Reddedildi' },
        'Active': { ar: 'نشط', de: 'Aktiv', fr: 'Actif', tr: 'Aktif' },
        'kyc_verification': { ar: 'التحقق من الهوية', de: 'KYC-Verifizierung', fr: 'Vérification KYC', tr: 'KYC Doğrulaması' },
        'kyc_institutional_access': { ar: 'وصول مؤسسي', de: 'Institutioneller Zugang', fr: 'Accès institutionnel', tr: 'Kurumsal Erişim' },
        'kyc_portal_title': { ar: 'بوابة التحقق من الهوية', de: 'KYC-Verifizierungsportal', fr: 'Portail de vérification KYC', tr: 'KYC Doğrulama Portalı' },
        'kyc_review_subtitle': { ar: 'مراجعة التراخيص المهنية وسجلات التجارة قبل منح حالة التوثيق.', de: 'Berufliche Lizenzen und Handelsregistereinträge prüfen, bevor der verifizierte Status gewährt wird.', fr: 'Examiner les licences professionnelles et les inscriptions commerciales avant d\'accorder le statut vérifié.', tr: 'Doğrulanmış statü vermeden önce mesleki lisansları ve ticaret tescillerini inceleyin.' },
        'kyc_filter': { ar: 'تصفية', de: 'Filtern', fr: 'Filtrer', tr: 'Filtrele' },
        'kyc_export': { ar: 'تصدير', de: 'Exportieren', fr: 'Exporter', tr: 'Dışa Aktar' },
        'kyc_pending_review': { ar: 'بانتظار المراجعة', de: 'Überprüfung ausstehend', fr: 'En attente de révision', tr: 'İnceleme Bekliyor' },
        'kyc_verified_mtd': { ar: 'تم التحقق (الشهر الحالي)', de: 'Verifiziert (MTD)', fr: 'Vérifiés (mois en cours)', tr: 'Doğrulanmış (ATB)' },
        'kyc_status_pending': { ar: 'معلّق', de: 'Ausstehend', fr: 'En attente', tr: 'Beklemede' },
        'kyc_docs_count_1': { ar: 'مستند واحد', de: '1 Dokument', fr: '1 document', tr: '1 belge' },
        'kyc_docs_count_2': { ar: 'مستندان', de: '2 Dokumente', fr: '2 documents', tr: '2 belge' },
        'kyc_docs_count_3': { ar: '3 مستندات', de: '3 Dokumente', fr: '3 documents', tr: '3 belge' },
        'kyc_click_to_review': { ar: 'انقر على صف للمراجعة', de: 'Klicken Sie auf eine Zeile', fr: 'Cliquez sur une ligne', tr: 'İncelemek için bir satıra tıklayın' },
        'kyc_select_applicant': { ar: 'اختر متقدماً من قائمة الانتظار', de: 'Wählen Sie einen Antragsteller aus der Warteschlange', fr: 'Sélectionnez un candidat dans la file d\'attente', tr: 'Kuyruktan bir başvuru sahibi seçin' },
        'kyc_docs_appear_here': { ar: 'ستظهر المستندات هنا للمراجعة', de: 'Dokumente erscheinen hier zur Überprüfung', fr: 'Les documents apparaîtront ici pour examen', tr: 'Belgeler burada incelenmek üzere görünecek' },
        'kyc_drag_drop': { ar: 'اسحب وأفلت المستندات هنا', de: 'Dokumente hierher ziehen', fr: 'Glisser-déposer les documents ici', tr: 'Belgeleri buraya sürükleyip bırakın' },
        'kyc_click_browse': { ar: 'أو انقر لتصفح الملفات', de: 'oder klicken Sie zum Durchsuchen', fr: 'ou cliquez pour parcourir', tr: 'veya dosyalara göz atmak için tıklayın' },
        'kyc_grant_verified': { ar: 'منح شارة التوثيق', de: 'Verifizierungsabzeichen erteilen', fr: 'Accorder le badge vérifié', tr: 'Doğrulanmış Rozet Ver' },
        'kyc_reject_resubmit': { ar: 'رفض وطلب إعادة التقديم', de: 'Ablehnen & Neueinreichung anfordern', fr: 'Rejeter & demander une nouvelle soumission', tr: 'Reddet & Yeniden Gönderim Talep Et' },

        // ═══ ADMIN ORACLE PAGE ═══
        'Pricing Oracle': { ar: 'مؤشر الأسعار', de: 'Preisorakel', fr: 'Oracle des prix', tr: 'Fiyat Kehaneti' },
        'Regional Supply Forecast': { ar: 'توقعات العرض الإقليمي', de: 'Regionale Angebotsprognose', fr: 'Prévision d\'approvisionnement régional', tr: 'Bölgesel Tedarik Tahmini' },
        'Steel Index Volatility': { ar: 'تقلب مؤشر الحديد', de: 'Stahlindexvolatilität', fr: 'Volatilité de l\'indice acier', tr: 'Çelik Endeksi Volatilitesi' },
        'Stable': { ar: 'مستقر', de: 'Stabil', fr: 'Stable', tr: 'Stabil' },
        'Constraint Risk': { ar: 'مخاطر القيود', de: 'Einschränkungsrisiko', fr: 'Risque de contrainte', tr: 'Kısıtlama Riski' },
        'Estimated': { ar: 'مُقدّر', de: 'Geschätzt', fr: 'Estimé', tr: 'Tahmini' },
        'Total Adjusted Cost': { ar: 'التكلفة المعدّلة الإجمالية', de: 'Gesamte bereinigte Kosten', fr: 'Coût total ajusté', tr: 'Toplam Düzeltilmiş Maliyet' },
        'Verified by Oracle': { ar: 'معتمد من المؤشر', de: 'Vom Orakel verifiziert', fr: 'Vérifié par l\'oracle', tr: 'Oracle Tarafından Doğrulandı' },
        'Market Data': { ar: 'بيانات السوق', de: 'Marktdaten', fr: 'Données du marché', tr: 'Piyasa Verileri' },

        // ═══ COMMON UI ELEMENTS ═══
        'Save': { ar: 'حفظ', de: 'Speichern', fr: 'Enregistrer', tr: 'Kaydet' },
        'Submit': { ar: 'إرسال', de: 'Einreichen', fr: 'Soumettre', tr: 'Gönder' },
        'Cancel': { ar: 'إلغاء', de: 'Abbrechen', fr: 'Annuler', tr: 'İptal' },
        'Next': { ar: 'التالي', de: 'Weiter', fr: 'Suivant', tr: 'İleri' },
        'Back': { ar: 'رجوع', de: 'Zurück', fr: 'Retour', tr: 'Geri' },
        'Remove': { ar: 'إزالة', de: 'Entfernen', fr: 'Supprimer', tr: 'Kaldır' },
        'Total': { ar: 'المجموع', de: 'Gesamt', fr: 'Total', tr: 'Toplam' },
        'Verified': { ar: 'معتمد', de: 'Verifiziert', fr: 'Vérifié', tr: 'Doğrulandı' },
        'Funded': { ar: 'ممول', de: 'Finanziert', fr: 'Financé', tr: 'Finanse Edildi' },
        'Fully Funded': { ar: 'مموّل بالكامل', de: 'Voll finanziert', fr: 'Entièrement financé', tr: 'Tamamen Finanse' },
        'Raised': { ar: 'تم جمع', de: 'Gesammelt', fr: 'Collecté', tr: 'Toplanan' },
        'Verify': { ar: 'تحقق', de: 'Verifizieren', fr: 'Vérifier', tr: 'Doğrula' },
        'Cost:': { ar: 'التكلفة:', de: 'Kosten:', fr: 'Coût :', tr: 'Maliyet:' },
        'Status': { ar: 'الحالة', de: 'Status', fr: 'Statut', tr: 'Durum' },
        'Value': { ar: 'القيمة', de: 'Wert', fr: 'Valeur', tr: 'Değer' },
        'Title': { ar: 'العنوان', de: 'Titel', fr: 'Titre', tr: 'Başlık' },
        'Project ID': { ar: 'معرف المشروع', de: 'Projekt-ID', fr: 'ID du projet', tr: 'Proje Kimliği' },
        'BOQ': { ar: 'جدول الكميات', de: 'Leistungsverzeichnis', fr: 'Devis quantitatif', tr: 'Metraj' },

        // ═══ SEARCH ═══
        'Search reconstruction projects...': {
            ar: 'ابحث عن مشاريع إعادة الإعمار...',
            de: 'Wiederaufbauprojekte suchen...',
            fr: 'Rechercher des projets de reconstruction...',
            tr: 'Yeniden yapım projeleri ara...'
        },

        // ═══ TRUST / ESCROW BANNER ═══
        'Funds held in escrow': { ar: 'أموال محفوظة في حساب ضمان', de: 'Gelder auf Treuhandkonto', fr: 'Fonds en entiercement', tr: 'Emanette tutulan fonlar' },

        // ═══ TRADESPERSON PORTAL (أصحاب المهن) ═══
        // Trade names — 10 specializations
        'trade_tiling': { ar: 'بلاط', de: 'Fliesenleger', fr: 'Carrelage', tr: 'Fayans' },
        'trade_painting': { ar: 'دهان', de: 'Maler', fr: 'Peinture', tr: 'Boyacı' },
        'trade_plumbing': { ar: 'سباكة', de: 'Klempner', fr: 'Plomberie', tr: 'Tesisatçı' },
        'trade_electrical': { ar: 'كهرباء', de: 'Elektriker', fr: 'Électricité', tr: 'Elektrikçi' },
        'trade_carpentry': { ar: 'نجارة', de: 'Schreiner', fr: 'Menuiserie', tr: 'Marangoz' },
        'trade_welding': { ar: 'لحام', de: 'Schweißer', fr: 'Soudure', tr: 'Kaynakçı' },
        'trade_masonry': { ar: 'بناء حجر', de: 'Maurer', fr: 'Maçonnerie', tr: 'Duvarcı' },
        'trade_plastering': { ar: 'قصارة', de: 'Putzer', fr: 'Plâtrage', tr: 'Sıvacı' },
        'trade_hvac': { ar: 'تكييف', de: 'Heizung/Klima', fr: 'Climatisation', tr: 'Klima' },
        'trade_general': { ar: 'أعمال عامة', de: 'Allgemein', fr: 'Général', tr: 'Genel' },

        // Dashboard — empty states & badges
        'tp_no_active_work': { ar: 'لا يوجد عمل نشط', de: 'Keine aktive Arbeit', fr: 'Aucun travail actif', tr: 'Aktif iş yok' },
        'tp_check_available': { ar: 'تحقق من الأعمال المتاحة للفرص الجديدة', de: 'Prüfen Sie verfügbare Aufträge', fr: 'Consultez les offres disponibles', tr: 'Yeni fırsatlar için müsait işleri kontrol edin' },
        'tp_homeowner': { ar: 'صاحب المنزل', de: 'Eigentümer', fr: 'Propriétaire', tr: 'Ev sahibi' },
        'tp_direct': { ar: 'مباشر', de: 'Direkt', fr: 'Direct', tr: 'Doğrudan' },
        'tp_contractor': { ar: 'مقاول', de: 'Auftragnehmer', fr: 'Entrepreneur', tr: 'Müteahhit' },

        // Requests tab
        'tp_no_requests': { ar: 'لا توجد طلبات مطابقة لتخصصك', de: 'Keine passenden Anfragen', fr: 'Aucune demande correspondante', tr: 'Mesleğinize uygun talep yok' },
        'tp_new_requests_auto': { ar: 'ستظهر الطلبات الجديدة هنا تلقائياً', de: 'Neue Anfragen erscheinen automatisch', fr: 'Les nouvelles demandes apparaîtront ici', tr: 'Yeni talepler burada otomatik görünecek' },
        'tp_no_description': { ar: 'بدون وصف', de: 'Keine Beschreibung', fr: 'Pas de description', tr: 'Açıklama yok' },
        'tp_budget': { ar: 'الميزانية', de: 'Budget', fr: 'Budget', tr: 'Bütçe' },
        'tp_accept_job': { ar: 'قبول العمل', de: 'Auftrag annehmen', fr: 'Accepter le travail', tr: 'İşi Kabul Et' },
        'tp_accepting': { ar: 'جارٍ القبول...', de: 'Wird angenommen...', fr: 'Acceptation...', tr: 'Kabul ediliyor...' },
        'tp_accepted': { ar: '✓ تم القبول', de: '✓ Angenommen', fr: '✓ Accepté', tr: '✓ Kabul Edildi' },

        // Assignments tab
        'tp_no_assignments': { ar: 'لا توجد مهام من المقاولين', de: 'Keine Auftragnehmer-Aufgaben', fr: 'Aucune mission de sous-traitance', tr: 'Müteahhit görevi yok' },
        'Accept': { ar: 'قبول', de: 'Annehmen', fr: 'Accepter', tr: 'Kabul' },
        'Decline': { ar: 'رفض', de: 'Ablehnen', fr: 'Refuser', tr: 'Reddet' },

        // Earnings tab
        'tp_no_earnings': { ar: 'لا توجد أرباح بعد', de: 'Noch keine Einnahmen', fr: 'Aucun revenu pour le moment', tr: 'Henüz kazanç yok' },
        'tp_contractor_type': { ar: 'مقاول', de: 'Auftragnehmer', fr: 'Entrepreneur', tr: 'Müteahhit' },
        'tp_direct_type': { ar: 'مباشر', de: 'Direkt', fr: 'Direct', tr: 'Doğrudan' },

        // Profile labels
        'Name': { ar: 'الاسم', de: 'Name', fr: 'Nom', tr: 'İsim' },
        'Primary Trade': { ar: 'التخصص الأساسي', de: 'Haupthandwerk', fr: 'Métier principal', tr: 'Ana Meslek' },
        'Experience': { ar: 'الخبرة', de: 'Erfahrung', fr: 'Expérience', tr: 'Deneyim' },
        'Hourly Rate': { ar: 'الأجر بالساعة', de: 'Stundensatz', fr: 'Taux horaire', tr: 'Saatlik Ücret' },
        'Daily Rate': { ar: 'الأجر اليومي', de: 'Tagessatz', fr: 'Taux journalier', tr: 'Günlük Ücret' },
        'Dynamic Score': { ar: 'النقاط الديناميكية', de: 'Dynamische Bewertung', fr: 'Score dynamique', tr: 'Dinamik Puan' },
        'Jobs Completed': { ar: 'الأعمال المنجزة', de: 'Erledigte Aufträge', fr: 'Travaux terminés', tr: 'Tamamlanan İşler' },
        'Rating': { ar: 'التقييم', de: 'Bewertung', fr: 'Évaluation', tr: 'Değerlendirme' },
        'tp_no_ratings': { ar: 'لا توجد تقييمات بعد', de: 'Noch keine Bewertungen', fr: 'Pas encore d\'évaluations', tr: 'Henüz değerlendirme yok' },
        'Availability': { ar: 'التوفر', de: 'Verfügbarkeit', fr: 'Disponibilité', tr: 'Uygunluk' },

        // Time expressions
        'tp_just_now': { ar: 'الآن', de: 'Gerade eben', fr: 'À l\'instant', tr: 'Az önce' },
        'tp_hours_ago': { ar: 'ساعة مضت', de: 'Stunden her', fr: 'heures', tr: 'saat önce' },
        'tp_days_ago': { ar: 'يوم مضى', de: 'Tage her', fr: 'jours', tr: 'gün önce' },

        // Error states
        'failed_to_load': { ar: 'فشل في التحميل', de: 'Laden fehlgeschlagen', fr: 'Échec du chargement', tr: 'Yükleme başarısız' },
        'tp_failed_to_load': { ar: 'فشل في التحميل', de: 'Laden fehlgeschlagen', fr: 'Échec du chargement', tr: 'Yükleme başarısız' },
        'tp_failed_profile': { ar: 'فشل في تحميل الملف الشخصي', de: 'Profil konnte nicht geladen werden', fr: 'Échec du chargement du profil', tr: 'Profil yüklenemedi' },
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
            var key = el.getAttribute('data-i18n');

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
            if (DICT[text] && DICT[text][langCode]) {
                node.textContent = node.textContent.replace(text, DICT[text][langCode]);
            }
        }
    }

    // ─── Language Selector Widget ─────────────────────────────────────────
    function createSelector() {
        var wrap = document.createElement('div');
        wrap.id = 'nm-lang-widget';
        wrap.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10000;font-family:"Plus Jakarta Sans",sans-serif;';

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
    function updateWidgetPosition() {
        var widget = document.getElementById('nm-lang-widget');
        if (!widget) return;
        var isRTL = document.documentElement.getAttribute('dir') === 'rtl';
        widget.style.right = isRTL ? 'auto' : '12px';
        widget.style.left = isRTL ? '12px' : 'auto';

        var dd = document.getElementById('nm-lang-dd');
        if (dd) {
            dd.style.right = isRTL ? 'auto' : '0';
            dd.style.left = isRTL ? '0' : 'auto';
        }
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

        document.body.appendChild(createSelector());

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
    };

})();
