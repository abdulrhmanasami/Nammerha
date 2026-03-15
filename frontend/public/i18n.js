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
        // P3-NEW-002: 'In Progress' aliased to 'in_progress' via KEY_ALIASES
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
        // P3-NEW-002: 'Gallery' aliased to 'gallery' via KEY_ALIASES
        'Verified Field Engineer': { ar: 'مهندس ميداني معتمد', de: 'Verifizierter Feldingenieur', fr: 'Ingénieur de terrain vérifié', tr: 'Doğrulanmış Saha Mühendisi' },

        // ═══ ENGINEER CAMERA PAGE ═══
        'Site Verification': { ar: 'التحقق الميداني', de: 'Standortverifizierung', fr: 'Vérification du site', tr: 'Saha Doğrulaması' },
        'GPS Coordinates': { ar: 'إحداثيات GPS', de: 'GPS-Koordinaten', fr: 'Coordonnées GPS', tr: 'GPS Koordinatları' },
        'Timestamp': { ar: 'الطابع الزمني', de: 'Zeitstempel', fr: 'Horodatage', tr: 'Zaman Damgası' },
        'Signature': { ar: 'التوقيع', de: 'Unterschrift', fr: 'Signature', tr: 'İmza' },
        // P3-NEW-002: 'Sync' aliased to 'sync' via KEY_ALIASES

        // ═══ HOMEOWNER REPORT PAGE ═══
        'Submit Repair Request': { ar: 'تقديم طلب إصلاح', de: 'Reparaturanfrage einreichen', fr: 'Soumettre une demande de réparation', tr: 'Onarım Talebi Gönder' },
        'Upload Photos': { ar: 'رفع الصور', de: 'Fotos hochladen', fr: 'Télécharger des photos', tr: 'Fotoğraf Yükle' },
        // P3-NEW-002: 'Location' aliased to 'location' via KEY_ALIASES
        'Description': { ar: 'الوصف', de: 'Beschreibung', fr: 'Description', tr: 'Açıklama' },
        'Category': { ar: 'الفئة', de: 'Kategorie', fr: 'Catégorie', tr: 'Kategori' },
        'Priority': { ar: 'الأولوية', de: 'Priorität', fr: 'Priorité', tr: 'Öncelik' },
        // P3-NEW-002: 'Governorate' aliased to 'governorate' via KEY_ALIASES
        // P3-NEW-002: 'Structural Damage' aliased to 'structural_damage' via KEY_ALIASES
        // P3-NEW-002: 'Electrical' aliased to 'electrical' via KEY_ALIASES
        // P3-NEW-002: 'General Repair' aliased to 'general_repair' via KEY_ALIASES
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
        // P3-NEW-002: 'Purchase Order' aliased to 'purchase_order' via KEY_ALIASES
        // P3-NEW-002: 'Vendor ID' aliased to 'vendor_id' via KEY_ALIASES
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

        // ═══ ADMIN ORACLE PAGE ═══
        'Pricing Oracle': { ar: 'مؤشر الأسعار', de: 'Preisorakel', fr: 'Oracle des prix', tr: 'Fiyat Kehaneti' },
        'Regional Supply Forecast': { ar: 'توقعات العرض الإقليمي', de: 'Regionale Angebotsprognose', fr: 'Prévision d\'approvisionnement régional', tr: 'Bölgesel Tedarik Tahmini' },
        'Steel Index Volatility': { ar: 'تقلب مؤشر الحديد', de: 'Stahlindexvolatilität', fr: 'Volatilité de l\'indice acier', tr: 'Çelik Endeksi Volatilitesi' },
        'Stable': { ar: 'مستقر', de: 'Stabil', fr: 'Stable', tr: 'Stabil' },
        'Constraint Risk': { ar: 'مخاطر القيود', de: 'Einschränkungsrisiko', fr: 'Risque de contrainte', tr: 'Kısıtlama Riski' },
        // P3-NEW-002: 'Estimated' aliased to 'estimated' via KEY_ALIASES
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

        // ═══ WALLET PAGE ═══
        'wallet_title': { ar: 'المحفظة', de: 'Geldbörse', fr: 'Portefeuille', tr: 'Cüzdan' },
        'total_escrow': { ar: 'إجمالي رصيد الضمان', de: 'Gesamtes Treuhandguthaben', fr: 'Solde total d\'entiercement', tr: 'Toplam Emanet Bakiyesi' },
        'locked_items': { ar: '0 محجوز', de: '0 gesperrt', fr: '0 verrouillé', tr: '0 kilitli' },
        'released_items': { ar: '0 محرر', de: '0 freigegeben', fr: '0 libéré', tr: '0 serbest' },
        'donate': { ar: 'تبرّع', de: 'Spenden', fr: 'Donner', tr: 'Bağışla' },
        'receipts': { ar: 'إيصالات', de: 'Quittungen', fr: 'Reçus', tr: 'Makbuzlar' },
        'impact': { ar: 'الأثر', de: 'Wirkung', fr: 'Impact', tr: 'Etki' },
        'recent_transactions': { ar: 'المعاملات الأخيرة', de: 'Letzte Transaktionen', fr: 'Transactions récentes', tr: 'Son İşlemler' },

        // ═══ PROFILE PAGE ═══
        'profile_title': { ar: 'الملف الشخصي', de: 'Profil', fr: 'Profil', tr: 'Profil' },
        'language_setting': { ar: 'اللغة', de: 'Sprache', fr: 'Langue', tr: 'Dil' },
        'notification_setting': { ar: 'الإشعارات', de: 'Benachrichtigungen', fr: 'Notifications', tr: 'Bildirimler' },
        'notification_desc': { ar: 'تنبيهات الدفع والبريد', de: 'Push- und E-Mail-Benachrichtigungen', fr: 'Alertes push et e-mail', tr: 'Push ve e-posta uyarıları' },
        'kyc_verification': { ar: 'التحقق من الهوية', de: 'Identitätsverifizierung', fr: 'Vérification d\'identité', tr: 'Kimlik Doğrulaması' },
        'kyc_detail': { ar: 'تحقق من هويتك', de: 'Identität verifizieren', fr: 'Vérifier votre identité', tr: 'Kimliğinizi doğrulayın' },
        'kyc_pending': { ar: 'بانتظار التحقق', de: 'Ausstehende Verifizierung', fr: 'Vérification en attente', tr: 'Doğrulama Bekliyor' },
        'about_nammerha': { ar: 'حول نعمِّرها', de: 'Über Nammerha', fr: 'À propos de Nammerha', tr: 'Nammerha Hakkında' },
        'about_learn_more': { ar: 'تعرّف علينا أكثر', de: 'Erfahren Sie mehr über uns', fr: 'En savoir plus sur nous', tr: 'Hakkımızda daha fazla bilgi' },
        'about_cta_subtitle': { ar: 'اكتشف مهمتنا لإعادة إعمار سوريا بشفافية جذرية', de: 'Entdecken Sie unsere Mission, Syrien mit radikaler Transparenz wiederaufzubauen', fr: 'Découvrez notre mission de reconstruire la Syrie avec une transparence radicale', tr: 'Suriye\'yi radikal şeffaflıkla yeniden inşa etme misyonumuzu keşfedin' },
        'ocds_certified': { ar: 'معتمد OCDS', de: 'OCDS-zertifiziert', fr: 'Certifié OCDS', tr: 'OCDS Sertifikalı' },
        'sign_out': { ar: 'تسجيل خروج', de: 'Abmelden', fr: 'Déconnexion', tr: 'Çıkış Yap' },

        // ═══ AUTH PAGE ═══
        'auth_welcome': { ar: 'أهلاً بك في نمّرها', de: 'Willkommen bei Nammerha', fr: 'Bienvenue sur Nammerha', tr: 'Nammerha\'ya Hoş Geldiniz' },
        'auth_subtitle': { ar: 'منصة إعادة الإعمار الشفافة', de: 'Transparente Wiederaufbauplattform', fr: 'Plateforme de reconstruction transparente', tr: 'Şeffaf Yeniden Yapım Platformu' },
        'tab_login': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Connexion', tr: 'Giriş' },
        'tab_register': { ar: 'إنشاء حساب', de: 'Registrieren', fr: 'Inscription', tr: 'Kayıt Ol' },
        'email_label': { ar: 'البريد الإلكتروني', de: 'E-Mail', fr: 'E-mail', tr: 'E-posta' },
        'password_label': { ar: 'كلمة المرور', de: 'Passwort', fr: 'Mot de passe', tr: 'Şifre' },
        'full_name_label': { ar: 'الاسم الكامل', de: 'Vollständiger Name', fr: 'Nom complet', tr: 'Ad Soyad' },
        'select_role': { ar: 'اختر دورك', de: 'Rolle auswählen', fr: 'Choisir votre rôle', tr: 'Rolünüzü seçin' },
        'role_homeowner': { ar: 'صاحب منزل', de: 'Hauseigentümer', fr: 'Propriétaire', tr: 'Ev Sahibi' },
        'role_donor': { ar: 'مانح', de: 'Spender', fr: 'Donateur', tr: 'Bağışçı' },
        'role_engineer': { ar: 'مهندس', de: 'Ingenieur', fr: 'Ingénieur', tr: 'Mühendis' },
        'role_supplier': { ar: 'مورد', de: 'Lieferant', fr: 'Fournisseur', tr: 'Tedarikçi' },
        'btn_sign_in': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Se connecter', tr: 'Giriş Yap' },
        'btn_create_account': { ar: 'إنشاء حساب', de: 'Konto erstellen', fr: 'Créer un compte', tr: 'Hesap Oluştur' },

        // ═══ LEGAL PAGES — Headings ═══
        'terms_title': { ar: 'شروط الخدمة', de: 'Nutzungsbedingungen', fr: 'Conditions d\'utilisation', tr: 'Kullanım Şartları' },
        'privacy_title': { ar: 'سياسة الخصوصية', de: 'Datenschutzrichtlinie', fr: 'Politique de confidentialité', tr: 'Gizlilik Politikası' },
        'tos_acceptance': { ar: '1. قبول الشروط', de: '1. Annahme der Bedingungen', fr: '1. Acceptation des conditions', tr: '1. Şartların Kabulü' },
        'tos_accounts': { ar: '2. حسابات المستخدمين', de: '2. Benutzerkonten', fr: '2. Comptes utilisateurs', tr: '2. Kullanıcı Hesapları' },
        'tos_escrow': { ar: '3. الضمان والمدفوعات', de: '3. Treuhand & Zahlungen', fr: '3. Entiercement & Paiements', tr: '3. Emanet & Ödemeler' },
        'tos_data': { ar: '4. البيانات والخصوصية', de: '4. Daten & Datenschutz', fr: '4. Données & Confidentialité', tr: '4. Veri & Gizlilik' },
        'tos_ocds': { ar: '5. التوافق مع OCDS', de: '5. OCDS-Konformität', fr: '5. Conformité OCDS', tr: '5. OCDS Uyumu' },
        'tos_liability': { ar: '6. حدود المسؤولية', de: '6. Haftungsbeschränkung', fr: '6. Limitation de responsabilité', tr: '6. Sorumluluk Sınırlaması' },
        'tos_governing': { ar: '7. القانون الحاكم', de: '7. Geltendes Recht', fr: '7. Droit applicable', tr: '7. Geçerli Hukuk' },
        'pp_intro': { ar: '1. مقدمة', de: '1. Einleitung', fr: '1. Introduction', tr: '1. Giriş' },
        'pp_collection': { ar: '2. المعلومات التي نجمعها', de: '2. Erfasste Informationen', fr: '2. Informations collectées', tr: '2. Topladığımız Bilgiler' },
        'pp_use': { ar: '3. كيف نستخدم بياناتك', de: '3. Verwendung Ihrer Daten', fr: '3. Utilisation de vos données', tr: '3. Verilerinizi Nasıl Kullanırız' },
        'pp_security': { ar: '4. أمن البيانات', de: '4. Datensicherheit', fr: '4. Sécurité des données', tr: '4. Veri Güvenliği' },
        'pp_retention': { ar: '5. الاحتفاظ بالبيانات', de: '5. Datenaufbewahrung', fr: '5. Conservation des données', tr: '5. Veri Saklama' },
        'pp_rights': { ar: '6. حقوقك', de: '6. Ihre Rechte', fr: '6. Vos droits', tr: '6. Haklarınız' },

        // ═══ LEGAL PAGES — Terms of Service Body Content ═══
        'tos_last_updated': { ar: 'آخر تحديث: مارس 2026', de: 'Letzte Aktualisierung: März 2026', fr: 'Dernière mise à jour : mars 2026', tr: 'Son güncelleme: Mart 2026' },
        'tos_acceptance_body': {
            ar: 'بوصولك إلى منصة نمّرها ("المنصة") أو استخدامها، فإنك توافق على الالتزام بشروط الخدمة هذه. المنصة هي سوق إعادة إعمار متوافق مع معيار البيانات المفتوحة للتعاقد (OCDS) وتُشغَّل لتسهيل إعادة البناء المجتمعي الشفاف في سوريا.',
            de: 'Durch den Zugriff auf oder die Nutzung der Nammerha-Plattform („Plattform") erklären Sie sich mit diesen Nutzungsbedingungen einverstanden. Die Plattform ist ein OCDS-konformer Wiederaufbaumarktplatz, der den transparenten, gemeinschaftsorientierten Wiederaufbau in Syrien ermöglicht.',
            fr: 'En accédant ou en utilisant la plateforme Nammerha (« Plateforme »), vous acceptez d\'être lié par les présentes Conditions d\'utilisation. La Plateforme est un marché de reconstruction conforme à l\'OCDS, exploité pour faciliter la reconstruction communautaire transparente en Syrie.',
            tr: 'Nammerha platformuna ("Platform") erişerek veya kullanarak bu Kullanım Şartlarına bağlı olmayı kabul edersiniz. Platform, Suriye\'de şeffaf, toplum odaklı yeniden yapılanmayı kolaylaştırmak amacıyla işletilen OCDS uyumlu bir yeniden yapım pazaryeridir.'
        },
        'tos_accounts_body_1': {
            ar: 'يجب عليك التسجيل للحصول على حساب وإتمام التحقق من الهوية (KYC) للمشاركة في أنشطة التمويل أو الهندسة أو سلسلة التوريد. أنت مسؤول عن الحفاظ على سرية بيانات اعتماد حسابك.',
            de: 'Sie müssen sich für ein Konto registrieren und die KYC-Verifizierung abschließen, um an Finanzierungs-, Ingenieur- oder Lieferkettenaktivitäten teilzunehmen. Sie sind für die Vertraulichkeit Ihrer Kontodaten verantwortlich.',
            fr: 'Vous devez créer un compte et compléter la vérification KYC pour participer aux activités de financement, d\'ingénierie ou de chaîne d\'approvisionnement. Vous êtes responsable de la confidentialité de vos identifiants.',
            tr: 'Finansman, mühendislik veya tedarik zinciri faaliyetlerine katılmak için bir hesap açmanız ve KYC doğrulamasını tamamlamanız gerekmektedir. Hesap bilgilerinizin gizliliğini korumaktan siz sorumlusunuz.'
        },
        'tos_accounts_body_2': {
            ar: 'الحسابات مبنية على الأدوار: صاحب منزل، مانح، مهندس، أو مورّد. لكل دور أذونات والتزامات محددة كما تحددها المنصة.',
            de: 'Konten sind rollenbasiert: Hauseigentümer, Spender, Ingenieur oder Lieferant. Jede Rolle hat spezifische Berechtigungen und Pflichten, die von der Plattform definiert werden.',
            fr: 'Les comptes sont basés sur des rôles : Propriétaire, Donateur, Ingénieur ou Fournisseur. Chaque rôle dispose de permissions et d\'obligations spécifiques définies par la Plateforme.',
            tr: 'Hesaplar rol tabanlıdır: Ev Sahibi, Bağışçı, Mühendis veya Tedarikçi. Her rolün Platform tarafından belirlenen özel izinleri ve yükümlülükleri vardır.'
        },
        'tos_escrow_body_1': {
            ar: 'تُحتفظ بجميع التبرعات في حساب ضمان حتى يتم تأكيد تسليم المواد عبر إثباتات مكانية مُوثَّقة بنظام GPS. تُحرَّر الأموال فقط بعد تحقق المهندس وتقديم أدلة مصوّرة.',
            de: 'Alle Spenden werden auf einem Treuhandkonto gehalten, bis die verifizierte Lieferung der Materialien durch GPS-verifizierte räumliche Nachweise bestätigt wird. Gelder werden nur nach Ingenieurverifizierung und fotografischem Nachweis freigegeben.',
            fr: 'Tous les dons sont détenus sous séquestre jusqu\'à ce que la livraison vérifiée des matériaux soit confirmée par des preuves spatiales vérifiées par GPS. Les fonds ne sont libérés qu\'après vérification de l\'ingénieur et preuve photographique.',
            tr: 'Tüm bağışlar, malzemelerin GPS doğrulamalı mekansal kanıtlarla teyit edilmiş teslimatına kadar emanette tutulur. Fonlar yalnızca mühendis doğrulaması ve fotoğrafik kanıt ile serbest bırakılır.'
        },
        'tos_escrow_body_2': {
            ar: 'تُخزَّن جميع القيم النقدية كأعداد صحيحة (سنتات) لضمان الدقة المالية. تستخدم المنصة حسابات BIGINT لمنع أخطاء التقريب في جميع معاملات الضمان.',
            de: 'Alle Geldwerte werden als Ganzzahlen (Cent) gespeichert, um finanzielle Präzision zu gewährleisten. Die Plattform verwendet BIGINT-Arithmetik, um Rundungsfehler bei allen Treuhandtransaktionen zu vermeiden.',
            fr: 'Toutes les valeurs monétaires sont stockées en nombres entiers (centimes) pour garantir la précision financière. La Plateforme utilise l\'arithmétique BIGINT pour éviter les erreurs d\'arrondi sur toutes les transactions de séquestre.',
            tr: 'Tüm parasal değerler, finansal hassasiyeti sağlamak için tam sayılar (kuruş) olarak saklanır. Platform, tüm emanet işlemlerinde yuvarlama hatalarını önlemek için BIGINT aritmetiği kullanır.'
        },
        'tos_data_body': {
            ar: 'يخضع استخدامك للمنصة أيضاً لسياسة الخصوصية الخاصة بنا. نجمع بيانات KYC وإحداثيات GPS وبيانات المعاملات لضمان المساءلة ومنع الاحتيال.',
            de: 'Ihre Nutzung der Plattform unterliegt auch unserer Datenschutzrichtlinie. Wir erheben KYC-Daten, GPS-Koordinaten und Transaktionsdaten, um Rechenschaftspflicht zu gewährleisten und Betrug zu verhindern.',
            fr: 'Votre utilisation de la Plateforme est également régie par notre Politique de confidentialité. Nous collectons des données KYC, des coordonnées GPS et des données transactionnelles pour assurer la responsabilité et prévenir la fraude.',
            tr: 'Platform kullanımınız ayrıca Gizlilik Politikamıza tabidir. Hesap verebilirliği sağlamak ve dolandırıcılığı önlemek için KYC verileri, GPS koordinatları ve işlem verileri topluyoruz.'
        },
        'tos_privacy_link': { ar: 'سياسة الخصوصية', de: 'Datenschutzrichtlinie', fr: 'Politique de confidentialité', tr: 'Gizlilik Politikası' },
        'tos_ocds_body': {
            ar: 'تلتزم المنصة بمعيار البيانات المفتوحة للتعاقد (OCDS). تُنشر جميع أنشطة الشراء وبيانات التسعير وتقدم المشاريع بشفافية ويمكن تدقيقها بشكل مستقل.',
            de: 'Die Plattform entspricht dem Open Contracting Data Standard. Alle Beschaffungsaktivitäten, Preisdaten und Projektfortschritte werden transparent veröffentlicht und können unabhängig geprüft werden.',
            fr: 'La Plateforme adhère au Standard de Données Ouvertes de la Commande Publique. Toutes les activités d\'approvisionnement, données tarifaires et avancements de projets sont publiés de manière transparente et auditables indépendamment.',
            tr: 'Platform, Açık İhale Veri Standardına (OCDS) uygundur. Tüm tedarik faaliyetleri, fiyatlama verileri ve proje ilerlemeleri şeffaf bir şekilde yayınlanır ve bağımsız olarak denetlenebilir.'
        },
        'tos_liability_body': {
            ar: 'توفر المنصة البنية التحتية التقنية لربط أصحاب المصلحة. نحن غير مسؤولين عن جودة أعمال البناء أو عيوب المواد أو النزاعات بين الأطراف بخلاف آلية الضمان المقدمة.',
            de: 'Die Plattform stellt technologische Infrastruktur zur Verbindung von Interessengruppen bereit. Wir haften nicht für die Qualität der Bauarbeiten, Materialfehler oder Streitigkeiten zwischen den Parteien über den bereitgestellten Treuhandmechanismus hinaus.',
            fr: 'La Plateforme fournit l\'infrastructure technologique pour connecter les parties prenantes. Nous ne sommes pas responsables de la qualité des travaux de construction, des défauts de matériaux ou des litiges entre les parties au-delà du mécanisme de séquestre fourni.',
            tr: 'Platform, paydaşları birbirine bağlamak için teknoloji altyapısı sağlar. Sağlanan emanet mekanizması dışındaki inşaat kalitesi, malzeme kusurları veya taraflar arasındaki anlaşmazlıklardan sorumlu değiliz.'
        },
        'tos_governing_body': {
            ar: 'تخضع هذه الشروط وتُفسَّر وفقاً للقانون الإنساني الدولي المعمول به وقوانين الولاية القضائية التي تأسست فيها نمّرها.',
            de: 'Diese Bedingungen unterliegen dem geltenden internationalen humanitären Recht und den Gesetzen der Gerichtsbarkeit, in der Nammerha eingetragen ist, und werden danach ausgelegt.',
            fr: 'Les présentes Conditions sont régies et interprétées conformément au droit international humanitaire applicable et aux lois de la juridiction dans laquelle Nammerha est constituée.',
            tr: 'Bu Şartlar, yürürlükteki uluslararası insancıl hukuk ve Nammerha\'nın kurulduğu yargı alanının yasalarına göre yönetilir ve yorumlanır.'
        },
        'tos_trust_badge': {
            ar: 'تضمن هذه الشروط الشفافية وتحمي جميع أصحاب المصلحة في عملية إعادة الإعمار.',
            de: 'Diese Bedingungen gewährleisten Transparenz und schützen alle Beteiligten im Wiederaufbauprozess.',
            fr: 'Ces conditions garantissent la transparence et protègent toutes les parties prenantes du processus de reconstruction.',
            tr: 'Bu şartlar şeffaflığı sağlar ve yeniden yapım sürecindeki tüm paydaşları korur.'
        },

        // ═══ LEGAL PAGES — Privacy Policy Body Content ═══
        'pp_last_updated': { ar: 'آخر تحديث: مارس 2026', de: 'Letzte Aktualisierung: März 2026', fr: 'Dernière mise à jour : mars 2026', tr: 'Son güncelleme: Mart 2026' },
        'pp_intro_body': {
            ar: 'تلتزم نمّرها ("نحن"، "لنا"، "المنصة") بحماية خصوصيتك. توضح سياسة الخصوصية هذه كيفية جمعنا واستخدامنا والكشف عن معلوماتك وحمايتها عند استخدامك لسوق إعادة الإعمار المتوافق مع OCDS.',
            de: 'Nammerha („wir", „unser", „Plattform") ist dem Schutz Ihrer Privatsphäre verpflichtet. Diese Datenschutzrichtlinie erläutert, wie wir Ihre Informationen erfassen, verwenden, offenlegen und schützen, wenn Sie unseren OCDS-konformen Wiederaufbaumarktplatz nutzen.',
            fr: 'Nammerha (« nous », « notre », « Plateforme ») s\'engage à protéger votre vie privée. Cette Politique de confidentialité explique comment nous collectons, utilisons, divulguons et protégeons vos informations lorsque vous utilisez notre marché de reconstruction conforme à l\'OCDS.',
            tr: 'Nammerha ("biz", "bizim", "Platform") gizliliğinizi korumaya kararlıdır. Bu Gizlilik Politikası, OCDS uyumlu yeniden yapım pazaryerimizi kullandığınızda bilgilerinizi nasıl topladığımızı, kullandığımızı, ifşa ettiğimizi ve koruduğumuzu açıklar.'
        },
        'pp_data_identity': { ar: 'بيانات الهوية', de: 'Identitätsdaten', fr: 'Données d\'identité', tr: 'Kimlik Verileri' },
        'pp_data_identity_detail': {
            ar: 'الاسم الكامل، البريد الإلكتروني، الدور، ووثائق التحقق من الهوية (هوية حكومية، إثبات عنوان).',
            de: 'Vollständiger Name, E-Mail, Rolle und KYC-Dokumente (amtlicher Ausweis, Adressnachweis).',
            fr: 'Nom complet, e-mail, rôle et documents KYC (pièce d\'identité gouvernementale, justificatif de domicile).',
            tr: 'Tam ad, e-posta, rol ve KYC belgeleri (resmi kimlik, adres kanıtı).'
        },
        'pp_data_location': { ar: 'بيانات الموقع', de: 'Standortdaten', fr: 'Données de localisation', tr: 'Konum Verileri' },
        'pp_data_location_detail': {
            ar: 'إحداثيات GPS للإثباتات المكانية والتحقق من التسليم.',
            de: 'GPS-Koordinaten für räumliche Nachweise und Lieferverifizierung.',
            fr: 'Coordonnées GPS pour les preuves spatiales et la vérification de livraison.',
            tr: 'Mekansal kanıtlar ve teslimat doğrulaması için GPS koordinatları.'
        },
        'pp_data_financial': { ar: 'البيانات المالية', de: 'Finanzdaten', fr: 'Données financières', tr: 'Finansal Veriler' },
        'pp_data_financial_detail': {
            ar: 'مبالغ التبرعات، معاملات الضمان، وبيانات وسيلة الدفع.',
            de: 'Spendenbeträge, Treuhandtransaktionen und Zahlungsmethode-Metadaten.',
            fr: 'Montants des dons, transactions de séquestre et métadonnées de mode de paiement.',
            tr: 'Bağış tutarları, emanet işlemleri ve ödeme yöntemi meta verileri.'
        },
        'pp_data_device': { ar: 'بيانات الجهاز', de: 'Gerätedaten', fr: 'Données de l\'appareil', tr: 'Cihaz Verileri' },
        'pp_data_device_detail': {
            ar: 'نوع المتصفح، عنوان IP، وبيانات الجهاز لمنع الاحتيال.',
            de: 'Browsertyp, IP-Adresse, Gerätemetadaten zur Betrugsprävention.',
            fr: 'Type de navigateur, adresse IP, métadonnées d\'appareil pour la prévention de la fraude.',
            tr: 'Tarayıcı türü, IP adresi, dolandırıcılık önleme için cihaz meta verileri.'
        },
        'pp_use_kyc': {
            ar: 'للتحقق من هويتك ومنع الاحتيال (الامتثال لـ KYC)',
            de: 'Um Ihre Identität zu verifizieren und Betrug zu verhindern (KYC-Compliance)',
            fr: 'Pour vérifier votre identité et prévenir la fraude (conformité KYC)',
            tr: 'Kimliğinizi doğrulamak ve dolandırıcılığı önlemek için (KYC uyumu)'
        },
        'pp_use_donations': {
            ar: 'لمعالجة التبرعات وإدارة معاملات الضمان',
            de: 'Um Spenden zu verarbeiten und Treuhandtransaktionen zu verwalten',
            fr: 'Pour traiter les dons et gérer les transactions de séquestre',
            tr: 'Bağışları işlemek ve emanet işlemlerini yönetmek için'
        },
        'pp_use_delivery': {
            ar: 'للتحقق من تسليم المواد عبر إثباتات مصوّرة بطابع GPS',
            de: 'Um die Materiallieferung durch GPS-gestempelte fotografische Nachweise zu verifizieren',
            fr: 'Pour vérifier la livraison des matériaux par des preuves photographiques horodatées GPS',
            tr: 'Malzeme teslimatını GPS damgalı fotoğrafik kanıtlarla doğrulamak için'
        },
        'pp_use_ocds': {
            ar: 'لنشر بيانات الشراء الشفافة وفق معايير OCDS',
            de: 'Um transparente Beschaffungsdaten nach OCDS-Standards zu veröffentlichen',
            fr: 'Pour publier des données d\'approvisionnement transparentes selon les standards OCDS',
            tr: 'OCDS standartları kapsamında şeffaf tedarik verilerini yayınlamak için'
        },
        'pp_use_audit': {
            ar: 'لإنشاء سجلات تدقيق للمساءلة والامتثال القانوني',
            de: 'Um Prüfprotokolle für Rechenschaftspflicht und rechtliche Compliance zu erstellen',
            fr: 'Pour générer des pistes d\'audit pour la responsabilité et la conformité juridique',
            tr: 'Hesap verebilirlik ve yasal uyum için denetim izleri oluşturmak için'
        },
        'pp_security_body': {
            ar: 'نطبّق تدابير أمنية وفق أعلى المعايير الصناعية تشمل:',
            de: 'Wir implementieren branchenübliche Sicherheitsmaßnahmen, darunter:',
            fr: 'Nous mettons en œuvre des mesures de sécurité conformes aux normes de l\'industrie, notamment :',
            tr: 'Aşağıdakileri içeren endüstri standardı güvenlik önlemleri uyguluyoruz:'
        },
        'pp_sec_tls': { ar: 'تشفير TLS 1.3', de: 'TLS 1.3 Verschlüsselung', fr: 'Chiffrement TLS 1.3', tr: 'TLS 1.3 Şifreleme' },
        'pp_sec_hash': { ar: 'بصمة SHA-256 للصور', de: 'SHA-256 Bild-Hash', fr: 'Hachage SHA-256 des images', tr: 'SHA-256 Görsel Doğrulaması' },
        'pp_sec_jwt': { ar: 'رموز مصادقة JWT', de: 'JWT-Auth-Tokens', fr: 'Jetons d\'authentification JWT', tr: 'JWT Kimlik Doğrulama' },
        'pp_sec_sql': { ar: 'استعلامات SQL مُعلَمَة', de: 'Parametrisiertes SQL', fr: 'SQL paramétré', tr: 'Parametrik SQL' },
        'pp_retention_body': {
            ar: 'نحتفظ ببياناتك طالما أن حسابك نشط وحسبما تقتضيه القوانين المعمول بها. تُحتفظ بالبيانات المالية وسجلات التدقيق بشكل دائم للامتثال لمعيار OCDS والمساءلة. يمكنك طلب حذف البيانات غير الضرورية عبر التواصل معنا.',
            de: 'Wir speichern Ihre Daten, solange Ihr Konto aktiv ist und wie es das geltende Recht erfordert. Finanz- und Prüfpfaddaten werden zur OCDS-Compliance und Rechenschaftspflicht dauerhaft aufbewahrt. Sie können die Löschung nicht wesentlicher Daten beantragen, indem Sie uns kontaktieren.',
            fr: 'Nous conservons vos données aussi longtemps que votre compte est actif et comme l\'exigent les lois applicables. Les données financières et les pistes d\'audit sont conservées de manière permanente pour la conformité OCDS et la responsabilité. Vous pouvez demander la suppression des données non essentielles en nous contactant.',
            tr: 'Hesabınız aktif olduğu sürece ve yürürlükteki yasaların gerektirdiği şekilde verilerinizi saklıyoruz. Finansal ve denetim izi verileri, OCDS uyumu ve hesap verebilirlik için kalıcı olarak saklanır. Bizimle iletişime geçerek zorunlu olmayan verilerin silinmesini talep edebilirsiniz.'
        },
        'pp_rights_body': {
            ar: 'لديك الحق في الوصول إلى بياناتك الشخصية أو تصحيحها أو حذفها. يمكنك سحب الموافقة على معالجة البيانات في أي وقت، مع مراعاة الالتزامات القانونية والتعاقدية. تواصل معنا عبر privacy@nammerha.org.',
            de: 'Sie haben das Recht, auf Ihre personenbezogenen Daten zuzugreifen, sie zu korrigieren oder zu löschen. Sie können Ihre Einwilligung zur Datenverarbeitung jederzeit widerrufen, vorbehaltlich gesetzlicher und vertraglicher Verpflichtungen. Kontaktieren Sie uns unter privacy@nammerha.org.',
            fr: 'Vous avez le droit d\'accéder à vos données personnelles, de les corriger ou de les supprimer. Vous pouvez retirer votre consentement au traitement des données à tout moment, sous réserve des obligations légales et contractuelles. Contactez-nous à privacy@nammerha.org.',
            tr: 'Kişisel verilerinize erişme, düzeltme veya silme hakkınız vardır. Yasal ve sözleşmesel yükümlülüklere tabi olarak, veri işleme onayınızı istediğiniz zaman geri çekebilirsiniz. privacy@nammerha.org adresinden bize ulaşın.'
        },
        'pp_trust_badge': {
            ar: 'بياناتك محمية بتشفير وفق أعلى المعايير الصناعية ولن تُباع لأطراف ثالثة أبداً.',
            de: 'Ihre Daten sind durch branchenübliche Verschlüsselung geschützt und werden niemals an Dritte verkauft.',
            fr: 'Vos données sont protégées par un chiffrement conforme aux normes de l\'industrie et ne sont jamais vendues à des tiers.',
            tr: 'Verileriniz endüstri standardı şifreleme ile korunur ve asla üçüncü taraflara satılmaz.'
        },

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

        // ═══ AUTH PAGE — MISSING KEYS (Screenshot-visible) ═══
        'sign_in': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Connexion', tr: 'Giriş' },
        'create_account': { ar: 'إنشاء حساب', de: 'Registrieren', fr: 'Inscription', tr: 'Kayıt Ol' },
        'sign_in_btn': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Se connecter', tr: 'Giriş Yap' },
        'create_account_btn': { ar: 'إنشاء حساب', de: 'Konto erstellen', fr: 'Créer un compte', tr: 'Hesap Oluştur' },
        'your_role': { ar: 'اختر دورك', de: 'Ihre Rolle', fr: 'Votre rôle', tr: 'Rolünüz' },
        'pw_requirements': { ar: '+٨ أحرف، حرف كبير، رقم', de: '8+ Zeichen, 1 Großbuchstabe, 1 Zahl', fr: '8+ car., 1 majuscule, 1 chiffre', tr: '8+ karakter, 1 büyük harf, 1 rakam' },
        'forgot_password': { ar: 'نسيت كلمة المرور؟', de: 'Passwort vergessen?', fr: 'Mot de passe oublié ?', tr: 'Şifrenizi mi unuttunuz?' },
        'auth_trust_1': { ar: 'معتمد OCDS', de: 'OCDS-verifiziert', fr: 'Vérifié OCDS', tr: 'OCDS Doğrulanmış' },
        'auth_trust_2': { ar: 'تشفير 256-بت', de: '256-Bit verschlüsselt', fr: 'Chiffrement 256 bits', tr: '256-bit Şifreli' },
        'auth_footer': { ar: 'بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية.', de: 'Durch Fortfahren stimmen Sie unseren Nutzungsbedingungen und der Datenschutzrichtlinie zu.', fr: 'En continuant, vous acceptez nos Conditions d\'utilisation et notre Politique de confidentialité.', tr: 'Devam ederek Kullanım Şartlarımızı ve Gizlilik Politikamızı kabul edersiniz.' },
        'role_contractor': { ar: 'مقاول', de: 'Auftragnehmer', fr: 'Entrepreneur', tr: 'Müteahhit' },
        'role_tradesperson': { ar: 'حرفي', de: 'Handwerker', fr: 'Artisan', tr: 'Esnaf' },

        // ═══ VERIFY EMAIL PAGE ═══
        'verify_email_title': { ar: 'جاري التحقق من البريد…', de: 'E-Mail wird verifiziert…', fr: 'Vérification de l\'e-mail…', tr: 'E-posta Doğrulanıyor…' },
        'verify_email_subtitle': { ar: 'يرجى الانتظار بينما نتحقق من بريدك الإلكتروني', de: 'Bitte warten Sie, während wir Ihre E-Mail verifizieren', fr: 'Veuillez patienter pendant la vérification de votre e-mail', tr: 'E-postanız doğrulanırken lütfen bekleyin' },
        'back_to_login': { ar: '→ العودة لتسجيل الدخول', de: '← Zurück zur Anmeldung', fr: '← Retour à la connexion', tr: '← Girişe Dön' },

        // ═══ RESET PASSWORD PAGE ═══
        'reset_password_title': { ar: 'إعادة تعيين كلمة المرور', de: 'Passwort zurücksetzen', fr: 'Réinitialiser le mot de passe', tr: 'Şifre Sıfırlama' },
        'reset_password_subtitle': { ar: 'أنشئ كلمة مرور جديدة وآمنة لحسابك', de: 'Erstellen Sie ein neues sicheres Passwort für Ihr Konto', fr: 'Créez un nouveau mot de passe sécurisé pour votre compte', tr: 'Hesabınız için yeni güvenli bir şifre oluşturun' },
        'new_password_label': { ar: 'كلمة المرور الجديدة', de: 'Neues Passwort', fr: 'Nouveau mot de passe', tr: 'Yeni Şifre' },
        'confirm_password_label': { ar: 'تأكيد كلمة المرور', de: 'Passwort bestätigen', fr: 'Confirmer le mot de passe', tr: 'Şifreyi Onayla' },
        'reset_password_btn': { ar: 'إعادة تعيين كلمة المرور', de: 'Passwort zurücksetzen', fr: 'Réinitialiser le mot de passe', tr: 'Şifreyi Sıfırla' },

        // ═══ CONTACT PAGE ═══
        'contact_title': { ar: 'تواصل معنا', de: 'Kontakt', fr: 'Contactez-nous', tr: 'Bize Ulaşın' },
        'contact_org_name': { ar: 'نمّرها', de: 'Nammerha', fr: 'Nammerha', tr: 'Nammerha' },
        'contact_org_tagline': { ar: 'المنصة الوطنية لإعادة الإعمار', de: 'Nationale Wiederaufbauplattform', fr: 'Plateforme nationale de reconstruction', tr: 'Ulusal Yeniden Yapım Platformu' },
        'contact_details': { ar: 'معلومات التواصل', de: 'Kontaktdaten', fr: 'Coordonnées', tr: 'İletişim Bilgileri' },
        'contact_email_label': { ar: 'البريد الإلكتروني', de: 'E-Mail', fr: 'E-mail', tr: 'E-posta' },
        'contact_address_label': { ar: 'العنوان', de: 'Adresse', fr: 'Adresse', tr: 'Adres' },
        'contact_address_value': { ar: 'دمشق، سوريا', de: 'Damaskus, Syrien', fr: 'Damas, Syrie', tr: 'Şam, Suriye' },
        'contact_hours_label': { ar: 'ساعات العمل', de: 'Arbeitszeiten', fr: 'Horaires', tr: 'Çalışma Saatleri' },
        'contact_hours_value': { ar: 'الأحد – الخميس، ٩ ص – ٥ م (توقيت دمشق)', de: 'So–Do, 9:00–17:00 (Damaskus)', fr: 'Dim–Jeu, 9h–17h (Damas)', tr: 'Paz–Per, 09:00–17:00 (Şam)' },
        'contact_sla': { ar: 'أوقات الاستجابة', de: 'Reaktionszeiten', fr: 'Délais de réponse', tr: 'Yanıt Süreleri' },
        'contact_sla_general': { ar: 'استفسارات عامة: ٤٨ ساعة عمل', de: 'Allgemeine Anfragen: 48 Arbeitsstunden', fr: 'Demandes générales : 48h ouvrées', tr: 'Genel sorular: 48 iş saati' },
        'contact_sla_escrow': { ar: 'مسائل الضمان: ٢٤ ساعة عمل', de: 'Treuhandfragen: 24 Arbeitsstunden', fr: 'Questions d\'entiercement : 24h ouvrées', tr: 'Emanet sorunları: 24 iş saati' },
        'contact_sla_security': { ar: 'تنبيهات أمنية: ٤ ساعات', de: 'Sicherheitswarnungen: 4 Stunden', fr: 'Alertes de sécurité : 4h', tr: 'Güvenlik uyarıları: 4 saat' },
        'contact_legal': { ar: 'روابط قانونية', de: 'Rechtliche Links', fr: 'Liens juridiques', tr: 'Yasal Bağlantılar' },
        'contact_link_tos': { ar: 'شروط الخدمة', de: 'Nutzungsbedingungen', fr: 'Conditions d\'utilisation', tr: 'Kullanım Şartları' },
        'contact_link_privacy': { ar: 'سياسة الخصوصية', de: 'Datenschutzrichtlinie', fr: 'Politique de confidentialité', tr: 'Gizlilik Politikası' },
        'contact_link_refund': { ar: 'سياسة الاسترداد', de: 'Rückerstattungsrichtlinie', fr: 'Politique de remboursement', tr: 'İade Politikası' },
        'contact_trust': { ar: 'منصة معتمدة OCDS — الشفافية والمساءلة في كل معاملة.', de: 'OCDS-zertifizierte Plattform — Transparenz und Verantwortlichkeit bei jeder Transaktion.', fr: 'Plateforme certifiée OCDS — Transparence et responsabilité à chaque transaction.', tr: 'OCDS sertifikalı platform — Her işlemde şeffaflık ve hesap verebilirlik.' },

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

        // ═══ REFUND POLICY PAGE ═══
        'refund_title': { ar: 'سياسة الاسترداد والضمان', de: 'Rückerstattungs- und Treuhandrichtlinie', fr: 'Politique de remboursement et d\'entiercement', tr: 'İade ve Emanet Politikası' },
        'refund_how_escrow': { ar: 'كيف يعمل الضمان؟', de: 'Wie funktioniert die Treuhand?', fr: 'Comment fonctionne l\'entiercement ?', tr: 'Emanet nasıl çalışır?' },
        'refund_escrow_intro': { ar: 'تُحتفظ جميع التبرعات في ضمان آمن حتى يتم التحقق من تسليم المواد.', de: 'Alle Spenden werden in sicherem Treuhandschutz gehalten, bis die Materiallieferung verifiziert ist.', fr: 'Tous les dons sont détenus sous séquestre jusqu\'à vérification de la livraison.', tr: 'Tüm bağışlar malzeme teslimatı doğrulanana kadar güvenli emanette tutulur.' },
        'refund_escrow_release': { ar: 'تحرير الضمان', de: 'Treuhandfreigabe', fr: 'Libération de l\'entiercement', tr: 'Emanet Serbest Bırakma' },
        'refund_escrow_detail': { ar: 'تُحرَّر الأموال فقط بعد إثبات التسليم الميداني بطابع GPS.', de: 'Gelder werden nur nach GPS-gestempeltem Feldliefernachweis freigegeben.', fr: 'Les fonds ne sont libérés qu\'après preuve de livraison GPS sur le terrain.', tr: 'Fonlar yalnızca GPS damgalı saha teslimat kanıtından sonra serbest bırakılır.' },
        'refund_eligibility': { ar: 'أهلية الاسترداد', de: 'Rückerstattungsberechtigung', fr: 'Éligibilité au remboursement', tr: 'İade Uygunluğu' },
        'refund_elig_pending': { ar: 'معلّق', de: 'Ausstehend', fr: 'En attente', tr: 'Beklemede' },
        'refund_elig_pending_detail': { ar: 'استرداد كامل — لم يتم تخصيص الأموال بعد.', de: 'Volle Rückerstattung — Gelder noch nicht zugewiesen.', fr: 'Remboursement intégral — fonds non encore affectés.', tr: 'Tam iade — fonlar henüz tahsis edilmedi.' },
        'refund_elig_released': { ar: 'محرر', de: 'Freigegeben', fr: 'Libéré', tr: 'Serbest' },
        'refund_elig_released_detail': { ar: 'غير قابل للاسترداد — تم تسليم المواد والتحقق منها.', de: 'Nicht erstattungsfähig — Materialien geliefert und verifiziert.', fr: 'Non remboursable — matériaux livrés et vérifiés.', tr: 'İade edilemez — malzemeler teslim edildi ve doğrulandı.' },
        'refund_elig_stalled': { ar: 'متوقف', de: 'Blockiert', fr: 'Bloqué', tr: 'Durmuş' },
        'refund_elig_stalled_detail': { ar: 'استرداد كامل بعد ٩٠ يوماً من عدم النشاط.', de: 'Volle Rückerstattung nach 90 Tagen Inaktivität.', fr: 'Remboursement intégral après 90 jours d\'inactivité.', tr: '90 gün hareketsizlik sonrası tam iade.' },
        'refund_processing': { ar: 'خطوات المعالجة', de: 'Bearbeitungsschritte', fr: 'Étapes de traitement', tr: 'İşlem Adımları' },
        'refund_step_1': { ar: '١. تقديم طلب الاسترداد', de: '1. Rückerstattungsanfrage stellen', fr: '1. Soumettre une demande de remboursement', tr: '1. İade talebi gönderin' },
        'refund_step_2': { ar: '٢. مراجعة فريق نمّرها', de: '2. Prüfung durch das Nammerha-Team', fr: '2. Examen par l\'équipe Nammerha', tr: '2. Nammerha ekibi tarafından inceleme' },
        'refund_step_3': { ar: '٣. التحقق من حالة الضمان', de: '3. Treuhandstatus prüfen', fr: '3. Vérification du statut de l\'entiercement', tr: '3. Emanet durumu doğrulama' },
        'refund_step_4': { ar: '٤. إصدار الاسترداد', de: '4. Rückerstattung ausstellen', fr: '4. Émission du remboursement', tr: '4. İade düzenleme' },
        'refund_col_type': { ar: 'النوع', de: 'Typ', fr: 'Type', tr: 'Tür' },
        'refund_col_time': { ar: 'الوقت المقدر', de: 'Geschätzte Zeit', fr: 'Temps estimé', tr: 'Tahmini Süre' },
        'refund_time_pending': { ar: '٢٤-٤٨ ساعة عمل', de: '24–48 Arbeitsstunden', fr: '24–48h ouvrées', tr: '24–48 iş saati' },
        'refund_time_stalled': { ar: '٥-٧ أيام عمل', de: '5–7 Werktage', fr: '5–7 jours ouvrés', tr: '5–7 iş günü' },
        'refund_time_dispute': { ar: '١٤ يوم عمل', de: '14 Werktage', fr: '14 jours ouvrés', tr: '14 iş günü' },
        'refund_time_approved': { ar: '٢٤ ساعة', de: '24 Stunden', fr: '24 heures', tr: '24 saat' },
        'refund_dispute': { ar: 'حل النزاعات', de: 'Streitbeilegung', fr: 'Résolution des litiges', tr: 'Anlaşmazlık Çözümü' },
        'refund_dispute_intro': { ar: 'في حال الخلاف، يفصل فريق التحقق بناءً على الأدلة الميدانية.', de: 'Bei Streitigkeiten entscheidet das Verifizierungsteam anhand der Feldnachweise.', fr: 'En cas de litige, l\'équipe de vérification tranche sur la base des preuves terrain.', tr: 'Anlaşmazlık durumunda doğrulama ekibi saha kanıtlarına göre karar verir.' },
        'refund_antifraud': { ar: 'مكافحة الاحتيال', de: 'Betrugsbekämpfung', fr: 'Anti-fraude', tr: 'Dolandırıcılığa Karşı' },
        'refund_antifraud_detail': { ar: 'تُسجَّل جميع المعاملات بطوابع GPS وزمنية لمنع الاحتيال.', de: 'Alle Transaktionen werden mit GPS- und Zeitstempeln zur Betrugsprävention aufgezeichnet.', fr: 'Toutes les transactions sont enregistrées avec horodatages GPS pour prévenir la fraude.', tr: 'Tüm işlemler dolandırıcılığı önlemek için GPS ve zaman damgalarıyla kaydedilir.' },
        'refund_contact': { ar: 'تواصل معنا', de: 'Kontakt', fr: 'Contactez-nous', tr: 'Bize Ulaşın' },
        'refund_contact_detail': { ar: 'لطلبات الاسترداد:', de: 'Für Rückerstattungsanfragen:', fr: 'Pour les demandes de remboursement :', tr: 'İade talepleri için:' },
        'refund_contact_link': { ar: 'صفحة التواصل', de: 'Kontaktseite', fr: 'Page de contact', tr: 'İletişim sayfası' },
        'refund_contact_or': { ar: 'أو أرسل بريداً إلى', de: 'oder eine E-Mail an', fr: 'ou envoyez un e-mail à', tr: 'veya e-posta gönderin' },
        'refund_trust': { ar: 'منصة OCDS — الشفافية المالية في كل معاملة.', de: 'OCDS-Plattform — Finanzielle Transparenz bei jeder Transaktion.', fr: 'Plateforme OCDS — Transparence financière à chaque transaction.', tr: 'OCDS Platformu — Her işlemde finansal şeffaflık.' },

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

        // ═══ HOMEOWNER PORTAL ═══
        'homeowner_portal': { ar: 'بوابة صاحب المنزل', de: 'Hauseigentümer-Portal', fr: 'Portail propriétaire', tr: 'Ev Sahibi Portalı' },
        'homeowner_welcome': { ar: 'مرحباً بك في منزلك الرقمي', de: 'Willkommen in Ihrem digitalen Zuhause', fr: 'Bienvenue dans votre maison numérique', tr: 'Dijital evinize hoş geldiniz' },
        'homeowner_subtitle': { ar: 'تتبع مشاريع الإصلاح والتمويل', de: 'Reparaturprojekte und Finanzierung verfolgen', fr: 'Suivez vos projets de réparation et financement', tr: 'Onarım projelerinizi ve finansmanı takip edin' },
        'homeowner_my_projects': { ar: 'مشاريعي', de: 'Meine Projekte', fr: 'Mes projets', tr: 'Projelerim' },
        'homeowner_active': { ar: 'نشط', de: 'Aktiv', fr: 'Actif', tr: 'Aktif' },
        'homeowner_all_projects': { ar: 'جميع المشاريع', de: 'Alle Projekte', fr: 'Tous les projets', tr: 'Tüm Projeler' },
        'homeowner_new_request': { ar: 'طلب جديد', de: 'Neue Anfrage', fr: 'Nouvelle demande', tr: 'Yeni Talep' },
        'homeowner_report_damage': { ar: 'الإبلاغ عن أضرار', de: 'Schaden melden', fr: 'Signaler des dégâts', tr: 'Hasar Bildir' },
        'homeowner_approvals': { ar: 'الموافقات', de: 'Genehmigungen', fr: 'Approbations', tr: 'Onaylar' },
        'homeowner_pending_approvals': { ar: 'موافقات معلقة', de: 'Ausstehende Genehmigungen', fr: 'Approbations en attente', tr: 'Bekleyen Onaylar' },
        'homeowner_approval_list': { ar: 'قائمة الموافقات', de: 'Genehmigungsliste', fr: 'Liste des approbations', tr: 'Onay Listesi' },
        'homeowner_bids_received': { ar: 'عروض مستلمة', de: 'Erhaltene Angebote', fr: 'Offres reçues', tr: 'Alınan Teklifler' },
        'homeowner_escrow': { ar: 'الضمان', de: 'Treuhand', fr: 'Entiercement', tr: 'Emanet' },
        'homeowner_escrow_overview': { ar: 'نظرة عامة على الضمان', de: 'Treuhandübersicht', fr: 'Aperçu de l\'entiercement', tr: 'Emanet Özeti' },
        'homeowner_payments': { ar: 'المدفوعات', de: 'Zahlungen', fr: 'Paiements', tr: 'Ödemeler' },
        'homeowner_service_requests': { ar: 'طلبات الخدمة', de: 'Serviceanfragen', fr: 'Demandes de service', tr: 'Hizmet Talepleri' },
        'no_projects_yet': { ar: 'لا توجد مشاريع بعد', de: 'Noch keine Projekte', fr: 'Aucun projet pour le moment', tr: 'Henüz proje yok' },

        // ═══ DONOR PORTAL ═══
        'donor_portal': { ar: 'بوابة المانح', de: 'Spenderportal', fr: 'Portail donateur', tr: 'Bağışçı Portalı' },
        'donor_welcome': { ar: 'مرحباً أيها المانح الكريم', de: 'Willkommen, geschätzter Spender', fr: 'Bienvenue, cher donateur', tr: 'Hoş geldiniz, değerli bağışçı' },
        'donor_subtitle': { ar: 'تتبع تبرعاتك وأثرها', de: 'Verfolgen Sie Ihre Spenden und deren Wirkung', fr: 'Suivez vos dons et leur impact', tr: 'Bağışlarınızı ve etkisini takip edin' },
        'donor_marketplace': { ar: 'سوق المشاريع', de: 'Projektmarktplatz', fr: 'Marché des projets', tr: 'Proje Pazarı' },
        'donor_browse': { ar: 'تصفح المشاريع', de: 'Projekte durchsuchen', fr: 'Parcourir les projets', tr: 'Projelere Göz At' },
        'donor_my_impact': { ar: 'أثري', de: 'Meine Wirkung', fr: 'Mon impact', tr: 'Etkilerim' },
        'donor_impact': { ar: 'الأثر', de: 'Wirkung', fr: 'Impact', tr: 'Etki' },
        'donor_impact_details': { ar: 'تفاصيل الأثر', de: 'Wirkungsdetails', fr: 'Détails de l\'impact', tr: 'Etki Detayları' },
        'donor_history': { ar: 'السجل', de: 'Verlauf', fr: 'Historique', tr: 'Geçmiş' },
        'donor_donation_history': { ar: 'سجل التبرعات', de: 'Spendenverlauf', fr: 'Historique des dons', tr: 'Bağış Geçmişi' },
        'donor_proofs': { ar: 'الإثباتات', de: 'Nachweise', fr: 'Preuves', tr: 'Kanıtlar' },
        'donor_proof_gallery': { ar: 'معرض الإثباتات', de: 'Nachweisgalerie', fr: 'Galerie de preuves', tr: 'Kanıt Galerisi' },
        'donor_projects': { ar: 'المشاريع', de: 'Projekte', fr: 'Projets', tr: 'Projeler' },
        'donor_total': { ar: 'الإجمالي', de: 'Gesamt', fr: 'Total', tr: 'Toplam' },
        'donor_items': { ar: 'البنود', de: 'Artikel', fr: 'Articles', tr: 'Kalemler' },
        'donor_score': { ar: 'نقاط الأثر', de: 'Wirkungspunkte', fr: 'Score d\'impact', tr: 'Etki Puanı' },
        'donor_in_escrow': { ar: 'في الضمان (مؤمّن)', de: 'Auf Treuhandkonto (Gesichert)', fr: 'Sous séquestre (Sécurisé)', tr: 'Emanette (Güvende)' },
        'donor_released': { ar: 'تم تحريره للموردين', de: 'An Lieferanten freigegeben', fr: 'Libéré aux fournisseurs', tr: 'Tedarikçilere Serbest Bırakıldı' },
        'donor_go_basket': { ar: 'انتقل إلى السلة', de: 'Zum Warenkorb', fr: 'Aller au panier', tr: 'Sepete Git' },
        'browse_projects': { ar: 'تصفح المشاريع', de: 'Projekte durchsuchen', fr: 'Parcourir les projets', tr: 'Projelere Göz At' },
        'browse_projects_hint': { ar: 'اكتشف مشاريع بحاجة لدعمك', de: 'Entdecken Sie Projekte, die Ihre Unterstützung brauchen', fr: 'Découvrez des projets qui ont besoin de votre soutien', tr: 'Desteğinize ihtiyaç duyan projeleri keşfedin' },
        'confirm_funding': { ar: 'تأكيد التمويل', de: 'Finanzierung bestätigen', fr: 'Confirmer le financement', tr: 'Finansmanı Onayla' },
        'basket_empty': { ar: 'سلتك فارغة', de: 'Ihr Warenkorb ist leer', fr: 'Votre panier est vide', tr: 'Sepetiniz boş' },
        'construction_basket': { ar: 'سلة البناء', de: 'Baukorb', fr: 'Panier de construction', tr: 'İnşaat Sepeti' },

        // ═══ SUPPLIER PORTAL ═══
        'supplier_portal': { ar: 'بوابة المورد', de: 'Lieferantenportal', fr: 'Portail fournisseur', tr: 'Tedarikçi Portalı' },
        'supplier_dashboard': { ar: 'لوحة المورد', de: 'Lieferanten-Dashboard', fr: 'Tableau de bord fournisseur', tr: 'Tedarikçi Paneli' },
        'supplier_access': { ar: 'وصول المورد', de: 'Lieferantenzugang', fr: 'Accès fournisseur', tr: 'Tedarikçi Erişimi' },
        'supplier_my_catalog': { ar: 'كتالوجي', de: 'Mein Katalog', fr: 'Mon catalogue', tr: 'Katalogum' },
        'supplier_catalog': { ar: 'الكتالوج', de: 'Katalog', fr: 'Catalogue', tr: 'Katalog' },
        'supplier_add_material': { ar: 'إضافة مادة', de: 'Material hinzufügen', fr: 'Ajouter un matériau', tr: 'Malzeme Ekle' },
        'supplier_material_desc': { ar: 'وصف المادة', de: 'Materialbeschreibung', fr: 'Description du matériau', tr: 'Malzeme Açıklaması' },
        'supplier_material_requests': { ar: 'طلبات المواد', de: 'Materialanfragen', fr: 'Demandes de matériaux', tr: 'Malzeme Talepleri' },
        'supplier_orders': { ar: 'الطلبات', de: 'Bestellungen', fr: 'Commandes', tr: 'Siparişler' },
        'supplier_payments': { ar: 'المدفوعات', de: 'Zahlungen', fr: 'Paiements', tr: 'Ödemeler' },
        'supplier_pending_bids': { ar: 'عروض معلقة', de: 'Ausstehende Angebote', fr: 'Offres en attente', tr: 'Bekleyen Teklifler' },
        'supplier_won_contracts': { ar: 'عقود مكتسبة', de: 'Gewonnene Verträge', fr: 'Contrats remportés', tr: 'Kazanılan Sözleşmeler' },
        'supplier_total_revenue': { ar: 'إجمالي الإيرادات', de: 'Gesamtumsatz', fr: 'Revenu total', tr: 'Toplam Gelir' },
        'supplier_in_transit': { ar: 'في الطريق', de: 'In Transit', fr: 'En transit', tr: 'Yolda' },

        // ═══ CONTRACTOR PORTAL ═══
        'contractor_portal': { ar: 'بوابة المقاول', de: 'Auftragnehmerportal', fr: 'Portail entrepreneur', tr: 'Müteahhit Portalı' },
        'contractor_access': { ar: 'وصول المقاول', de: 'Auftragnehmerzugang', fr: 'Accès entrepreneur', tr: 'Müteahhit Erişimi' },
        'contractor_welcome': { ar: 'مرحباً أيها المقاول', de: 'Willkommen, Auftragnehmer', fr: 'Bienvenue, entrepreneur', tr: 'Hoş geldiniz, müteahhit' },
        'contractor_subtitle': { ar: 'إدارة المشاريع والعروض', de: 'Projekte und Angebote verwalten', fr: 'Gérer les projets et offres', tr: 'Projeleri ve teklifleri yönetin' },
        'contractor_dashboard_title': { ar: 'لوحة المقاول', de: 'Auftragnehmer-Dashboard', fr: 'Tableau de bord entrepreneur', tr: 'Müteahhit Paneli' },
        'contractor_my_projects': { ar: 'مشاريعي', de: 'Meine Projekte', fr: 'Mes projets', tr: 'Projelerim' },
        'contractor_assigned_projects': { ar: 'المشاريع المسندة', de: 'Zugewiesene Projekte', fr: 'Projets assignés', tr: 'Atanan Projeler' },
        'contractor_active_projects': { ar: 'المشاريع النشطة', de: 'Aktive Projekte', fr: 'Projets actifs', tr: 'Aktif Projeler' },
        'contractor_marketplace': { ar: 'سوق المشاريع', de: 'Projektmarktplatz', fr: 'Marché des projets', tr: 'Proje Pazarı' },
        'contractor_marketplace_title': { ar: 'سوق المناقصات', de: 'Ausschreibungsmarktplatz', fr: 'Marché des appels d\'offres', tr: 'İhale Pazarı' },
        'contractor_my_bids': { ar: 'عروضي', de: 'Meine Angebote', fr: 'Mes offres', tr: 'Tekliflerim' },
        'contractor_pending_bids': { ar: 'عروض معلقة', de: 'Ausstehende Angebote', fr: 'Offres en attente', tr: 'Bekleyen Teklifler' },
        'contractor_won_bids': { ar: 'عروض مقبولة', de: 'Gewonnene Angebote', fr: 'Offres remportées', tr: 'Kazanılan Teklifler' },
        'contractor_bid_history': { ar: 'سجل العروض', de: 'Angebotsverlauf', fr: 'Historique des offres', tr: 'Teklif Geçmişi' },
        'contractor_pending': { ar: 'معلق', de: 'Ausstehend', fr: 'En attente', tr: 'Beklemede' },
        'contractor_payments': { ar: 'المدفوعات', de: 'Zahlungen', fr: 'Paiements', tr: 'Ödemeler' },
        'contractor_payment_history': { ar: 'سجل المدفوعات', de: 'Zahlungsverlauf', fr: 'Historique des paiements', tr: 'Ödeme Geçmişi' },
        'contractor_escrow_total': { ar: 'إجمالي الضمان', de: 'Gesamte Treuhand', fr: 'Total entiercement', tr: 'Toplam Emanet' },
        'contractor_escrow_released': { ar: 'ضمان محرر', de: 'Freigegebene Treuhand', fr: 'Entiercement libéré', tr: 'Serbest Emanet' },
        'contractor_spatial_proofs': { ar: 'الإثباتات المكانية', de: 'Räumliche Nachweise', fr: 'Preuves spatiales', tr: 'Mekansal Kanıtlar' },
        'contractor_proofs_verified': { ar: 'إثباتات معتمدة', de: 'Verifizierte Nachweise', fr: 'Preuves vérifiées', tr: 'Doğrulanmış Kanıtlar' },
        'contractor_proofs_pending': { ar: 'إثباتات معلقة', de: 'Ausstehende Nachweise', fr: 'Preuves en attente', tr: 'Bekleyen Kanıtlar' },
        'contractor_project_timeline': { ar: 'الجدول الزمني', de: 'Projektzeitplan', fr: 'Chronologie du projet', tr: 'Proje Zaman Çizelgesi' },
        'contractor_timeline_desc': { ar: 'تقدم المراحل البنائية', de: 'Fortschritt der Bauphasen', fr: 'Avancement des phases de construction', tr: 'İnşaat aşamaları ilerlemesi' },
        'contractor_th_project': { ar: 'المشروع', de: 'Projekt', fr: 'Projet', tr: 'Proje' },
        'contractor_th_region': { ar: 'المنطقة', de: 'Region', fr: 'Région', tr: 'Bölge' },
        'contractor_th_phase': { ar: 'المرحلة', de: 'Phase', fr: 'Phase', tr: 'Aşama' },
        'contractor_th_progress': { ar: 'التقدم', de: 'Fortschritt', fr: 'Progrès', tr: 'İlerleme' },
        'contractor_th_next_proof': { ar: 'الإثبات التالي', de: 'Nächster Nachweis', fr: 'Prochaine preuve', tr: 'Sonraki Kanıt' },
        'contractor_th_action': { ar: 'إجراء', de: 'Aktion', fr: 'Action', tr: 'İşlem' },
        // PLT-2026-HGH-002: Contractor dashboard dynamic template i18n keys
        'no_assigned_projects': { ar: 'لا توجد مشاريع مسندة بعد', de: 'Noch keine zugewiesenen Projekte', fr: 'Aucun projet assigné pour le moment', tr: 'Henüz atanmış proje yok' },
        'browse_marketplace': { ar: 'تصفح السوق', de: 'Marktplatz durchsuchen', fr: 'Parcourir le marché', tr: 'Pazaryerini Gözat' },
        'no_bids_submitted': { ar: 'لم يتم تقديم عروض بعد', de: 'Noch keine Angebote eingereicht', fr: 'Aucune offre soumise', tr: 'Henüz teklif verilmedi' },

        // ═══ TRADESPERSON PORTAL ═══
        'tradesperson_portal': { ar: 'بوابة الحرفي', de: 'Handwerkerportal', fr: 'Portail artisan', tr: 'Esnaf Portalı' },
        'tradesperson_welcome': { ar: 'مرحباً أيها الحرفي', de: 'Willkommen, Handwerker', fr: 'Bienvenue, artisan', tr: 'Hoş geldiniz, esnaf' },
        'tradesperson_subtitle': { ar: 'إدارة المهام والأرباح', de: 'Aufgaben und Verdienste verwalten', fr: 'Gérer vos tâches et revenus', tr: 'Görevleri ve kazançları yönetin' },
        'tradesperson_jobs': { ar: 'المهام', de: 'Aufträge', fr: 'Tâches', tr: 'İşler' },
        'tradesperson_active_jobs': { ar: 'مهام نشطة', de: 'Aktive Aufträge', fr: 'Tâches actives', tr: 'Aktif İşler' },
        'tradesperson_completed': { ar: 'مكتملة', de: 'Abgeschlossen', fr: 'Terminées', tr: 'Tamamlanan' },
        'tradesperson_assignments': { ar: 'التكليفات', de: 'Zuweisungen', fr: 'Affectations', tr: 'Görevlendirmeler' },
        'tradesperson_assignment_list': { ar: 'قائمة التكليفات', de: 'Zuweisungsliste', fr: 'Liste des affectations', tr: 'Görev Listesi' },
        'tradesperson_available_requests': { ar: 'الطلبات المتاحة', de: 'Verfügbare Anfragen', fr: 'Demandes disponibles', tr: 'Mevcut Talepler' },
        'tradesperson_earnings': { ar: 'الأرباح', de: 'Verdienste', fr: 'Revenus', tr: 'Kazançlar' },
        'tradesperson_total_earnings': { ar: 'إجمالي الأرباح', de: 'Gesamtverdienst', fr: 'Revenus totaux', tr: 'Toplam Kazanç' },
        'tradesperson_earnings_history': { ar: 'سجل الأرباح', de: 'Verdiensthistorie', fr: 'Historique des revenus', tr: 'Kazanç Geçmişi' },
        'tradesperson_my_profile': { ar: 'ملفي الشخصي', de: 'Mein Profil', fr: 'Mon profil', tr: 'Profilim' },
        'tradesperson_rating': { ar: 'التقييم', de: 'Bewertung', fr: 'Évaluation', tr: 'Değerlendirme' },

        // ═══ AUDITOR PORTAL ═══
        'auditor_portal': { ar: 'بوابة المدقق', de: 'Prüferportal', fr: 'Portail auditeur', tr: 'Denetçi Portalı' },
        'auditor_access': { ar: 'وصول المدقق', de: 'Prüferzugang', fr: 'Accès auditeur', tr: 'Denetçi Erişimi' },
        'auditor_dashboard_title': { ar: 'لوحة التدقيق', de: 'Prüfer-Dashboard', fr: 'Tableau de bord auditeur', tr: 'Denetçi Paneli' },
        'auditor_review_queue': { ar: 'قائمة المراجعة', de: 'Prüfwarteschlange', fr: 'File de révision', tr: 'İnceleme Kuyruğu' },
        'auditor_review_desc': { ar: 'معاملات بانتظار التدقيق', de: 'Transaktionen ausstehend zur Prüfung', fr: 'Transactions en attente d\'audit', tr: 'Denetim bekleyen işlemler' },
        'auditor_pending_reviews': { ar: 'مراجعات معلقة', de: 'Ausstehende Prüfungen', fr: 'Examens en attente', tr: 'Bekleyen İncelemeler' },
        'auditor_escrow_reviews': { ar: 'مراجعات الضمان', de: 'Treuhandprüfungen', fr: 'Examens d\'entiercement', tr: 'Emanet İncelemeleri' },
        'auditor_approved_releases': { ar: 'تحريرات معتمدة', de: 'Genehmigte Freigaben', fr: 'Libérations approuvées', tr: 'Onaylanan Serbest Bırakmalar' },
        'auditor_flagged': { ar: 'مُعلَّم', de: 'Markiert', fr: 'Signalé', tr: 'İşaretlendi' },
        'auditor_total_audited': { ar: 'إجمالي المدقق', de: 'Gesamt geprüft', fr: 'Total audité', tr: 'Toplam Denetlenen' },
        'auditor_financial_reports': { ar: 'التقارير المالية', de: 'Finanzberichte', fr: 'Rapports financiers', tr: 'Finansal Raporlar' },
        'auditor_export': { ar: 'تصدير', de: 'Exportieren', fr: 'Exporter', tr: 'Dışa Aktar' },
        'auditor_ocds_compliance': { ar: 'التوافق مع OCDS', de: 'OCDS-Konformität', fr: 'Conformité OCDS', tr: 'OCDS Uyumu' },
        'auditor_ocds_desc': { ar: 'حالة التوافق مع معيار OCDS', de: 'Status der OCDS-Konformität', fr: 'Statut de conformité OCDS', tr: 'OCDS uyumluluk durumu' },
        'auditor_ocds_status': { ar: 'حالة OCDS', de: 'OCDS-Status', fr: 'Statut OCDS', tr: 'OCDS Durumu' },
        'auditor_spatial_accuracy': { ar: 'الدقة المكانية', de: 'Räumliche Genauigkeit', fr: 'Précision spatiale', tr: 'Mekansal Doğruluk' },
        'auditor_spatial_desc': { ar: 'التحقق العالمي من الإثباتات المكانية', de: 'Globale räumliche Nachweisprüfung', fr: 'Vérification spatiale globale des preuves', tr: 'Küresel mekansal kanıt doğrulaması' },
        'auditor_gps_verified': { ar: 'محقق GPS', de: 'GPS-verifiziert', fr: 'Vérifié GPS', tr: 'GPS Doğrulanmış' },
        'auditor_immutable': { ar: 'غير قابل للتغيير', de: 'Unveränderlich', fr: 'Immuable', tr: 'Değiştirilemez' },
        'auditor_no_deletions': { ar: 'لا حذف — لا تعديل', de: 'Keine Löschungen — keine Änderungen', fr: 'Aucune suppression — aucune modification', tr: 'Silme yok — değişiklik yok' },
        'auditor_audit_integrity': { ar: 'نزاهة التدقيق', de: 'Prüfintegrität', fr: 'Intégrité de l\'audit', tr: 'Denetim Bütünlüğü' },
        'auditor_audit_trail': { ar: 'سجل التدقيق', de: 'Prüfpfad', fr: 'Piste d\'audit', tr: 'Denetim İzi' },
        'auditor_footer_desc': { ar: 'سجلات تدقيق ثابتة — لا حذف، لا تعديل، لا تلاعب.', de: 'Unveränderliche Prüfprotokolle — keine Löschungen, keine Änderungen, keine Manipulationen.', fr: 'Journaux d\'audit immuables — aucune suppression, modification ou manipulation.', tr: 'Değiştirilemez denetim günlükleri — silme, değişiklik veya manipülasyon yok.' },
        'auditor_th_ref': { ar: 'المرجع', de: 'Referenz', fr: 'Référence', tr: 'Referans' },
        'auditor_th_project': { ar: 'المشروع', de: 'Projekt', fr: 'Projet', tr: 'Proje' },
        'auditor_th_donor': { ar: 'المانح', de: 'Spender', fr: 'Donateur', tr: 'Bağışçı' },
        'auditor_th_amount': { ar: 'المبلغ', de: 'Betrag', fr: 'Montant', tr: 'Tutar' },
        'auditor_th_proof': { ar: 'الإثبات', de: 'Nachweis', fr: 'Preuve', tr: 'Kanıt' },
        'auditor_th_submitted': { ar: 'تاريخ التقديم', de: 'Eingereicht am', fr: 'Soumis le', tr: 'Gönderim Tarihi' },
        'auditor_th_action': { ar: 'إجراء', de: 'Aktion', fr: 'Action', tr: 'İşlem' },

        // ═══ KYC PAGE ═══
        'kyc_portal_title': { ar: 'التحقق من الهوية', de: 'Identitätsverifizierung', fr: 'Vérification d\'identité', tr: 'Kimlik Doğrulaması' },
        'kyc_review_subtitle': { ar: 'مراجعة طلبات التحقق', de: 'Verifizierungsanträge prüfen', fr: 'Examiner les demandes de vérification', tr: 'Doğrulama başvurularını incele' },
        'kyc_select_applicant': { ar: 'اختر مقدم طلب', de: 'Antragsteller auswählen', fr: 'Sélectionner un demandeur', tr: 'Başvuran seçin' },
        'kyc_pending_review': { ar: 'بانتظار المراجعة', de: 'Prüfung ausstehend', fr: 'En attente d\'examen', tr: 'İnceleme Bekliyor' },
        'kyc_status_pending': { ar: 'معلّق', de: 'Ausstehend', fr: 'En attente', tr: 'Beklemede' },
        'kyc_verified_mtd': { ar: 'تم التحقق هذا الشهر', de: 'Diesen Monat verifiziert', fr: 'Vérifié ce mois', tr: 'Bu ay doğrulanan' },
        'kyc_filter': { ar: 'تصفية', de: 'Filtern', fr: 'Filtrer', tr: 'Filtrele' },
        'kyc_export': { ar: 'تصدير', de: 'Exportieren', fr: 'Exporter', tr: 'Dışa Aktar' },
        'kyc_grant_verified': { ar: 'منح الاعتماد', de: 'Verifiziert bestätigen', fr: 'Accorder la vérification', tr: 'Doğrulama Ver' },
        'kyc_reject_resubmit': { ar: 'رفض وإعادة تقديم', de: 'Ablehnen und Wiedereinreichung', fr: 'Rejeter et resoumettre', tr: 'Reddet ve yeniden gönder' },
        'kyc_click_to_review': { ar: 'اضغط للمراجعة', de: 'Zur Prüfung klicken', fr: 'Cliquer pour examiner', tr: 'İncelemek için tıklayın' },
        'kyc_drag_drop': { ar: 'اسحب وأفلت الملفات', de: 'Dateien hierher ziehen', fr: 'Glissez-déposez les fichiers', tr: 'Dosyaları sürükleyip bırakın' },
        'kyc_click_browse': { ar: 'أو انقر لتصفح', de: 'oder zum Durchsuchen klicken', fr: 'ou cliquer pour parcourir', tr: 'veya tıklayarak göz atın' },
        'kyc_docs_appear_here': { ar: 'ستظهر الوثائق هنا', de: 'Dokumente erscheinen hier', fr: 'Les documents apparaîtront ici', tr: 'Belgeler burada görünecek' },
        'kyc_docs_count_1': { ar: 'وثيقة واحدة', de: '1 Dokument', fr: '1 document', tr: '1 belge' },
        'kyc_docs_count_2': { ar: 'وثيقتان', de: '2 Dokumente', fr: '2 documents', tr: '2 belge' },
        'kyc_docs_count_3': { ar: '٣ وثائق', de: '3 Dokumente', fr: '3 documents', tr: '3 belge' },
        'kyc_institutional_access': { ar: 'الوصول المؤسسي', de: 'Institutioneller Zugang', fr: 'Accès institutionnel', tr: 'Kurumsal Erişim' },
        'confidence_score': { ar: 'درجة الثقة', de: 'Vertrauensbewertung', fr: 'Score de confiance', tr: 'Güven Skoru' },

        // ═══ ESCROW CHECKOUT / PROOF PAGES ═══
        'escrow_breadcrumb': { ar: 'الأمانات', de: 'Treuhand', fr: 'Entiercement', tr: 'Emanet' },
        'escrow_release_verification': { ar: 'التحقق من تحرير الأمانة', de: 'Treuhand-Freigabeprüfung', fr: 'Vérification de libération d\'entiercement', tr: 'Emanet Serbest Bırakma Doğrulaması' },
        'escrow_release_desc': { ar: 'الموافقة على تحرير الأموال بعد التحقق', de: 'Freigabe der Gelder nach Verifizierung genehmigen', fr: 'Approuver la libération des fonds après vérification', tr: 'Doğrulamadan sonra fonların serbest bırakılmasını onayla' },
        'escrow_checkout_disclaimer': { ar: 'جميع الأموال محتجزة في ضمان حتى التسليم المعتمد', de: 'Alle Gelder werden bis zur verifizierten Lieferung treuhänderisch verwahrt', fr: 'Tous les fonds sont séquestrés jusqu\'à livraison vérifiée', tr: 'Tüm fonlar doğrulanmış teslimat yapılana kadar emanette tutulur' },
        'escrow_compliance_footer': { ar: 'متوافق مع OCDS — تدقيق شفاف', de: 'OCDS-konform — Transparente Prüfung', fr: 'Conforme OCDS — Audit transparent', tr: 'OCDS uyumlu — Şeffaf denetim' },
        'funds_locked_escrow': { ar: 'أموال محجوزة في الأمانة', de: 'Gelder in Treuhand gesperrt', fr: 'Fonds bloqués en entiercement', tr: 'Emanette Kilitli Fonlar' },
        'secure_escrow': { ar: 'ضمان آمن', de: 'Sicheres Treuhandkonto', fr: 'Séquestre sécurisé', tr: 'Güvenli Emanet' },
        'secure_escrow_enabled': { ar: 'ضمان آمن مفعّل', de: 'Sicheres Treuhandkonto aktiviert', fr: 'Séquestre sécurisé activé', tr: 'Güvenli Emanet Etkin' },
        'smart_contract_ready': { ar: 'جاهز للعقد الذكي', de: 'Smart-Contract-bereit', fr: 'Prêt pour le contrat intelligent', tr: 'Akıllı Sözleşme Hazır' },
        'blockchain_verified': { ar: 'تم التحقق عبر البلوكتشين', de: 'Blockchain-verifiziert', fr: 'Vérifié par blockchain', tr: 'Blockchain Doğrulanmış' },
        'proof_of_delivery': { ar: 'إثبات التسليم', de: 'Liefernachweis', fr: 'Preuve de livraison', tr: 'Teslimat Kanıtı' },
        'proof_delivery_desc': { ar: 'تحقق ميداني مع طابع GPS', de: 'Feldverifizierung mit GPS-Stempel', fr: 'Vérification terrain avec horodatage GPS', tr: 'GPS damgalı saha doğrulaması' },
        'view_project_progress': { ar: 'عرض تقدم المشروع', de: 'Projektfortschritt anzeigen', fr: 'Voir la progression', tr: 'Proje İlerlemesini Gör' },
        'tax_deductible_receipt': { ar: 'إيصال قابل للخصم الضريبي', de: 'Steuerlich absetzbare Quittung', fr: 'Reçu déductible d\'impôt', tr: 'Vergiden Düşülebilir Makbuz' },
        'gps_stamped_delivery': { ar: 'تحقق التسليم بطابع GPS', de: 'GPS-gestempelte Lieferverifizierung', fr: 'Vérification de livraison GPS', tr: 'GPS damgalı teslimat doğrulaması' },
        'gps_visual_proof': { ar: 'إثبات بصري GPS', de: 'GPS-visueller Nachweis', fr: 'Preuve visuelle GPS', tr: 'GPS görsel kanıt' },
        'live_progress_tracking': { ar: 'تتبع مباشر للتقدم', de: 'Live-Fortschrittsverfolgung', fr: 'Suivi en direct de la progression', tr: 'Canlı İlerleme Takibi' },
        'verified_by_engineer': { ar: 'معتمد من المهندس', de: 'Vom Ingenieur verifiziert', fr: 'Vérifié par l\'ingénieur', tr: 'Mühendis Tarafından Doğrulandı' },
        'verified_by_oracle': { ar: 'معتمد من المؤشر', de: 'Vom Orakel verifiziert', fr: 'Vérifié par l\'oracle', tr: 'Oracle Tarafından Doğrulandı' },
        'verified_status': { ar: 'حالة الاعتماد', de: 'Verifizierungsstatus', fr: 'Statut de vérification', tr: 'Doğrulama Durumu' },
        'verified_list': { ar: 'قائمة معتمدة', de: 'Verifizierte Liste', fr: 'Liste vérifiée', tr: 'Doğrulanmış Liste' },
        'verified_field_engineer': { ar: 'مهندس ميداني معتمد', de: 'Verifizierter Feldingenieur', fr: 'Ingénieur de terrain vérifié', tr: 'Doğrulanmış Saha Mühendisi' },
        'verify_btn': { ar: 'تحقق', de: 'Verifizieren', fr: 'Vérifier', tr: 'Doğrula' },
        'verification_breadcrumb': { ar: 'التحقق', de: 'Verifizierung', fr: 'Vérification', tr: 'Doğrulama' },

        // ═══ PROJECT DETAILS & ENGINEER PAGES ═══
        'project_details': { ar: 'تفاصيل المشروع', de: 'Projektdetails', fr: 'Détails du projet', tr: 'Proje Detayları' },
        'overall_funding': { ar: 'التمويل الإجمالي', de: 'Gesamtfinanzierung', fr: 'Financement global', tr: 'Genel Finansman' },
        'itemized_needs_boq': { ar: 'الاحتياجات المفصلة (جدول الكميات)', de: 'Detaillierte Bedarfe (LV)', fr: 'Besoins détaillés (DQE)', tr: 'Detaylı İhtiyaçlar (BOQ)' },
        'materials_to_fund': { ar: 'مواد تحتاج تمويل', de: 'Zu finanzierende Materialien', fr: 'Matériaux à financer', tr: 'Finanse Edilecek Malzemeler' },
        'total_funding_amount': { ar: 'إجمالي مبلغ التمويل', de: 'Gesamtfinanzierungsbetrag', fr: 'Montant total du financement', tr: 'Toplam Finansman Tutarı' },
        'total_impact_funded': { ar: 'إجمالي التأثير المموّل', de: 'Gesamtfinanzierte Wirkung', fr: 'Impact total financé', tr: 'Toplam Finanse Edilen Etki' },
        'transparency_body': { ar: 'كل معاملة قابلة للتدقيق عبر سجلات OCDS.', de: 'Jede Transaktion ist über OCDS-Protokolle prüfbar.', fr: 'Chaque transaction est auditable via les registres OCDS.', tr: 'Her işlem OCDS kayıtları üzerinden denetlenebilir.' },
        'engineer_boq_builder': { ar: 'منشئ جدول الكميات', de: 'LV-Editor', fr: 'Éditeur DQE', tr: 'BOQ Oluşturucu' },
        'added_materials': { ar: 'المواد المضافة', de: 'Hinzugefügte Materialien', fr: 'Matériaux ajoutés', tr: 'Eklenen Malzemeler' },
        'total_project_estimate': { ar: 'إجمالي تقدير المشروع', de: 'Gesamte Projektschätzung', fr: 'Estimation totale du projet', tr: 'Toplam Proje Tahmini' },
        'site_validation': { ar: 'التحقق الميداني', de: 'Standortvalidierung', fr: 'Validation sur site', tr: 'Saha Doğrulaması' },
        'site_verification': { ar: 'التحقق الميداني', de: 'Standortverifizierung', fr: 'Vérification du site', tr: 'Saha Doğrulaması' },
        'field_photo_proof': { ar: 'إثبات الصور الميدانية', de: 'Fotobeweis vor Ort', fr: 'Preuve photo de terrain', tr: 'Saha Fotoğraf Kanıtı' },
        'voice_snag': { ar: 'ملاحظة صوتية', de: 'Sprachmangel', fr: 'Note vocale', tr: 'Sesli Not' },
        'capture_360_sync': { ar: 'تصوير 360 ومزامنة', de: '360° aufnehmen und synchronisieren', fr: 'Capturer 360 et synchroniser', tr: '360 Çek ve Senkronize Et' },
        'gps_coordinates': { ar: 'إحداثيات GPS', de: 'GPS-Koordinaten', fr: 'Coordonnées GPS', tr: 'GPS Koordinatları' },
        'timestamp_label': { ar: 'الطابع الزمني', de: 'Zeitstempel', fr: 'Horodatage', tr: 'Zaman Damgası' },
        'signature_label': { ar: 'التوقيع', de: 'Unterschrift', fr: 'Signature', tr: 'İmza' },
        'boq': { ar: 'جدول الكميات', de: 'Leistungsverzeichnis', fr: 'Devis quantitatif', tr: 'Metraj' },
        'item_description': { ar: 'وصف البند', de: 'Artikelbeschreibung', fr: 'Description de l\'article', tr: 'Kalem Açıklaması' },
        'items_label': { ar: 'البنود', de: 'Artikel', fr: 'Articles', tr: 'Kalemler' },
        'invoice_label': { ar: 'الفاتورة', de: 'Rechnung', fr: 'Facture', tr: 'Fatura' },
        'invoice_preview': { ar: 'معاينة الفاتورة', de: 'Rechnungsvorschau', fr: 'Aperçu de la facture', tr: 'Fatura Önizleme' },
        'request_id': { ar: 'رقم الطلب', de: 'Anfrage-ID', fr: 'N° de demande', tr: 'Talep Numarası' },
        'request_summary': { ar: 'ملخص الطلب', de: 'Anfragezusammenfassung', fr: 'Résumé de la demande', tr: 'Talep Özeti' },
        'request_submitted': { ar: 'تم تقديم الطلب!', de: 'Anfrage eingereicht!', fr: 'Demande soumise !', tr: 'Talep Gönderildi!' },
        'configure_indices': { ar: 'تكوين المؤشرات', de: 'Indizes konfigurieren', fr: 'Configurer les indices', tr: 'Endeksleri Yapılandır' },
        'approve_adjustment': { ar: 'الموافقة على التعديل', de: 'Anpassung genehmigen', fr: 'Approuver l\'ajustement', tr: 'Düzeltmeyi Onayla' },
        'regional_supply_forecast': { ar: 'توقعات العرض الإقليمي', de: 'Regionale Angebotsprognose', fr: 'Prévision d\'approvisionnement régional', tr: 'Bölgesel Tedarik Tahmini' },
        'steel_index_volatility': { ar: 'تقلب مؤشر الحديد', de: 'Stahlindexvolatilität', fr: 'Volatilité de l\'indice acier', tr: 'Çelik Endeksi Volatilitesi' },
        'total_adjusted_cost': { ar: 'التكلفة المعدّلة الإجمالية', de: 'Gesamte bereinigte Kosten', fr: 'Coût total ajusté', tr: 'Toplam Düzeltilmiş Maliyet' },
        'pricing_oracle_desc': { ar: 'أسعار مواد البناء المحدّثة', de: 'Aktuelle Baumaterialpreise', fr: 'Prix actualisés des matériaux', tr: 'Güncel yapı malzemesi fiyatları' },
        'pricing_oracle_epa': { ar: 'مؤشر EPA', de: 'EPA-Index', fr: 'Indice EPA', tr: 'EPA Endeksi' },
        'live_market': { ar: 'السوق المباشر', de: 'Live-Markt', fr: 'Marché en direct', tr: 'Canlı Piyasa' },
        'material_inflation_curves': { ar: 'منحنيات تضخم المواد', de: 'Materialinflationskurven', fr: 'Courbes d\'inflation des matériaux', tr: 'Malzeme Enflasyon Eğrileri' },
        'oracle_feed_sources': { ar: 'مصادر بيانات المؤشر', de: 'Orakel-Datenquellen', fr: 'Sources de données oracle', tr: 'Oracle Veri Kaynakları' },
        'mean_adjustment': { ar: 'التعديل المتوسط', de: 'Durchschnittliche Anpassung', fr: 'Ajustement moyen', tr: 'Ortalama Düzeltme' },
        'price_index_adjustment': { ar: 'تعديل مؤشر الأسعار', de: 'Preisindexanpassung', fr: 'Ajustement de l\'indice des prix', tr: 'Fiyat Endeksi Düzeltmesi' },
        'original_boq_cost': { ar: 'تكلفة جدول الكميات الأصلي', de: 'Ursprüngliche LV-Kosten', fr: 'Coût DQE original', tr: 'Orijinal BOQ Maliyeti' },
        'fidic_formula': { ar: 'صيغة FIDIC', de: 'FIDIC-Formel', fr: 'Formule FIDIC', tr: 'FIDIC Formülü' },
        'epa_approval_disclaimer': { ar: 'تعديلات الأسعار تخضع لموافقة EPA', de: 'Preisanpassungen unterliegen der EPA-Genehmigung', fr: 'Les ajustements de prix sont soumis à l\'approbation EPA', tr: 'Fiyat düzeltmeleri EPA onayına tabidir' },
        'contribution_onsite': { ar: 'مساهمة في الموقع', de: 'Beitrag vor Ort', fr: 'Contribution sur site', tr: 'Sahada Katkı' },

        // ═══ HOMEOWNER DAMAGE REPORT ═══
        'report_damage': { ar: 'الإبلاغ عن أضرار', de: 'Schaden melden', fr: 'Signaler des dégâts', tr: 'Hasar Bildir' },
        'what_kind_of_damage': { ar: 'ما نوع الضرر؟', de: 'Welche Art von Schaden?', fr: 'Quel type de dégât ?', tr: 'Hasar türü nedir?' },
        'where_is_your': { ar: 'أين يقع منزلك؟', de: 'Wo befindet sich Ihr Haus?', fr: 'Où se trouve votre maison ?', tr: 'Eviniz nerede?' },
        'describe_the_damage': { ar: 'صف الضرر', de: 'Beschreiben Sie den Schaden', fr: 'Décrivez les dégâts', tr: 'Hasarı tanımlayın' },
        'describe_the_damage_clearly_we_ll_conve': { ar: 'صف الضرر بوضوح — سنحوّل كلامك إلى نص', de: 'Beschreiben Sie den Schaden deutlich — wir konvertieren Ihre Sprache in Text', fr: 'Décrivez les dégâts clairement — nous convertirons votre voix en texte', tr: 'Hasarı net tanımlayın — sesinizi metne çevireceğiz' },
        'describe_the_issue_clearly_your_voice_n': { ar: 'صف المشكلة بوضوح — سيتم تحويل ملاحظتك الصوتية إلى نص', de: 'Beschreiben Sie das Problem klar — Ihre Sprachnotiz wird in Text umgewandelt', fr: 'Décrivez le problème clairement — votre note vocale sera convertie en texte', tr: 'Sorunu net açıklayın — sesli notunuz metne dönüştürülecek' },
        'select_the_type_that_best_describes_your': { ar: 'اختر النوع الذي يصف ضررك بأفضل شكل', de: 'Wählen Sie den Typ, der Ihren Schaden am besten beschreibt', fr: 'Sélectionnez le type décrivant le mieux vos dégâts', tr: 'Hasarınızı en iyi tanımlayan türü seçin' },
        'foundations_walls_ceilings_roofing': { ar: 'الأساسات، الجدران، الأسقف، السقف', de: 'Fundamente, Wände, Decken, Dach', fr: 'Fondations, murs, plafonds, toiture', tr: 'Temeller, duvarlar, tavanlar, çatı' },
        'wiring_outlets_panels_and_generators': { ar: 'الأسلاك، المقابس، اللوحات والمولدات', de: 'Verkabelung, Steckdosen, Schalttafeln und Generatoren', fr: 'Câblage, prises, panneaux et générateurs', tr: 'Kablolama, prizler, paneller ve jeneratörler' },
        'pipes_leaks_water_and_drainage_systems': { ar: 'الأنابيب، التسريبات، أنظمة المياه والصرف', de: 'Rohre, Lecks, Wasser- und Abflusssysteme', fr: 'Tuyaux, fuites, systèmes d\'eau et de drainage', tr: 'Borular, sızıntılar, su ve drenaj sistemleri' },
        'doors_windows_finishing_or_other': { ar: 'الأبواب، النوافذ، التشطيبات أو غيرها', de: 'Türen, Fenster, Ausbau oder Sonstiges', fr: 'Portes, fenêtres, finitions ou autres', tr: 'Kapılar, pencereler, biten işler veya diğer' },
        'neighborhood_or_area_name': { ar: 'الحي أو اسم المنطقة', de: 'Stadtviertel oder Ortsname', fr: 'Quartier ou nom de la zone', tr: 'Mahalle veya bölge adı' },
        'we_need_this_to_connect_you_with_nearby': { ar: 'نحتاج هذا لربطك بالخبراء القريبين', de: 'Wir brauchen dies, um Sie mit Experten in der Nähe zu verbinden', fr: 'Nécessaire pour vous connecter aux experts à proximité', tr: 'Sizi yakındaki uzmanlara bağlamak için bu gerekli' },
        'tap_to_upload_photos': { ar: 'اضغط لتحميل الصور', de: 'Tippen zum Hochladen von Fotos', fr: 'Appuyez pour télécharger des photos', tr: 'Fotoğrafları yüklemek için tıklayın' },
        'upload_photos_of_damage_optional': { ar: 'حمّل صور الأضرار (اختياري)', de: 'Fotos der Schäden hochladen (optional)', fr: 'Téléchargez des photos des dégâts (optionnel)', tr: 'Hasar fotoğraflarını yükleyin (isteğe bağlı)' },
        'maximum_5_photos_jpg_or_png': { ar: 'حد أقصى ٥ صور (JPG أو PNG)', de: 'Maximal 5 Fotos (JPG oder PNG)', fr: 'Maximum 5 photos (JPG ou PNG)', tr: 'Maksimum 5 fotoğraf (JPG veya PNG)' },
        'or_tap_to_describe_with_your_voice': { ar: 'أو اضغط للوصف بصوتك', de: 'oder tippen, um per Sprache zu beschreiben', fr: 'ou appuyez pour décrire par la voix', tr: 'veya sesle tanımlamak için dokunun' },
        'type_or_use_voice_to_tell_us_what_happen': { ar: 'اكتب أو استخدم الصوت لإخبارنا ما حدث', de: 'Tippen oder Sprache verwenden, um uns zu erzählen, was passiert ist', fr: 'Tapez ou utilisez la voix pour nous dire ce qui s\'est passé', tr: 'Neler olduğunu bize yazarak veya ses ile anlatın' },
        'gps_timestamp_will_be_auto_embedded': { ar: 'سيتم تضمين الطابعين الزمني والمكاني تلقائياً', de: 'GPS-Zeitstempel wird automatisch eingebettet', fr: 'Horodatage GPS intégré automatiquement', tr: 'GPS zaman damgası otomatik eklenecek' },
        'your_damage_report_has_been_registered': { ar: 'تم تسجيل بلاغ الضرر الخاص بك', de: 'Ihr Schadensbericht wurde registriert', fr: 'Votre rapport de dommages a été enregistré', tr: 'Hasar raporunuz kaydedildi' },
        'listening': { ar: 'جاري الاستماع...', de: 'Hört zu...', fr: 'Écoute en cours...', tr: 'Dinleniyor...' },
        'recording_snag_note': { ar: 'جاري تسجيل الملاحظة...', de: 'Notiz wird aufgenommen...', fr: 'Enregistrement de la note...', tr: 'Not kaydediliyor...' },
        'location_detected': { ar: 'تم رصد الموقع', de: 'Standort erkannt', fr: 'Emplacement détecté', tr: 'Konum tespit edildi' },
        'syncing_to_server': { ar: 'جاري المزامنة مع الخادم...', de: 'Synchronisierung mit Server...', fr: 'Synchronisation avec le serveur...', tr: 'Sunucuya senkronize ediliyor...' },
        'point_camera_at_delivery_site': { ar: 'وجّه الكاميرا نحو موقع التسليم', de: 'Kamera auf den Lieferort richten', fr: 'Dirigez la caméra vers le site de livraison', tr: 'Kamerayı teslimat alanına doğrultun' },
        'of_delivery': { ar: 'من التسليم', de: 'der Lieferung', fr: 'de la livraison', tr: 'teslimatın' },

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

        // ═══ CONTACT FORM ═══
        'contact_form_title': { ar: 'أرسل لنا رسالة', de: 'Senden Sie uns eine Nachricht', fr: 'Envoyez-nous un message', tr: 'Bize Mesaj Gönderin' },
        'contact_name': { ar: 'الاسم الكامل', de: 'Vollständiger Name', fr: 'Nom complet', tr: 'Ad Soyad' },
        'contact_email': { ar: 'البريد الإلكتروني', de: 'E-Mail', fr: 'E-mail', tr: 'E-posta' },
        'contact_subject': { ar: 'الموضوع', de: 'Betreff', fr: 'Sujet', tr: 'Konu' },
        'contact_category': { ar: 'الفئة', de: 'Kategorie', fr: 'Catégorie', tr: 'Kategori' },
        'contact_message': { ar: 'الرسالة', de: 'Nachricht', fr: 'Message', tr: 'Mesaj' },
        'contact_send': { ar: 'إرسال الرسالة', de: 'Nachricht senden', fr: 'Envoyer le message', tr: 'Mesaj Gönder' },
        'contact_cat_general': { ar: 'استفسار عام', de: 'Allgemeine Anfrage', fr: 'Demande générale', tr: 'Genel Sorgu' },
        'contact_cat_escrow': { ar: 'مسائل الضمان', de: 'Treuhandfragen', fr: 'Questions d\'entiercement', tr: 'Emanet Sorunları' },
        'contact_cat_security': { ar: 'تنبيه أمني', de: 'Sicherheitswarnung', fr: 'Alerte de sécurité', tr: 'Güvenlik Uyarısı' },
        'contact_cat_partnership': { ar: 'شراكة', de: 'Partnerschaft', fr: 'Partenariat', tr: 'Ortaklık' },
        'contact_cat_media': { ar: 'إعلام وصحافة', de: 'Medien & Presse', fr: 'Médias & Presse', tr: 'Medya & Basın' },
        'contact_cat_other': { ar: 'أخرى', de: 'Sonstiges', fr: 'Autre', tr: 'Diğer' },

        // ═══ ABOUT US PAGE ═══
        'about_page_title': { ar: 'من نحن', de: 'Über uns', fr: 'À propos', tr: 'Hakkımızda' },
        'about_hero_title': { ar: 'نعيد بناء سوريا، بيتاً بيتاً', de: 'Syrien wieder aufbauen, ein Zuhause nach dem anderen', fr: 'Reconstruire la Syrie, maison par maison', tr: 'Suriye\'yi yeniden inşa ediyoruz, ev ev' },
        'about_hero_subtitle': { ar: 'منصة تقنية غير ربحية مبنية على الشفافية الجذرية، حيث يُتتبع كل دولار، ويُتحقق من كل تسليم عبر GPS، ويُقاس كل أثر بدقة.', de: 'Eine gemeinnützige Technologieplattform, gebaut auf radikaler Transparenz — jeder Dollar wird verfolgt, jede Lieferung GPS-verifiziert, jede Wirkung gemessen.', fr: 'Une plateforme technologique à but non lucratif construite sur la transparence radicale — chaque dollar est suivi, chaque livraison vérifiée par GPS, chaque impact mesuré.', tr: 'Radikal şeffaflık üzerine inşa edilmiş kâr amacı gütmeyen teknoloji platformu — her dolar izlenir, her teslimat GPS ile doğrulanır, her etki ölçülür.' },
        'about_badge_ocds': { ar: 'متوافق مع OCDS', de: 'OCDS-konform', fr: 'Conforme OCDS', tr: 'OCDS Uyumlu' },
        'about_badge_gps': { ar: 'تحقق GPS', de: 'GPS-verifiziert', fr: 'Vérifié GPS', tr: 'GPS Doğrulanmış' },
        'about_badge_escrow': { ar: 'ضمان محمي', de: 'Treuhandgeschützt', fr: 'Séquestre protégé', tr: 'Emanet Korumalı' },

        // ═══ ABOUT: ORIGIN STORY ═══
        'about_origin_title': { ar: 'قصتنا', de: 'Unsere Geschichte', fr: 'Notre histoire', tr: 'Hikayemiz' },
        'about_origin_subtitle': { ar: 'الرحلة التي أوصلتنا إلى هنا', de: 'Die Reise, die uns hierher geführt hat', fr: 'Le voyage qui nous a menés ici', tr: 'Bizi buraya getiren yolculuk' },
        'about_origin_phase1_label': { ar: 'النداء', de: 'Der Ruf', fr: 'L\'appel', tr: 'Çağrı' },
        'about_origin_phase1_title': { ar: 'أبعد من الإغاثة المؤقتة', de: 'Jenseits vorübergehender Hilfe', fr: 'Au-delà de l\'aide temporaire', tr: 'Geçici yardımın ötesinde' },
        'about_origin_phase1_body': { ar: 'لم تولد نمّرها في قاعة مؤتمرات أو من دراسة نظرية بحتة. ولدت من المعاينة الشخصية العميقة لواقع يقول إن الحالة الإنسانية في سوريا كانت تتطلب ما هو أبعد بكثير من الإغاثة المؤقتة وتوزيع المساعدات الاستهلاكية. خلال حضور مؤتمرات التنمية الدولية في الولايات المتحدة الأمريكية، أدرك المؤسسون فجوة هيكلية: مليارات تُنفق على الإغاثة الطارئة، لكن المجتمعات تبقى عاجزة عن إعادة بناء بيوتها. كان النداء واضحاً — ما تحتاجه سوريا ليس التعاطف فحسب، بل التحول الهيكلي والحوكمة الشفافة وإعادة الإعمار الممنهجة.', de: 'Nammerha wurde nicht in einer Konferenzhalle oder durch eine theoretische Studie geboren. Sie entstand aus der tiefen, persönlichen Beobachtung, dass die humanitäre Lage in Syrien weit mehr als vorübergehende Hilfe und Konsumgüterverteilung erfordert. Bei internationalen Entwicklungskonferenzen in den USA erkannten unsere Gründer eine systemische Lücke: Milliarden wurden für Nothilfe ausgegeben, doch Gemeinden konnten ihre eigenen Häuser nicht wieder aufbauen.', fr: 'Nammerha n\'est pas née dans une salle de conférence ni d\'une étude théorique. Elle est née de l\'observation personnelle profonde que la situation humanitaire en Syrie exigeait bien plus que l\'aide temporaire et la distribution de biens de consommation. Lors de conférences internationales de développement aux États-Unis, nos fondateurs ont identifié un fossé systémique.', tr: 'Nammerha bir konferans salonunda ya da teorik bir çalışmayla doğmadı. Suriye\'deki insani durumun geçici yardım ve tüketim malzemesi dağıtımından çok daha fazlasını gerektirdiğinin derin, kişisel gözleminden doğdu.' },
        'about_origin_phase2_label': { ar: 'الفريق', de: 'Das Team', fr: 'L\'équipe', tr: 'Ekip' },
        'about_origin_phase2_title': { ar: 'حيث تلتقي الاستراتيجية بالهندسة', de: 'Wo Strategie auf Ingenieurwesen trifft', fr: 'Là où la stratégie rencontre l\'ingénierie', tr: 'Stratejinin mühendislikle buluştuğu yer' },
        'about_origin_phase2_body': { ar: 'تحويل هذه الرؤية الطموحة إلى واقع تطلب أكثر من النوايا الحسنة. من مناطق ما بعد النزاع في الشرق الأوسط إلى البيئات الهندسية المتقدمة في ألمانيا، تلاقى فريق متنوع يجمع بين خبرات إدارة الأزمات والحوكمة المالية وتصميم المنتجات والهندسة البرمجية. هذا المزيج الفريد من التفكير الاستراتيجي الكلي والتنفيذ التقني الدقيق منح نمّرها القدرة على ترجمة الأهداف الإنسانية المجردة إلى منصات رقمية حية وقابلة للتدقيق.', de: 'Die Umsetzung dieser ehrgeizigen Vision erforderte mehr als gute Absichten. Von Nachkonfliktgebieten im Nahen Osten bis hin zu Ingenieurumgebungen in Deutschland kam ein vielfältiges Team zusammen — mit Expertise in Krisenmanagement, finanzieller Governance, Produktdesign und Software-Engineering.', fr: 'Transformer cette vision ambitieuse en réalité a nécessité plus que de bonnes intentions. Des zones post-conflit du Moyen-Orient aux environnements d\'ingénierie en Allemagne, une équipe diverse s\'est rassemblée.', tr: 'Bu iddialı vizyonu gerçeğe dönüştürmek iyi niyetten fazlasını gerektiriyordu. Orta Doğu\'nun çatışma sonrası bölgelerinden Almanya\'nın mühendislik ortamlarına kadar çeşitli bir ekip bir araya geldi.' },
        'about_origin_phase3_label': { ar: 'النظام المتكامل', de: 'Das Ökosystem', fr: 'L\'écosystème', tr: 'Ekosistem' },
        'about_origin_phase3_title': { ar: 'بناء نظام متكامل', de: 'Ein komplettes Ökosystem aufbauen', fr: 'Construire un écosystème complet', tr: 'Tam bir ekosistem inşa etmek' },
        'about_origin_phase3_body': { ar: 'اليوم، نمّرها لا تُعيد بناء الجدران المتصدعة فحسب ولا توفّر المأوى المؤقت. بل نهندس نظاماً بيئياً متكاملاً — من خلال ابتكار منصة تجمع بين الإدارة المتقدمة للأعمال والتصميم الهندسي، لتصنع أداة موثوقة تولّد أثراً تنموياً مستداماً ومحسوباً بدقة. كل مورد يُستثمر بعناية، كل نتيجة تُوثّق بالأدلة. مساهمتك ليست صدقة تُستهلك وتُنسى — بل هي استثمار في مستقبل مجتمع، عوائده تُقاس بالكرامة المستعادة والحياة المُعاد بناؤها.', de: 'Heute baut Nammerha nicht nur rissige Wände wieder auf oder bietet vorübergehenden Schutz. Wir entwickeln ein vollständiges, integriertes Ökosystem — durch eine innovative Plattform, die fortschrittliches Geschäftsmanagement mit ingenieurtechnischem Design verbindet.', fr: 'Aujourd\'hui, Nammerha ne se contente pas de reconstruire des murs fissurés ou de fournir un abri temporaire. Nous concevons un écosystème complet et intégré — à travers une plateforme innovante.', tr: 'Bugün Nammerha sadece çatlak duvarları onarmıyor ya da geçici barınak sağlamıyor. Yenilikçi bir platform aracılığıyla eksiksiz, entegre bir ekosistem inşa ediyoruz.' },

        // ═══ ABOUT: LEADERSHIP ═══
        'about_leadership_title': { ar: 'القيادة', de: 'Führung', fr: 'Direction', tr: 'Liderlik' },
        'about_leadership_subtitle': { ar: 'حوكمة مؤسسية، لا سلطة شخصية', de: 'Institutionelle Governance, nicht persönliche Autorität', fr: 'Gouvernance institutionnelle, pas autorité personnelle', tr: 'Kurumsal yönetişim, kişisel otorite değil' },
        'about_leader1_name': { ar: 'المؤسس والرئيس التنفيذي', de: 'Gründer & CEO', fr: 'Fondateur & PDG', tr: 'Kurucu & CEO' },
        'about_leader1_role': { ar: 'التوجيه الاستراتيجي والحوكمة', de: 'Strategische Ausrichtung & Governance', fr: 'Direction stratégique & Gouvernance', tr: 'Stratejik Yön & Yönetişim' },
        'about_leader1_bio': { ar: 'ينطلق من قناعة عميقة بأن التغيير الفعلي يتطلب إدارة أزمات، وحوكمة مالية صلبة، وتخطيطاً استراتيجياً بعيد المدى — وليس مجرد نوايا حسنة. من خلال سنوات من دراسة وتحليل العمليات الإنسانية والملاحظات الميدانية وفهم احتياجات أصحاب البيوت المتضررة عن قرب، ساهم في صياغة حلول عملية محورها التكنولوجيا. بخلفية تجمع بين التنمية الدولية وتحليل سلوك المانحين، يقود نمّرها بتركيز على بناء نماذج تمويل مستدامة، وتأسيس شراكات مؤسسية، وتصميم سياسات قادرة على الصمود أمام التحديات الاقتصادية والتشغيلية.', de: 'Angetrieben von der tiefen Überzeugung, dass echter Wandel Krisenmanagement, robuste Finanz-Governance und langfristige strategische Planung erfordert. Durch Jahre der Analyse humanitärer Operationen und Feldbeobachtungen hat er praktische, technologiezentrierte Lösungen mitgestaltet.', fr: 'Porté par la conviction profonde que le vrai changement nécessite une gestion de crise, une gouvernance financière robuste et une planification stratégique à long terme. À travers des années d\'analyse des opérations humanitaires, il a contribué à élaborer des solutions pratiques centrées sur la technologie.', tr: 'Gerçek değişimin kriz yönetimi, sağlam finansal yönetişim ve uzun vadeli stratejik planlama gerektirdiğine dair derin inançla hareket eder. Yıllarca insani operasyonları analiz ederek teknoloji odaklı pratik çözümler geliştirmiştir.' },
        'about_leader1_tag1': { ar: 'إدارة الأزمات', de: 'Krisenmanagement', fr: 'Gestion de crise', tr: 'Kriz Yönetimi' },
        'about_leader1_tag2': { ar: 'الحوكمة المالية', de: 'Finanz-Governance', fr: 'Gouvernance financière', tr: 'Finansal Yönetişim' },
        'about_leader1_tag3': { ar: 'الشراكات المؤسسية', de: 'Institutionelle Partnerschaften', fr: 'Partenariats institutionnels', tr: 'Kurumsal Ortaklıklar' },
        'about_leader2_name': { ar: 'الشريك المؤسس والمدير التقني', de: 'Mitgründer & CTO', fr: 'Cofondateur & CTO', tr: 'Kurucu Ortak & CTO' },
        'about_leader2_role': { ar: 'التنفيذ التقني وهندسة المنتجات', de: 'Technische Umsetzung & Produktentwicklung', fr: 'Exécution technique & Ingénierie produit', tr: 'Teknik Uygulama & Ürün Mühendisliği' },
        'about_leader2_bio': { ar: 'يمثل المحرك التشغيلي والجسر التقني الابتكاري للمنظمة. بخلفية هندسية مهنية صُقلت في ألمانيا، متخصص في تصميم وتطوير المنتجات، يتولى قيادة دورة حياة المشاريع كاملةً — من البحث الأولي والتصور، مروراً بهندسة المنصة وتطوير الأدوات، وصولاً إلى التسليم الميداني وتقييم الأثر. دوره يضمن أن كل رؤية استراتيجية تُترجم إلى عمليات تقنية دقيقة وقابلة للتدقيق والتوسع.', de: 'Repräsentiert den operativen Motor und die innovative technische Brücke der Organisation. Mit einem in Deutschland geformten professionellen Ingenieur-Hintergrund, spezialisiert auf Produktdesign und -entwicklung, leitet er den gesamten Projektlebenszyklus.', fr: 'Représente le moteur opérationnel et le pont technique innovant de l\'organisation. Avec une formation d\'ingénieur forgée en Allemagne, spécialisé dans la conception et le développement de produits, il dirige le cycle de vie complet des projets.', tr: 'Organizasyonun operasyonel motoru ve yenilikçi teknik köprüsünü temsil eder. Almanya\'da şekillenen profesyonel mühendislik geçmişiyle, ürün tasarımı ve geliştirme konusunda uzmanlaşmış olup projelerin tam yaşam döngüsünü yönetir.' },
        'about_leader2_tag1': { ar: 'هندسة المنتجات', de: 'Produktentwicklung', fr: 'Ingénierie produit', tr: 'Ürün Mühendisliği' },
        'about_leader2_tag2': { ar: 'معمارية المنصة', de: 'Plattform-Architektur', fr: 'Architecture plateforme', tr: 'Platform Mimarisi' },
        'about_leader2_tag3': { ar: 'قياس الأثر', de: 'Wirkungsmessung', fr: 'Mesure d\'impact', tr: 'Etki Ölçümü' },

        // ═══ ABOUT: OUR APPROACH ═══
        'about_approach_title': { ar: 'منهجيتنا', de: 'Unser Ansatz', fr: 'Notre approche', tr: 'Yaklaşımımız' },
        'about_approach_subtitle': { ar: 'الشفافية الجذرية وهندسة الأثر', de: 'Radikale Transparenz & konstruierte Wirkung', fr: 'Transparence radicale & Impact ingéniéré', tr: 'Radikal Şeffaflık & Mühendislik Etkisi' },
        'about_pillar1_title': { ar: 'نظرية التغيير', de: 'Theorie des Wandels', fr: 'Théorie du changement', tr: 'Değişim Teorisi' },
        'about_pillar1_body': { ar: 'لا نعتمد نماذج المنطق الخطي المبسطة. تخطيطنا الاستراتيجي يسترشد بإطار عمل شامل لـ«نظرية التغيير» يتعمق في فهم السياقات الاجتماعية والاقتصادية والبيئية المتشابكة في بيئات ما بعد النزاع — لضمان أن كل نشاط يُسهم في مسار واضح نحو تحوّل جذري ومستدام.', de: 'Wir verwenden keine vereinfachten linearen Logikmodelle. Unsere strategische Planung wird von einem umfassenden Theory-of-Change-Rahmenwerk geleitet, das die verflochtenen sozialen, wirtschaftlichen und ökologischen Kontexte von Nachkonfliktsituationen tiefgehend versteht.', fr: 'Nous n\'adoptons pas de modèles logiques linéaires simplistes. Notre planification stratégique est guidée par un cadre complet de Théorie du changement qui comprend en profondeur les contextes sociaux, économiques et environnementaux interconnectés des environnements post-conflit.', tr: 'Basitleştirilmiş doğrusal mantık modelleri kullanmıyoruz. Stratejik planımız, çatışma sonrası ortamların iç içe geçmiş sosyal, ekonomik ve çevresel bağlamlarını derinlemesine anlayan kapsamlı bir Değişim Teorisi çerçevesiyle yönlendirilir.' },
        'about_pillar2_title': { ar: 'الشفافية كخدمة (TaaS)', de: 'Transparenz als Service (TaaS)', fr: 'Transparence en tant que Service (TaaS)', tr: 'Hizmet Olarak Şeffaflık (TaaS)' },
        'about_pillar2_body': { ar: 'استجابةً لأعلى المعايير العالمية في القطاع الخيري، هندسنا بنيتنا التقنية لتكون شفافة بالتصميم — متوافقة مع معيار بيانات التعاقد المفتوح (OCDS). هذا يتيح لشركائنا والمانحين إجراء تدقيق فوري في كل عقد ومشتريات وتدفق مالي منذ اليوم الأول. نتجاوز مفهوم التقارير الدورية — الشفافية مدمجة كخدمة مؤسسية.', de: 'Als Antwort auf die höchsten globalen Standards im Wohltätigkeitssektor haben wir unsere technische Infrastruktur nativ transparent gestaltet — konform mit dem Open Contracting Data Standard (OCDS). Dies ermöglicht unseren Partnern und Spendern eine Echtzeitprüfung.', fr: 'Répondant aux normes mondiales les plus élevées du secteur caritatif, nous avons conçu notre infrastructure technique pour être nativement transparente — conforme au Standard de Données Ouvertes (OCDS). Cela permet un audit en temps réel.', tr: 'Hayır sektöründeki en yüksek küresel standartlara cevaben, teknik altyapımızı doğal olarak şeffaf olacak şekilde tasarladık — Açık İhale Veri Standardı (OCDS) ile uyumlu.' },
        'about_pillar3_title': { ar: 'نموذج الاستدامة الهجين', de: 'Hybrides Nachhaltigkeitsmodell', fr: 'Modèle de durabilité hybride', tr: 'Hibrit Sürdürülebilirlik Modeli' },
        'about_pillar3_body': { ar: 'نؤمن أن المهمة الإنسانية يجب ألا تعتمد على مصدر تمويل واحد. نموذجنا الهجين يدمج اشتراكات السوق الرقمي، وعمولات تجارية مراعية للنزاعات، وإكراميات المتبرعين الطوعية — وجميعها تعمل كأذرع مالية مستقلة تُديم المنصة بينما تبقى أموال التبرعات الخيرية مقدسة وغير ممسوسة بنسبة 100%.', de: 'Wir glauben, dass die humanitäre Mission nicht von einer einzigen Finanzierungsquelle abhängen sollte. Unser hybrides Modell integriert SaaS-Marktplatzabonnements, konfliktsensible kommerzielle Provisionen und freiwillige Spendertipps.', fr: 'Nous croyons que la mission humanitaire ne doit pas dépendre d\'une seule source de financement. Notre modèle hybride intègre des abonnements SaaS, des commissions commerciales sensibles aux conflits et des pourboires volontaires des donateurs.', tr: 'İnsani misyonun tek bir finansman kaynağına bağlı olmaması gerektiğine inanıyoruz. Hibrit modelimiz SaaS pazar abonelikleri, çatışma duyarlı ticari komisyonlar ve gönüllü bağışçı bahşişlerini entegre eder.' },
        'about_pillar4_title': { ar: 'إطار المساءلة (MEAL)', de: 'MEAL-Rahmenwerk', fr: 'Cadre MEAL', tr: 'MEAL Çerçevesi' },
        'about_pillar4_body': { ar: 'ننشر نظام مراقبة وتقييم ومساءلة وتعلّم (MEAL) صارماً يتجاوز إحصاء المخرجات. باستخدام خوارزميات تسجيل متقدمة وقواعد منطقية، يُقيّم إطار MEAL لدينا جودة الأثر الإنساني — قياس التغيير على مستوى المجتمع، وليس مجرد إحصاءات التسليم. مسارنا التشغيلي مصمم للامتثال التام لمتطلبات ما بعد العقوبات الديناميكية.', de: 'Wir setzen ein striktes Monitoring-, Evaluierungs-, Accountability- und Lernrahmenwerk (MEAL) ein, das über das Zählen von Ergebnissen hinausgeht. Mit fortschrittlichen Bewertungsalgorithmen misst unser MEAL-Rahmenwerk die Qualität der humanitären Wirkung.', fr: 'Nous déployons un cadre rigoureux de Suivi, Évaluation, Redevabilité et Apprentissage (MEAL) qui va au-delà du comptage des résultats. Avec des algorithmes de notation avancés, notre cadre mesure la qualité de l\'impact humanitaire.', tr: 'Çıktıları saymaktan öteye giden katı bir İzleme, Değerlendirme, Hesap Verebilirlik ve Öğrenme (MEAL) çerçevesi kullanıyoruz. Gelişmiş puanlama algoritmaları ile insani etkinin kalitesini ölçüyoruz.' },

        // ═══ ABOUT: TRUST & COMPLIANCE ═══
        'about_trust_title': { ar: 'الثقة والامتثال', de: 'Vertrauen & Compliance', fr: 'Confiance & Conformité', tr: 'Güven & Uyumluluk' },
        'about_stat_transparency': { ar: 'شفافية مالية', de: 'Finanzielle Transparenz', fr: 'Transparence financière', tr: 'Finansal Şeffaflık' },
        'about_stat_gps': { ar: 'تسليمات موثقة', de: 'Verifizierte Lieferungen', fr: 'Livraisons vérifiées', tr: 'Doğrulanmış Teslimatlar' },
        'about_stat_ocds': { ar: 'معيار البيانات', de: 'Datenstandard', fr: 'Standard de données', tr: 'Veri Standardı' },
        'about_stat_fees': { ar: 'رسوم تبرع', de: 'Spendengebühren', fr: 'Frais de don', tr: 'Bağış Ücreti' },
        'about_trust_body': { ar: 'مسارنا التشغيلي مصمم تقنياً وتشريعياً للامتثال التام مع متطلبات الامتثال لما بعد العقوبات الديناميكية والقوانين الدولية المنظمة للعمليات المالية — لضمان استمرارية الأعمال وحماية الشركاء والمانحين من أي مخاطر قانونية أو سمعية.', de: 'Unser operativer Weg ist technisch und rechtlich für die volle Einhaltung der dynamischen Post-Sanktions-Compliance und internationaler Finanzvorschriften konzipiert — zum Schutz aller Beteiligten.', fr: 'Notre parcours opérationnel est conçu techniquement et juridiquement pour une conformité totale avec les exigences post-sanctions dynamiques et les réglementations financières internationales.', tr: 'Operasyonel yolumuz, dinamik yaptırım sonrası uyumluluk ve uluslararası mali düzenlemelere tam uyum için teknik ve yasal olarak tasarlanmıştır.' },

        // ═══ ABOUT: CALL TO ACTION ═══
        'about_cta_title': { ar: 'رؤيتك في بناء عالم أكثر أماناً تبدأ من هنا', de: 'Ihre Vision einer sichereren Welt beginnt hier', fr: 'Votre vision d\'un monde plus sûr commence ici', tr: 'Daha güvenli bir dünya vizyonunuz burada başlıyor' },
        'about_cta_body': { ar: 'لأن مجتمعات تحمّلت الدمار بأكمله تستحق أكثر من التعاطف — تستحق شريكاً يحوّل سخاءك إلى تغيير دائم وقابل للقياس. نحن نوفر الأدوات. أنت تصنع الأثر.', de: 'Weil Gemeinschaften, die Zerstörung ertragen haben, mehr als Mitgefühl verdienen — sie verdienen jemanden, der Ihre Großzügigkeit in messbaren, dauerhaften Wandel verwandelt.', fr: 'Parce que les communautés qui ont enduré la destruction méritent plus que de la sympathie — elles méritent un partenaire qui transforme votre générosité en changement mesurable et permanent.', tr: 'Çünkü yıkıma katlanan topluluklar sempetiden fazlasını hak ediyor — cömertliğinizi ölçülebilir, kalıcı değişime dönüştüren bir ortağı hak ediyor.' },
        'about_cta_btn': { ar: 'موّل مشروعاً الآن', de: 'Jetzt ein Projekt finanzieren', fr: 'Financer un projet maintenant', tr: 'Şimdi bir proje finanse edin' },
        'about_cta_contact': { ar: 'تواصل معنا', de: 'Kontakt', fr: 'Contactez-nous', tr: 'Bize Ulaşın' },
        'about_cta_pricing': { ar: 'خطط الشراكة', de: 'Partnerschaftspläne', fr: 'Plans de partenariat', tr: 'Ortaklık Planları' },
        'about_footer_copy': { ar: '© ٢٠٢٥ نمّرها. منصة إعادة إعمار متوافقة مع OCDS.', de: '© 2025 Nammerha. OCDS-konforme Wiederaufbauplattform.', fr: '© 2025 Nammerha. Plateforme de reconstruction conforme OCDS.', tr: '© 2025 Nammerha. OCDS uyumlu yeniden yapım platformu.' },

        // ═══ MATERIAL CATEGORIES (Supplier Catalog) ═══
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

        // ═══ UNITS ═══
        'unit_ton': { ar: 'طن', de: 'Tonne', fr: 'Tonne', tr: 'Ton' },
        'unit_piece': { ar: 'قطعة', de: 'Stück', fr: 'Pièce', tr: 'Adet' },
        'unit_box': { ar: 'صندوق', de: 'Karton', fr: 'Boîte', tr: 'Kutu' },
        'unit_roll': { ar: 'لفة', de: 'Rolle', fr: 'Rouleau', tr: 'Rulo' },
        'unit_liter': { ar: 'لتر', de: 'Liter', fr: 'Litre', tr: 'Litre' },

        // ═══ CONTRACTOR TABLE HEADERS ═══
        'contractor_th_proposed_cost': { ar: 'التكلفة المقترحة', de: 'Vorgeschlagene Kosten', fr: 'Coût proposé', tr: 'Teklif Edilen Maliyet' },
        'contractor_th_status': { ar: 'الحالة', de: 'Status', fr: 'Statut', tr: 'Durum' },
        'contractor_th_submitted': { ar: 'تاريخ التقديم', de: 'Eingereicht am', fr: 'Soumis le', tr: 'Gönderim Tarihi' },
        'contractor_th_timeline': { ar: 'الجدول الزمني', de: 'Zeitplan', fr: 'Calendrier', tr: 'Zaman Çizelgesi' },

        // ═══ SUPPLIER MODAL FIELDS ═══
        'supplier_add_to_catalog': { ar: 'إضافة إلى الكتالوج', de: 'Zum Katalog hinzufügen', fr: 'Ajouter au catalogue', tr: 'Kataloğa Ekle' },
        'supplier_catalog_desc': { ar: 'إدارة مواد البناء الخاصة بك', de: 'Ihre Baumaterialien verwalten', fr: 'Gérez vos matériaux de construction', tr: 'Yapı malzemelerinizi yönetin' },
        'supplier_material_name': { ar: 'اسم المادة', de: 'Materialname', fr: 'Nom du matériau', tr: 'Malzeme Adı' },
        'supplier_category_label': { ar: 'الفئة', de: 'Kategorie', fr: 'Catégorie', tr: 'Kategori' },
        'supplier_unit_label': { ar: 'الوحدة', de: 'Einheit', fr: 'Unité', tr: 'Birim' },
        'supplier_guide_price': { ar: 'السعر التوجيهي ($)', de: 'Richtpreis ($)', fr: 'Prix indicatif ($)', tr: 'Yönlendirici Fiyat ($)' },
        'supplier_min_order': { ar: 'الحد الأدنى للطلب', de: 'Mindestbestellmenge', fr: 'Commande minimum', tr: 'Minimum Sipariş' },
        'supplier_lead_time': { ar: 'مدة التسليم (أيام)', de: 'Lieferzeit (Tage)', fr: 'Délai de livraison (jours)', tr: 'Teslimat Süresi (gün)' },
        'supplier_desc_optional': { ar: 'الوصف (اختياري)', de: 'Beschreibung (optional)', fr: 'Description (optionnel)', tr: 'Açıklama (isteğe bağlı)' },
        'supplier_modal_guide_price_info': { ar: 'سيقوم نظام EPA بضبط السعر حسب ظروف السوق', de: 'Das EPA-System passt den Preis an die Marktbedingungen an', fr: 'Le système EPA ajustera le prix selon les conditions du marché', tr: 'EPA sistemi fiyatı piyasa koşullarına göre ayarlayacaktır' },

        // ═══ HOMEOWNER FORM ELEMENTS ═══
        'select_damage_type': { ar: 'اختر نوع الضرر', de: 'Schadensart auswählen', fr: 'Sélectionner le type de dégât', tr: 'Hasar türünü seçin' },
        'select_governorate': { ar: 'اختر المحافظة', de: 'Gouvernement auswählen', fr: 'Sélectionner le gouvernorat', tr: 'İl seçin' },
        'detect_location_auto': { ar: 'كشف الموقع تلقائياً', de: 'Standort automatisch erkennen', fr: 'Détecter l\'emplacement automatiquement', tr: 'Konumu otomatik algıla' },

        // ═══ WALLET PAGE (FIX-001) ═══
        'wallet_locked': { ar: 'محجوز', de: 'gesperrt', fr: 'verrouillé', tr: 'kilitli' },
        'wallet_released': { ar: 'محرّر', de: 'freigegeben', fr: 'libéré', tr: 'serbest' },
        'wallet_status_locked': { ar: 'محجوز', de: 'Gesperrt', fr: 'Verrouillé', tr: 'Kilitli' },
        'wallet_status_released': { ar: 'محرّر', de: 'Freigegeben', fr: 'Libéré', tr: 'Serbest' },
        'wallet_status_refunded': { ar: 'مُستردّ', de: 'Erstattet', fr: 'Remboursé', tr: 'İade Edildi' },
        'wallet_status_completed': { ar: 'مكتمل', de: 'Abgeschlossen', fr: 'Terminé', tr: 'Tamamlandı' },
        'wallet_status_pending': { ar: 'معلّق', de: 'Ausstehend', fr: 'En attente', tr: 'Beklemede' },
        'wallet_transaction': { ar: 'معاملة', de: 'Transaktion', fr: 'Transaction', tr: 'İşlem' },
        'wallet_no_transactions': { ar: 'لا توجد معاملات بعد', de: 'Noch keine Transaktionen', fr: 'Aucune transaction pour le moment', tr: 'Henüz işlem yok' },
        'wallet_history_description': { ar: 'سيظهر سجل تبرعاتك ومدفوعاتك هنا', de: 'Ihr Spenden- und Zahlungsverlauf erscheint hier', fr: 'Votre historique de dons et paiements apparaîtra ici', tr: 'Bağış ve ödeme geçmişiniz burada görünecek' },
        'wallet_load_failed': { ar: 'تعذّر تحميل المعاملات. يرجى تسجيل الدخول.', de: 'Transaktionen konnten nicht geladen werden. Bitte melden Sie sich an.', fr: 'Impossible de charger les transactions. Veuillez vous connecter.', tr: 'İşlemler yüklenemedi. Lütfen giriş yapın.' },
        'wallet_sign_in': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Se connecter', tr: 'Giriş Yap' },

        // ═══ DONOR BASKET (FIX-002) ═══
        'basket_decrease_qty': { ar: 'تقليل الكمية', de: 'Menge verringern', fr: 'Diminuer la quantité', tr: 'Miktarı azalt' },
        'basket_increase_qty': { ar: 'زيادة الكمية', de: 'Menge erhöhen', fr: 'Augmenter la quantité', tr: 'Miktarı artır' },
        'basket_per_unit': { ar: 'للقطعة', de: 'Stk.', fr: 'pièce', tr: 'adet' },
        'basket_checkout_msg': { ar: 'جاري التوجه للدفع الآمن', de: 'Weiter zur sicheren Kasse', fr: 'Passage à la caisse sécurisée', tr: 'Güvenli ödemeye ilerleniyor' },
        'basket_items': { ar: 'عناصر', de: 'Artikel', fr: 'articles', tr: 'öğe' },
        'basket_gateway_soon': { ar: 'بوابة الدفع قريباً.', de: 'Zahlungs-Gateway kommt bald.', fr: 'Passerelle de paiement bientôt disponible.', tr: 'Ödeme ağ geçidi yakında.' },

        // ═══ AUDIT REMEDIATION — ENGINEER BOQ ═══
        'boq_items': { ar: 'بنود', de: 'Posten', fr: 'Articles', tr: 'Kalemler' },
        'boq_oracle': { ar: 'المؤشر', de: 'Orakel', fr: 'Oracle', tr: 'Oracle' },
        'boq_no_oracle_price': { ar: 'لا يوجد سعر مرجعي', de: 'Kein Orakelpreis', fr: 'Pas de prix oracle', tr: 'Oracle fiyatı yok' },
        'boq_estimated': { ar: 'مُقدّر', de: 'Geschätzt', fr: 'Estimé', tr: 'Tahmini' },
        'boq_no_materials': { ar: 'لم تُضف مواد بعد', de: 'Noch keine Materialien hinzugefügt', fr: 'Aucun matériau ajouté', tr: 'Henüz malzeme eklenmedi' },
        'boq_search_hint': { ar: 'ابحث عن مواد أعلاه لبناء جدول الكميات', de: 'Oben nach Materialien suchen, um Ihr LV zu erstellen', fr: 'Rechercher des matériaux ci-dessus pour construire votre DQE', tr: 'BOQ\'nuzu oluşturmak için yukarıdan malzeme arayın' },
        'boq_publishing': { ar: 'جاري النشر...', de: 'Wird veröffentlicht...', fr: 'Publication...', tr: 'Yayınlanıyor...' },
        'boq_published': { ar: 'تم النشر!', de: 'Veröffentlicht!', fr: 'Publié !', tr: 'Yayınlandı!' },
        'boq_publish_failed': { ar: 'فشل النشر', de: 'Veröffentlichung fehlgeschlagen', fr: 'Échec de la publication', tr: 'Yayınlama başarısız' },
        'boq_publish_to_marketplace': { ar: 'نشر في السوق', de: 'Auf dem Marktplatz veröffentlichen', fr: 'Publier sur le marché', tr: 'Pazaryerine Yayınla' },

        // ═══ AUDIT REMEDIATION — ENGINEER CAMERA ═══
        'cam_gps_unavailable': { ar: 'GPS غير متاح', de: 'GPS nicht verfügbar', fr: 'GPS indisponible', tr: 'GPS kullanılamıyor' },
        'cam_accuracy': { ar: 'الدقة', de: 'Genauigkeit', fr: 'Précision', tr: 'Doğruluk' },
        'cam_gps_denied': { ar: 'تم رفض إذن GPS', de: 'GPS-Berechtigung verweigert', fr: 'Permission GPS refusée', tr: 'GPS izni reddedildi' },
        'cam_gps_fallback': { ar: 'GPS: وضع بديل', de: 'GPS: Fallback-Modus', fr: 'GPS : Mode de secours', tr: 'GPS: Yedek Mod' },
        'cam_max_captures': { ar: 'الحد الأقصى 8 لقطات لكل جلسة. أرسل إثباتاتك.', de: 'Maximal 8 Aufnahmen pro Sitzung. Reichen Sie Ihre Nachweise ein.', fr: 'Maximum 8 captures par session. Soumettez vos preuves.', tr: 'Oturum başına maksimum 8 çekim. Kanıtlarınızı gönderin.' },
        'cam_captured': { ar: 'تم الالتقاط', de: 'Aufgenommen', fr: 'Capturé', tr: 'Çekildi' },
        'cam_capture_360': { ar: 'تصوير 360 ومزامنة', de: '360° aufnehmen & synchronisieren', fr: 'Capturer 360 & Synchroniser', tr: '360 Çek & Senkronize Et' },
        'cam_no_captures': { ar: 'لا توجد لقطات للمزامنة. التقط صوراً أولاً.', de: 'Keine Aufnahmen zum Synchronisieren. Nehmen Sie zuerst Fotos auf.', fr: 'Pas de captures à synchroniser. Capturez d\'abord des photos.', tr: 'Senkronize edilecek çekim yok. Önce fotoğraf çekin.' },
        'cam_no_project': { ar: 'لم يتم اختيار مشروع. انتقل من لوحة المتابعة.', de: 'Kein Projekt ausgewählt. Navigieren Sie vom Dashboard.', fr: 'Aucun projet sélectionné. Naviguez depuis le tableau de bord.', tr: 'Proje seçilmedi. Kontrol panelinden gidin.' },
        'cam_gps_required': { ar: 'إحداثيات GPS مطلوبة. يرجى تفعيل خدمات الموقع.', de: 'GPS-Koordinaten erforderlich. Bitte aktivieren Sie die Standortdienste.', fr: 'Coordonnées GPS requises. Veuillez activer les services de localisation.', tr: 'GPS koordinatları gerekli. Lütfen konum servislerini etkinleştirin.' },
        'cam_uploading': { ar: 'جاري الرفع...', de: 'Wird hochgeladen...', fr: 'Téléchargement...', tr: 'Yükleniyor...' },
        'cam_proofs_synced': { ar: 'إثبات(ات) تمت مزامنتها', de: 'Nachweis(e) synchronisiert', fr: 'Preuve(s) synchronisée(s)', tr: 'Kanıt(lar) senkronize edildi' },
        'cam_proofs_submitted': { ar: 'إثبات(ات) مكانية أُرسلت للتحقق', de: 'Räumliche(r) Nachweis(e) zur Verifizierung eingereicht', fr: 'Preuve(s) spatiale(s) soumise(s) pour vérification', tr: 'Mekansal kanıt(lar) doğrulama için gönderildi' },
        'cam_sync_failed': { ar: 'فشلت المزامنة', de: 'Synchronisierung fehlgeschlagen', fr: 'Échec de la synchronisation', tr: 'Senkronizasyon başarısız' },
        'cam_sync_to_server': { ar: 'مزامنة مع الخادم', de: 'Zum Server synchronisieren', fr: 'Synchroniser avec le serveur', tr: 'Sunucuya Senkronize Et' },
        'cam_snag_saved': { ar: 'تم حفظ ملاحظة الخلل', de: 'Mängelnotiz gespeichert', fr: 'Note de réserve enregistrée', tr: 'Arıza notu kaydedildi' },

        // ═══ AUDIT REMEDIATION — HOMEOWNER REPORT ═══
        'hr_step': { ar: 'الخطوة', de: 'Schritt', fr: 'Étape', tr: 'Adım' },
        'hr_of': { ar: 'من', de: 'von', fr: 'sur', tr: '/' },
        'hr_submit_request': { ar: 'إرسال الطلب', de: 'Anfrage einreichen', fr: 'Soumettre la demande', tr: 'Talep Gönder' },
        'hr_done': { ar: 'تم!', de: 'Fertig!', fr: 'Terminé !', tr: 'Tamamlandı!' },
        'hr_next_step': { ar: 'الخطوة التالية', de: 'Nächster Schritt', fr: 'Étape suivante', tr: 'Sonraki Adım' },
        'hr_select_damage': { ar: 'اختر نوع الأضرار', de: 'Schadensart auswählen', fr: 'Sélectionner le type de dommage', tr: 'Hasar türünü seçin' },
        'hr_enter_location': { ar: 'أدخل تفاصيل الموقع', de: 'Standortdetails eingeben', fr: 'Entrer les détails de l\'emplacement', tr: 'Konum detaylarını girin' },
        'hr_submitting': { ar: 'جاري الإرسال...', de: 'Wird eingereicht...', fr: 'Soumission...', tr: 'Gönderiliyor...' },
        'hr_submission_failed': { ar: 'فشل الإرسال', de: 'Einreichung fehlgeschlagen', fr: 'Échec de la soumission', tr: 'Gönderim başarısız' },
        'hr_geo_not_supported': { ar: 'تحديد الموقع غير مدعوم', de: 'Geolokalisierung nicht unterstützt', fr: 'Géolocalisation non prise en charge', tr: 'Konum belirleme desteklenmiyor' },
        'hr_detecting': { ar: 'جاري الكشف...', de: 'Wird erkannt...', fr: 'Détection...', tr: 'Algılanıyor...' },
        'hr_location_detected': { ar: 'تم كشف الموقع', de: 'Standort erkannt', fr: 'Emplacement détecté', tr: 'Konum algılandı' },
        'hr_location_fallback': { ar: 'تعذّر الكشف — أدخل يدوياً', de: 'Nicht erkannt — manuell eingeben', fr: 'Détection impossible — saisie manuelle', tr: 'Algılanamadı — manuel girin' },

        // ═══ AUDIT REMEDIATION — ADMIN ESCROW ═══
        'esc_release_funds': { ar: 'تم التحقق: تحرير الأموال للمورد', de: 'Übereinstimmung geprüft: Gelder an Lieferant freigeben', fr: 'Correspondance vérifiée : Libérer les fonds au fournisseur', tr: 'Eşleşme Doğrulandı: Fonları Tedarikçiye Serbest Bırak' },
        'esc_flag_discrepancy': { ar: 'الإبلاغ عن تناقض', de: 'Abweichung melden', fr: 'Signaler un écart', tr: 'Uyuşmazlık Bildir' },
        'esc_funds_released': { ar: '✓ تم تحرير الأموال — سجل التدقيق مُحدَّث', de: '✓ Gelder freigegeben — Prüfpfad aktualisiert', fr: '✓ Fonds libérés — Piste d\'audit mise à jour', tr: '✓ Fonlar Serbest — Denetim İzi Güncellendi' },
        'esc_discrepancy_flagged': { ar: '⚠ تم الإبلاغ عن تناقض', de: '⚠ Abweichung gemeldet', fr: '⚠ Écart signalé', tr: '⚠ Uyuşmazlık Bildirildi' },

        // ═══ AUDIT REMEDIATION — ADMIN KYC ═══
        'kyc_verified': { ar: '✓ معتمد', de: '✓ Verifiziert', fr: '✓ Vérifié', tr: '✓ Doğrulandı' },
        'kyc_rejected': { ar: '✗ مرفوض', de: '✗ Abgelehnt', fr: '✗ Rejeté', tr: '✗ Reddedildi' },

        // ═══ AUDIT REMEDIATION — ADMIN ORACLE ═══
        'oracle_approved': { ar: 'مُعتمد', de: 'Genehmigt', fr: 'Approuvé', tr: 'Onaylandı' },

        // ═══ AUDIT REMEDIATION — TRADESPERSON PORTAL ═══
        'tp_accepting': { ar: 'جاري القبول...', de: 'Wird angenommen...', fr: 'Acceptation...', tr: 'Kabul ediliyor...' },
        'tp_accepted': { ar: '✓ تم القبول', de: '✓ Angenommen', fr: '✓ Accepté', tr: '✓ Kabul Edildi' },

        // ═══ AUDIT REMEDIATION — CONTRACTOR PORTAL ═══
        'ct_no_assigned_projects': { ar: 'لا توجد مشاريع مسندة بعد', de: 'Noch keine zugewiesenen Projekte', fr: 'Aucun projet assigné', tr: 'Henüz atanmış proje yok' },
        'ct_browse_marketplace': { ar: 'تصفح السوق وقدّم عروضاً', de: 'Marktplatz durchsuchen und Angebote einreichen', fr: 'Parcourir le marché et soumettre des offres', tr: 'Pazaryerine göz atın ve teklif verin' },
        'ct_no_projects_available': { ar: 'لا مشاريع متاحة', de: 'Keine Projekte verfügbar', fr: 'Aucun projet disponible', tr: 'Mevcut proje yok' },
        'ct_new_projects_appear': { ar: 'ستظهر المشاريع الجديدة هنا عند نشرها', de: 'Neue Projekte erscheinen hier wenn veröffentlicht', fr: 'Les nouveaux projets apparaîtront ici', tr: 'Yeni projeler yayınlandığında burada görünecek' },
        'ct_no_bids_yet': { ar: 'لم يتم تقديم عروض بعد', de: 'Noch keine Angebote eingereicht', fr: 'Aucune offre soumise', tr: 'Henüz teklif verilmedi' },
        'ct_no_payments_yet': { ar: 'لا توجد مدفوعات بعد', de: 'Noch keine Zahlungen', fr: 'Aucun paiement', tr: 'Henüz ödeme yok' },
        'ct_fill_cost_days': { ar: 'يرجى تعبئة التكلفة والأيام', de: 'Bitte Kosten und Tage ausfüllen', fr: 'Veuillez remplir le coût et les jours', tr: 'Lütfen maliyet ve günleri doldurun' },
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
                // Final fallback: append to body with fixed positioning
                widget.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10000;font-family:"Plus Jakarta Sans",sans-serif;';
                document.body.appendChild(widget);
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
