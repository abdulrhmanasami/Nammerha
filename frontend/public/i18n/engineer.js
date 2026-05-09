/**
 * Nammerha i18n — engineer dictionary chunk
 * Keys: 40+
 */
(function () {
    'use strict';
    if (typeof window.__nmDictMerge === 'function') {
        window.__nmDictMerge({
        'boq_builder': { ar: 'منشئ جدول الكميات', de: 'LV-Editor', fr: 'Éditeur DQE', tr: 'BOQ Oluşturucu' },
        'add_item': { ar: 'إضافة بند', de: 'Artikel hinzufügen', fr: 'Ajouter un article', tr: 'Kalem Ekle' },
        'site_validation_proof_of_work': { ar: 'التحقق الميداني وإثبات العمل', de: 'Standortvalidierung & Arbeitsnachweis', fr: 'Validation sur site & preuve de travail', tr: 'Saha Doğrulama & İş Kanıtı' },
        'timestamp': { ar: 'الطابع الزمني', de: 'Zeitstempel', fr: 'Horodatage', tr: 'Zaman Damgası' },
        'signature': { ar: 'التوقيع', de: 'Unterschrift', fr: 'Signature', tr: 'İmza' },
        'camera_gps_lock': { ar: 'قفل GPS', de: 'GPS-Sperre', fr: 'Verrou GPS', tr: 'GPS Kilidi' },
        'camera_project_label': { ar: 'المشروع', de: 'Projekt', fr: 'Projet', tr: 'Proje' },
        'camera_section_viewfinder': { ar: 'عدسة الكاميرا', de: 'Kamerasucher', fr: 'Viseur caméra', tr: 'Kamera Vizörü' },
        'camera_section_material': { ar: 'سياق المواد', de: 'Materialkontext', fr: 'Contexte matériau', tr: 'Malzeme Bağlamı' },
        'camera_section_actions': { ar: 'إجراءات الالتقاط', de: 'Aufnahmeaktionen', fr: 'Actions de capture', tr: 'Çekim İşlemleri' },
        'eng_publish_to_marketplace': { ar: 'النشر في السوق', de: 'Auf dem Marktplatz veröffentlichen', fr: 'Publier sur le marché', tr: 'Pazara Yayınla' },

        /* E1: Engineer Portal Dashboard */
        'eng_portal': { ar: 'بوابة المهندس', de: 'Ingenieur-Portal', fr: 'Portail Ingénieur', tr: 'Mühendis Portalı' },
        'eng_access': { ar: 'وصول المهندس', de: 'Ingenieur-Zugang', fr: 'Accès Ingénieur', tr: 'Mühendis Erişimi' },
        'eng_dashboard_title': { ar: 'لوحة المهندس', de: 'Ingenieur-Dashboard', fr: 'Tableau de bord Ingénieur', tr: 'Mühendis Paneli' },
        'eng_dashboard_heading': { ar: 'نظرة عامة', de: 'Dashboard-Übersicht', fr: "Vue d'ensemble", tr: 'Genel Bakış' },
        'eng_dashboard_desc': { ar: 'إدارة مشاريعك المسندة والإثباتات المكانية وسجل العروض', de: 'Verwalten Sie zugewiesene Projekte, räumliche Nachweise und Angebotshistorie', fr: 'Gérez vos projets assignés, preuves spatiales et historique des offres', tr: 'Atanan projelerinizi, mekansal kanıtlarınızı ve teklif geçmişinizi yönetin' },
        'eng_my_bids': { ar: 'عروضي', de: 'Meine Angebote', fr: 'Mes Offres', tr: 'Tekliflerim' },
        'eng_my_captures': { ar: 'التقاطاتي', de: 'Meine Aufnahmen', fr: 'Mes Captures', tr: 'Çekimlerim' },

        /* E1: KPI Cards */
        'eng_assigned_projects': { ar: 'المشاريع المسندة', de: 'Zugewiesene Projekte', fr: 'Projets assignés', tr: 'Atanan Projeler' },
        'eng_proofs_pending': { ar: 'إثباتات معلقة', de: 'Ausstehende Nachweise', fr: 'Preuves en attente', tr: 'Bekleyen Kanıtlar' },
        'eng_proofs_verified': { ar: 'إثباتات موثقة', de: 'Verifizierte Nachweise', fr: 'Preuves vérifiées', tr: 'Doğrulanmış Kanıtlar' },
        'eng_escrow_released': { ar: 'ضمان محرر', de: 'Treuhand freigegeben', fr: 'Séquestre libéré', tr: 'Emanet Serbest' },
        'eng_pending': { ar: 'معلق', de: 'Ausstehend', fr: 'En attente', tr: 'Beklemede' },

        /* E1: Projects Section */
        'eng_projects_desc': { ar: 'مشاريع مسندة للإشراف الهندسي والتحقق المكاني', de: 'Projekte für Bauüberwachung und räumliche Verifizierung', fr: 'Projets assignés pour supervision ingénierie et vérification spatiale', tr: 'Mühendislik denetimi ve mekansal doğrulama için atanan projeler' },
        'eng_no_projects': { ar: 'لا توجد مشاريع مسندة بعد', de: 'Noch keine zugewiesenen Projekte', fr: 'Aucun projet assigné pour le moment', tr: 'Henüz atanmış proje yok' },
        'eng_no_projects_desc': { ar: 'ستظهر المشاريع هنا عند إسنادها من المنصة', de: 'Projekte werden hier angezeigt, sobald sie zugewiesen werden', fr: 'Les projets apparaîtront ici une fois assignés par la plateforme.', tr: 'Projeler platform tarafından atandığında burada görünecektir.' },
        'eng_no_region': { ar: 'غير محدد', de: 'K.A.', fr: 'N/D', tr: 'Belirtilmemiş' },
        'eng_boq_items': { ar: 'بنود الكميات', de: 'LV-Positionen', fr: 'Éléments DQE', tr: 'BOQ Kalemleri' },
        'eng_view_boq': { ar: 'عرض جدول الكميات', de: 'LV anzeigen', fr: 'Voir DQE', tr: 'BOQ Görüntüle' },
        'eng_capture': { ar: 'التقاط', de: 'Erfassen', fr: 'Capturer', tr: 'Çekim' },

        /* E1: Phase Labels */
        'eng_phase_planning': { ar: 'تخطيط', de: 'Planung', fr: 'Planification', tr: 'Planlama' },
        'eng_phase_in_progress': { ar: 'قيد التنفيذ', de: 'In Bearbeitung', fr: 'En cours', tr: 'Devam Ediyor' },
        'eng_phase_construction': { ar: 'بناء', de: 'Bau', fr: 'Construction', tr: 'İnşaat' },
        'eng_phase_completed': { ar: 'مكتمل', de: 'Abgeschlossen', fr: 'Terminé', tr: 'Tamamlandı' },
        'eng_phase_delivered': { ar: 'تم التسليم', de: 'Geliefert', fr: 'Livré', tr: 'Teslim Edildi' },
        'eng_phase_published': { ar: 'منشور', de: 'Veröffentlicht', fr: 'Publié', tr: 'Yayınlandı' },

        /* E1: Bids Section */
        'eng_bid_history': { ar: 'سجل العروض', de: 'Angebotshistorie', fr: 'Historique des offres', tr: 'Teklif Geçmişi' },
        'eng_bids_desc': { ar: 'العروض التي قدمتها على مشاريع إعادة البناء', de: 'Ihre Angebote für Wiederaufbauprojekte', fr: 'Vos offres sur les projets de reconstruction', tr: 'Yeniden yapım projelerine sunduğunuz teklifler' },
        'eng_no_bids': { ar: 'لم تقدم أي عروض بعد', de: 'Noch keine Angebote eingereicht', fr: 'Aucune offre soumise', tr: 'Henüz teklif verilmedi' },
        'eng_proposed_cost': { ar: 'التكلفة المقترحة', de: 'Vorgeschlagene Kosten', fr: 'Coût proposé', tr: 'Önerilen Maliyet' },
        'eng_est_days': { ar: 'المدة التقديرية', de: 'Geschätzte Tage', fr: 'Jours estimés', tr: 'Tahmini Gün' },
        'eng_submitted': { ar: 'تاريخ التقديم', de: 'Eingereicht', fr: 'Soumis', tr: 'Gönderildi' },
        'eng_bid_pending': { ar: 'قيد المراجعة', de: 'Ausstehend', fr: 'En attente', tr: 'Beklemede' },
        'eng_bid_accepted': { ar: 'مقبول', de: 'Akzeptiert', fr: 'Accepté', tr: 'Kabul Edildi' },
        'eng_bid_rejected': { ar: 'مرفوض', de: 'Abgelehnt', fr: 'Refusé', tr: 'Reddedildi' },

        /* E1: Captures Section */
        'eng_recent_captures': { ar: 'أحدث التقاطات', de: 'Neueste Aufnahmen', fr: 'Captures récentes', tr: 'Son Çekimler' },
        'eng_captures_desc': { ar: 'أحدث التقاطات الميدانية والإثباتات المكانية', de: 'Neueste Aufnahmen und räumliche Nachweise', fr: 'Captures récentes et preuves spatiales', tr: 'Son saha çekimleri ve mekansal kanıtlar' },
        'eng_no_captures': { ar: 'لا توجد التقاطات بعد', de: 'Noch keine Aufnahmen', fr: 'Aucune capture', tr: 'Henüz çekim yok' },
        'eng_no_captures_desc': { ar: 'ابدأ بالتقاط أدلة ميدانية عبر الكاميرا الميدانية', de: 'Starten Sie mit der Feldkamera.', fr: 'Commencez avec la caméra de terrain.', tr: 'Saha Kamerası ile başlayın.' },
        'eng_verified': { ar: 'موثق', de: 'Verifiziert', fr: 'Vérifié', tr: 'Doğrulanmış' },

        /* E1: BOQ Builder + Field Camera nav */
        'eng_boq_builder': { ar: 'منشئ جدول الكميات', de: 'LV-Editor', fr: 'Éditeur DQE', tr: 'BOQ Oluşturucu' },
        'eng_field_camera': { ar: 'الكاميرا الميدانية', de: 'Feldkamera', fr: 'Caméra de terrain', tr: 'Saha Kamerası' },

        /* E2: Camera HTML — UI labels + actions */
        'site_verification': { ar: 'التحقق الميداني', de: 'Standortprüfung', fr: 'Vérification sur site', tr: 'Saha Doğrulaması' },
        'nmr_hvr_001': { ar: 'NMR-HVR-001', de: 'NMR-HVR-001', fr: 'NMR-HVR-001', tr: 'NMR-HVR-001' },
        'harbor_view': { ar: 'منظر الميناء', de: 'Hafenblick', fr: 'Vue du port', tr: 'Liman Manzarası' },
        'point_camera_at_delivery_site': { ar: 'وجّه الكاميرا إلى موقع التسليم', de: 'Kamera auf die Lieferstelle richten', fr: 'Pointez la caméra vers le site de livraison', tr: 'Kamerayı teslimat noktasına çevirin' },
        'gps_timestamp_will_be_auto_embedded': { ar: 'سيتم تضمين GPS والطابع الزمني تلقائياً', de: 'GPS + Zeitstempel werden automatisch eingebettet', fr: 'GPS + horodatage seront intégrés automatiquement', tr: 'GPS + zaman damgası otomatik yerleştirilecek' },
        '360_captured': { ar: 'تم التقاط 360°', de: '360° erfasst', fr: '360° capturé', tr: '360° Çekildi' },
        'syncing_to_server': { ar: 'جاري المزامنة مع الخادم...', de: 'Synchronisierung mit Server...', fr: 'Synchronisation avec le serveur...', tr: 'Sunucuya senkronize ediliyor...' },
        '50_bags_opc_cement': { ar: '50 كيس — أسمنت بورتلاندي', de: '50 Sack — OPC Zement', fr: '50 sacs — Ciment OPC', tr: '50 Torba — OPC Çimento' },
        'po_nmr_po_20260001_al_shams_materials': { ar: 'أمر شراء NMR-PO-20260001 — مواد الشمس', de: 'Bestellung NMR-PO-20260001 — Al-Shams Materialien', fr: 'Commande NMR-PO-20260001 — Matériaux Al-Shams', tr: 'Sipariş NMR-PO-20260001 — Al-Shams Malzemeleri' },
        'matched': { ar: 'مطابق', de: 'Zugeordnet', fr: 'Correspondant', tr: 'Eşleştirildi' },
        'capture_360_sync': { ar: 'التقاط 360 ومزامنة', de: '360° erfassen \u0026 synchronisieren', fr: 'Capturer 360 \u0026 synchroniser', tr: '360 Çek \u0026 Senkronize Et' },
        'voice_snag': { ar: 'ملاحظة صوتية', de: 'Sprach-Mängel', fr: 'Note vocale', tr: 'Sesli Sorun' },
        'gallery': { ar: 'المعرض', de: 'Galerie', fr: 'Galerie', tr: 'Galeri' },
        'sync': { ar: 'مزامنة', de: 'Synchronisieren', fr: 'Synchroniser', tr: 'Senkronize' },
        'recording_snag_note': { ar: 'تسجيل ملاحظة مشكلة...', de: 'Mängel-Notiz aufnehmen...', fr: 'Enregistrement de la note de problème...', tr: 'Sorun notu kaydediliyor...' },
        'describe_the_issue_clearly_your_voice_n': { ar: 'صِف المشكلة بوضوح. سيتم إرفاق الملاحظة الصوتية بموقع GPS.', de: 'Beschreiben Sie das Problem klar. Ihre Sprachnotiz wird an den GPS-Pin angehängt.', fr: 'Décrivez le problème clairement. Votre note vocale sera attachée au marqueur GPS.', tr: 'Sorunu açıkça tanımlayın. Sesli notunuz GPS konumuna eklenecektir.' },
        'stop_recording': { ar: 'إيقاف التسجيل', de: 'Aufnahme stoppen', fr: 'Arrêter l\'enregistrement', tr: 'Kaydı Durdur' },

        /* E3: Camera TS — runtime status messages */
        'cam_gps_unavailable': { ar: 'GPS غير متاح', de: 'GPS nicht verfügbar', fr: 'GPS indisponible', tr: 'GPS kullanılamıyor' },
        'cam_accuracy': { ar: 'الدقة', de: 'Genauigkeit', fr: 'Précision', tr: 'Doğruluk' },
        'cam_gps_denied': { ar: 'تم رفض إذن GPS', de: 'GPS-Berechtigung verweigert', fr: 'Autorisation GPS refusée', tr: 'GPS izni reddedildi' },
        'cam_gps_fallback': { ar: 'استخدام موقع تقريبي', de: 'Ungefährer Standort verwendet', fr: 'Position approximative utilisée', tr: 'Yaklaşık konum kullanılıyor' },
        'cam_init_failed': { ar: 'فشل تهيئة الكاميرا', de: 'Kamera-Initialisierung fehlgeschlagen', fr: 'Échec d\'initialisation de la caméra', tr: 'Kamera başlatılamadı' },
        'cam_max_captures': { ar: 'وصلت للحد الأقصى من الالتقاطات', de: 'Maximale Aufnahmen erreicht', fr: 'Maximum de captures atteint', tr: 'Maksimum çekim sayısına ulaşıldı' },
        'cam_captured': { ar: 'تم الالتقاط', de: 'Erfasst', fr: 'Capturé', tr: 'Çekildi' },
        'cam_capture_360': { ar: 'التقاط 360°', de: '360° erfassen', fr: 'Capture 360°', tr: '360° Çekim' },
        'cam_no_captures': { ar: 'لا توجد التقاطات', de: 'Keine Aufnahmen', fr: 'Aucune capture', tr: 'Çekim yok' },
        'cam_no_project': { ar: 'لم يتم تحديد مشروع', de: 'Kein Projekt ausgewählt', fr: 'Aucun projet sélectionné', tr: 'Proje seçilmedi' },
        'cam_gps_required': { ar: 'يُتطلب GPS للإثبات المكاني', de: 'GPS für räumlichen Nachweis erforderlich', fr: 'GPS requis pour la preuve spatiale', tr: 'Mekansal kanıt için GPS gerekli' },
        'cam_uploading': { ar: 'جاري الرفع...', de: 'Wird hochgeladen...', fr: 'Téléversement en cours...', tr: 'Yükleniyor...' },
        'cam_proofs_synced': { ar: 'تمت مزامنة الإثبات(ات)', de: 'Nachweis(e) synchronisiert', fr: 'Preuve(s) synchronisée(s)', tr: 'Kanıt(lar) senkronize edildi' },
        'cam_proofs_submitted': { ar: 'تم تقديم الإثباتات', de: 'Nachweise eingereicht', fr: 'Preuves soumises', tr: 'Kanıtlar gönderildi' },
        'cam_sync_failed': { ar: 'فشلت المزامنة', de: 'Synchronisierung fehlgeschlagen', fr: 'Échec de la synchronisation', tr: 'Senkronizasyon başarısız' },
        'cam_sync_to_server': { ar: 'مزامنة مع الخادم', de: 'Mit Server synchronisieren', fr: 'Synchroniser avec le serveur', tr: 'Sunucuyla senkronize et' },
        'cam_snag_saved': { ar: 'تم حفظ ملاحظة المشكلة', de: 'Mängel-Notiz gespeichert', fr: 'Note de problème enregistrée', tr: 'Sorun notu kaydedildi' },

        /* E4: BOQ HTML labels */
        'engineer_boq_builder': { ar: 'منشئ جدول الكميات', de: 'LV-Editor', fr: 'Éditeur DQE', tr: 'BOQ Oluşturucu' },
        'added_materials': { ar: 'المواد المضافة', de: 'Hinzugefügte Materialien', fr: 'Matériaux ajoutés', tr: 'Eklenen Malzemeler' },
        'total_project_estimate': { ar: 'التكلفة التقديرية الإجمالية', de: 'Gesamtkostenschätzung', fr: 'Estimation totale du projet', tr: 'Toplam Proje Tahmini' },

        /* E5: BOQ TS — runtime messages */
        'boq_items': { ar: 'بنود', de: 'Positionen', fr: 'éléments', tr: 'kalem' },
        'boq_oracle': { ar: 'Oracle', de: 'Oracle', fr: 'Oracle', tr: 'Oracle' },
        'boq_no_oracle_price': { ar: 'لا يوجد سعر من Oracle', de: 'Kein Oracle-Preis', fr: 'Pas de prix Oracle', tr: 'Oracle fiyatı yok' },
        'boq_estimated': { ar: 'تقديري', de: 'Geschätzt', fr: 'Estimé', tr: 'Tahmini' },
        'boq_no_materials': { ar: 'لم تُضف مواد بعد', de: 'Noch keine Materialien', fr: 'Aucun matériau ajouté', tr: 'Henüz malzeme eklenmedi' },
        'boq_search_hint': { ar: 'ابحث عن مواد البناء...', de: 'Baumaterialien suchen...', fr: 'Rechercher des matériaux...', tr: 'İnşaat malzemelerini ara...' },
        'boq_search_error': { ar: 'خطأ في البحث', de: 'Suchfehler', fr: 'Erreur de recherche', tr: 'Arama hatası' },
        'boq_publishing': { ar: 'جاري النشر...', de: 'Wird veröffentlicht...', fr: 'Publication en cours...', tr: 'Yayınlanıyor...' },
        'boq_all_items_failed': { ar: 'فشل نشر جميع البنود', de: 'Alle Positionen fehlgeschlagen', fr: 'Échec de publication de tous les éléments', tr: 'Tüm kalemler yayınlanamadı' },
        'boq_published': { ar: 'تم النشر بنجاح', de: 'Erfolgreich veröffentlicht', fr: 'Publié avec succès', tr: 'Başarıyla yayınlandı' },
        'boq_publish_failed': { ar: 'فشل النشر', de: 'Veröffentlichung fehlgeschlagen', fr: 'Échec de publication', tr: 'Yayınlama başarısız' },
        'boq_publish_to_marketplace': { ar: 'نشر في السوق', de: 'Auf dem Marktplatz veröffentlichen', fr: 'Publier sur le marché', tr: 'Pazara Yayınla' }
        });
    }
})();
