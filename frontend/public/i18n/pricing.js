/**
 * Nammerha i18n — pricing dictionary chunk
 * P0-I18N-001 FIX: Added 44 orphan keys — pricing page was completely untranslated.
 * Keys: 44
 */
(function () {
    'use strict';
    if (typeof window.__nmDictMerge === 'function') {
        window.__nmDictMerge({
        'pricing_title': { ar: 'خطط الشراكة', de: 'Partnerschaftspläne', fr: 'Plans de partenariat', tr: 'Ortaklık Planları' },
        'pricing_subtitle': { ar: 'اختر الخطة المناسبة لمساهمتك', de: 'Wählen Sie den richtigen Plan für Ihren Beitrag', fr: 'Choisissez le plan adapté à votre contribution', tr: 'Katkınıza uygun planı seçin' },
        'pricing_monthly': { ar: 'شهري', de: 'Monatlich', fr: 'Mensuel', tr: 'Aylık' },
        'pricing_yearly': { ar: 'سنوي', de: 'Jährlich', fr: 'Annuel', tr: 'Yıllık' },
        'pricing_save': { ar: 'وفّر ٢٠٪', de: '20 % sparen', fr: 'Économisez 20 %', tr: '%20 Tasarruf' },
        'pricing_per_month': { ar: '/ شهرياً', de: '/ Monat', fr: '/ mois', tr: '/ ay' },
        'pricing_forever': { ar: 'مجاناً للأبد', de: 'Für immer kostenlos', fr: 'Gratuit pour toujours', tr: 'Sonsuza kadar ücretsiz' },
        'pricing_recommended': { ar: 'موصى به', de: 'Empfohlen', fr: 'Recommandé', tr: 'Önerilen' },
        'pricing_current_plan': { ar: 'خطتك الحالية', de: 'Ihr aktueller Plan', fr: 'Votre plan actuel', tr: 'Mevcut Planınız' },
        'pricing_cancel_anytime': { ar: 'إلغاء في أي وقت', de: 'Jederzeit kündbar', fr: 'Annulation à tout moment', tr: 'İstediğiniz zaman iptal' },
        'pricing_contact_sales': { ar: 'تواصل مع المبيعات', de: 'Vertrieb kontaktieren', fr: 'Contacter les ventes', tr: 'Satışla İletişim' },
        'pricing_secure': { ar: 'دفع آمن عبر Stripe', de: 'Sichere Zahlung über Stripe', fr: 'Paiement sécurisé via Stripe', tr: 'Stripe ile güvenli ödeme' },
        'pricing_ocds': { ar: 'متوافق مع OCDS', de: 'OCDS-konform', fr: 'Conforme OCDS', tr: 'OCDS Uyumlu' },
        'pricing_global': { ar: 'وصول عالمي', de: 'Globaler Zugang', fr: 'Accès mondial', tr: 'Küresel Erişim' },

        // ═══ PLAN NAMES & DESCRIPTIONS ═══
        'pricing_free_name': { ar: 'مجاني', de: 'Kostenlos', fr: 'Gratuit', tr: 'Ücretsiz' },
        'pricing_free_desc': { ar: 'للأفراد والمانحين', de: 'Für Einzelpersonen und Spender', fr: 'Pour les particuliers et donateurs', tr: 'Bireyler ve bağışçılar için' },
        'pricing_pro_name': { ar: 'احترافي', de: 'Professional', fr: 'Professionnel', tr: 'Profesyonel' },
        'pricing_pro_desc': { ar: 'للمقاولين والمهندسين', de: 'Für Auftragnehmer und Ingenieure', fr: 'Pour les entrepreneurs et ingénieurs', tr: 'Yükleniciler ve mühendisler için' },
        'pricing_business_name': { ar: 'أعمال', de: 'Business', fr: 'Business', tr: 'İş' },
        'pricing_business_desc': { ar: 'للمنظمات والشركات', de: 'Für Organisationen und Unternehmen', fr: 'Pour les organisations et entreprises', tr: 'Organizasyonlar ve şirketler için' },
        'pricing_enterprise_name': { ar: 'مؤسسي', de: 'Enterprise', fr: 'Entreprise', tr: 'Kurumsal' },
        'pricing_enterprise_desc': { ar: 'للحكومات والمنظمات الدولية', de: 'Für Regierungen und internationale Organisationen', fr: 'Pour les gouvernements et organisations internationales', tr: 'Hükümetler ve uluslararası kuruluşlar için' },
        'pricing_get_pro': { ar: 'ابدأ الاحترافي', de: 'Professional starten', fr: 'Commencer Professional', tr: 'Profesyoneli Başlat' },
        'pricing_get_business': { ar: 'ابدأ الأعمال', de: 'Business starten', fr: 'Commencer Business', tr: 'İş Planını Başlat' },

        // ═══ FEATURE BULLETS ═══
        'pricing_f_profile': { ar: 'ملف شخصي معتمد', de: 'Verifiziertes Profil', fr: 'Profil vérifié', tr: 'Doğrulanmış Profil' },
        'pricing_f_boq_3': { ar: 'حتى ٣ جداول كميات', de: 'Bis zu 3 LV', fr: 'Jusqu\'à 3 DQE', tr: '3\'e kadar BOQ' },
        'pricing_f_boq_15': { ar: 'حتى ١٥ جدول كميات', de: 'Bis zu 15 LV', fr: 'Jusqu\'à 15 DQE', tr: '15\'e kadar BOQ' },
        'pricing_f_boq_unlimited': { ar: 'جداول كميات غير محدودة', de: 'Unbegrenzte LV', fr: 'DQE illimités', tr: 'Sınırsız BOQ' },
        'pricing_f_bids_unlimited': { ar: 'عروض غير محدودة', de: 'Unbegrenzte Angebote', fr: 'Offres illimitées', tr: 'Sınırsız Teklif' },
        'pricing_f_oracle_basic': { ar: 'مؤشر أسعار أساسي', de: 'Basis-Preisorakel', fr: 'Oracle des prix basique', tr: 'Temel Fiyat Endeksi' },
        'pricing_f_oracle_adv': { ar: 'مؤشر أسعار متقدم', de: 'Erweitertes Preisorakel', fr: 'Oracle des prix avancé', tr: 'Gelişmiş Fiyat Endeksi' },
        'pricing_f_alerts_5': { ar: 'حتى ٥ تنبيهات', de: 'Bis zu 5 Benachrichtigungen', fr: 'Jusqu\'à 5 alertes', tr: '5\'e kadar uyarı' },
        'pricing_f_alerts_25': { ar: 'حتى ٢٥ تنبيه', de: 'Bis zu 25 Benachrichtigungen', fr: 'Jusqu\'à 25 alertes', tr: '25\'e kadar uyarı' },
        'pricing_f_alerts_unlimited': { ar: 'تنبيهات غير محدودة', de: 'Unbegrenzte Benachrichtigungen', fr: 'Alertes illimitées', tr: 'Sınırsız Uyarı' },
        'pricing_f_priority': { ar: 'أولوية في المطابقة', de: 'Prioritäts-Matching', fr: 'Correspondance prioritaire', tr: 'Öncelikli Eşleştirme' },
        'pricing_f_invoices': { ar: 'إنشاء فواتير', de: 'Rechnungserstellung', fr: 'Génération de factures', tr: 'Fatura Oluşturma' },
        'pricing_f_api_access': { ar: 'وصول API', de: 'API-Zugang', fr: 'Accès API', tr: 'API Erişimi' },
        'pricing_f_custom_reports': { ar: 'تقارير مخصصة', de: 'Benutzerdefinierte Berichte', fr: 'Rapports personnalisés', tr: 'Özel Raporlar' },
        'pricing_f_everything_business': { ar: 'كل ميزات الأعمال', de: 'Alles aus Business', fr: 'Tout de Business', tr: 'İş planının tüm özellikleri' },
        'pricing_f_dedicated_manager': { ar: 'مدير حساب مخصص', de: 'Dedizierter Kundenbetreuer', fr: 'Gestionnaire de compte dédié', tr: 'Özel Hesap Yöneticisi' },
        'pricing_f_sla': { ar: 'اتفاقية مستوى خدمة', de: 'SLA', fr: 'SLA', tr: 'SLA' },
        'pricing_f_whitelabel': { ar: 'واجهة مخصصة', de: 'White-Label', fr: 'Marque blanche', tr: 'Beyaz Etiket' },
        'pricing_f_onboarding': { ar: 'تأهيل مخصص', de: 'Individuelles Onboarding', fr: 'Intégration personnalisée', tr: 'Özel Oryantasyon' },
        'pricing_f_priority_support': { ar: 'دعم أولوي', de: 'Prioritäts-Support', fr: 'Support prioritaire', tr: 'Öncelikli Destek' },

        // ═══ PLT-W8: pricing.ts t() keys ═══
        'pricing_error': { ar: 'فشل تحميل الأسعار', de: 'Preise konnten nicht geladen werden', fr: 'Échec du chargement des prix', tr: 'Fiyatlar yüklenemedi' },
        'pricing_per_month_yearly': { ar: '/شهر (سنوي)', de: '/Monat (jährlich)', fr: '/mois (annuel)', tr: '/ay (yıllık)' },
        'pricing_subscribed': { ar: 'تم الاشتراك', de: 'Abonniert', fr: 'Abonné', tr: 'Abone olundu' },
        'pricing_try_again': { ar: 'حاول مرة أخرى', de: 'Erneut versuchen', fr: 'Réessayer', tr: 'Tekrar deneyin' }
        });
    }
})();
