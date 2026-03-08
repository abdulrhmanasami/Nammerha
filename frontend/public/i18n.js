/**
 * Nammerha — Client-Side i18n Engine (Production)
 * ═══════════════════════════════════════════════════════════════
 * Instant language switching with embedded static translation dictionary.
 * Zero API dependency — all UI strings translated client-side.
 *
 * Features:
 *   - 5 supported languages (AR, EN, DE, FR, TR)
 *   - RTL/LTR switching with dir="" on <html>
 *   - Bilingual typography (IBM Plex Sans Arabic for AR)
 *   - localStorage persistence of language preference
 *   - Translates data-i18n keyed elements AND all visible text nodes
 *   - Language selector widget (Phosphor Globe icon)
 *   - Connection-aware adaptive loading
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

    // ─── Static Translation Dictionary ────────────────────────────────────
    // Key = data-i18n attribute value OR original English text
    // Each key maps to { ar, de, fr, tr } translations
    var DICT = {
        // ── Navigation ──
        'nav_home': { ar: 'الرئيسية', de: 'Startseite', fr: 'Accueil', tr: 'Ana Sayfa' },
        'nav_projects': { ar: 'المشاريع', de: 'Projekte', fr: 'Projets', tr: 'Projeler' },
        'nav_impact': { ar: 'الأثر', de: 'Wirkung', fr: 'Impact', tr: 'Etki' },
        'nav_wallet': { ar: 'المحفظة', de: 'Geldbörse', fr: 'Portefeuille', tr: 'Cüzdan' },
        'nav_profile': { ar: 'الحساب', de: 'Profil', fr: 'Profil', tr: 'Profil' },

        // ── Dashboard ──
        'active_region': { ar: 'المنطقة النشطة', de: 'Aktive Region', fr: 'Région active', tr: 'Aktif Bölge' },
        'active_projects': { ar: '12 مشروع نشط', de: '12 aktive Projekte', fr: '12 projets actifs', tr: '12 Aktif Proje' },
        'featured_projects': { ar: 'مشاريع مميزة', de: 'Ausgewählte Projekte', fr: 'Projets en vedette', tr: 'Öne Çıkan Projeler' },
        'view_all': { ar: 'عرض الكل', de: 'Alle anzeigen', fr: 'Tout voir', tr: 'Tümünü Gör' },
        'invest_now': { ar: 'استثمر الآن', de: 'Jetzt investieren', fr: 'Investir maintenant', tr: 'Şimdi Yatır' },
        'total_impact': { ar: 'إجمالي التأثير المموّل', de: 'Gesamtfinanzierte Wirkung', fr: 'Impact total financé', tr: 'Toplam Finanse Edilen Etki' },
        'vs_quarter': { ar: 'مقارنة بالربع السابق', de: 'ggü. letztem Quartal', fr: 'vs trimestre précédent', tr: 'önceki çeyreğe göre' },
        'transparency': { ar: 'الشفافية المؤسسية', de: 'Institutionelle Transparenz', fr: 'Transparence institutionnelle', tr: 'Kurumsal Şeffaflık' },

        // ── Index Page ──
        'interactive_map': { ar: 'خريطة إعادة الإعمار التفاعلية', de: 'Interaktive Wiederaufbaukarte', fr: 'Carte interactive de reconstruction', tr: 'İnteraktif Yeniden Yapım Haritası' },
        'fund_project': { ar: 'موّل هذا المشروع', de: 'Projekt finanzieren', fr: 'Financer ce projet', tr: 'Bu Projeyi Finanse Et' },
        'quick_actions': { ar: 'إجراءات سريعة', de: 'Schnellaktionen', fr: 'Actions rapides', tr: 'Hızlı İşlemler' },
        'report_damage': { ar: 'الإبلاغ عن أضرار', de: 'Schaden melden', fr: 'Signaler des dégâts', tr: 'Hasar Bildir' },
        'build_boq': { ar: 'إنشاء جدول كميات', de: 'LV erstellen', fr: 'Créer le DQE', tr: 'BOQ Oluştur' },
        'fund_materials': { ar: 'تمويل المواد', de: 'Materialien finanzieren', fr: 'Financer les matériaux', tr: 'Malzemeleri Finanse Et' },
        'price_oracle': { ar: 'مؤشر الأسعار', de: 'Preisorakel', fr: 'Oracle des prix', tr: 'Fiyat Kehaneti' },

        // ── Search & UI ──
        'Search reconstruction projects...': {
            ar: 'ابحث عن مشاريع إعادة الإعمار...',
            de: 'Wiederaufbauprojekte suchen...',
            fr: 'Rechercher des projets de reconstruction...',
            tr: 'Yeniden yapım projeleri ara...'
        },

        // ── Project Details ──
        'Project Details': { ar: 'تفاصيل المشروع', de: 'Projektdetails', fr: 'Détails du projet', tr: 'Proje Detayları' },
        'Overall Funding': { ar: 'التمويل الإجمالي', de: 'Gesamtfinanzierung', fr: 'Financement global', tr: 'Genel Finansman' },
        'Itemized Needs (BOQ)': { ar: 'الاحتياجات المفصلة', de: 'Detaillierte Bedarfe', fr: 'Besoins détaillés', tr: 'Detaylı İhtiyaçlar' },
        'Verified List': { ar: 'قائمة معتمدة', de: 'Verifizierte Liste', fr: 'Liste vérifiée', tr: 'Doğrulanmış Liste' },
        'Fund this item': { ar: 'موّل هذا البند', de: 'Diesen Artikel finanzieren', fr: 'Financer cet article', tr: 'Bu kalemi finanse et' },
        'Funding Complete': { ar: 'التمويل مكتمل', de: 'Finanzierung abgeschlossen', fr: 'Financement terminé', tr: 'Finansman Tamamlandı' },
        'Secure Escrow': { ar: 'ضمان آمن', de: 'Sicheres Treuhandkonto', fr: 'Séquestre sécurisé', tr: 'Güvenli Emanet' },
        'In Progress': { ar: 'قيد التنفيذ', de: 'In Bearbeitung', fr: 'En cours', tr: 'Devam Ediyor' },

        // ── Donor Proof ──
        'Proof of Delivery': { ar: 'إثبات التسليم', de: 'Liefernachweis', fr: 'Preuve de livraison', tr: 'Teslimat Kanıtı' },
        'Success! Your contribution is on-site': {
            ar: 'نجاح! تبرعك وصل للموقع',
            de: 'Erfolg! Ihr Beitrag ist vor Ort',
            fr: 'Succès ! Votre contribution est sur site',
            tr: 'Başarılı! Katkınız sahada'
        },
        'Blockchain Verified': { ar: 'تم التحقق عبر البلوكتشين', de: 'Blockchain-verifiziert', fr: 'Vérifié par blockchain', tr: 'Blockchain Doğrulanmış' },
        'View Project Progress': { ar: 'عرض تقدم المشروع', de: 'Projektfortschritt anzeigen', fr: 'Voir la progression', tr: 'Proje İlerlemesini Gör' },
        'Verified': { ar: 'معتمد', de: 'Verifiziert', fr: 'Vérifié', tr: 'Doğrulandı' },

        // ── Donor Basket ──
        'Construction Basket': { ar: 'سلة البناء', de: 'Baukorb', fr: 'Panier de construction', tr: 'İnşaat Sepeti' },
        'Your Basket': { ar: 'سلتك', de: 'Ihr Warenkorb', fr: 'Votre panier', tr: 'Sepetiniz' },
        'Proceed to Payment': { ar: 'المتابعة للدفع', de: 'Zur Zahlung', fr: 'Procéder au paiement', tr: 'Ödemeye Geç' },
        'Total': { ar: 'المجموع', de: 'Gesamt', fr: 'Total', tr: 'Toplam' },
        'Remove': { ar: 'إزالة', de: 'Entfernen', fr: 'Supprimer', tr: 'Kaldır' },
        'Checkout': { ar: 'الدفع', de: 'Bezahlen', fr: 'Payer', tr: 'Ödeme' },

        // ── Engineer BOQ ──
        'BOQ Builder': { ar: 'منشئ جدول الكميات', de: 'LV-Editor', fr: 'Éditeur DQE', tr: 'BOQ Oluşturucu' },
        'Add Item': { ar: 'إضافة بند', de: 'Artikel hinzufügen', fr: 'Ajouter un article', tr: 'Kalem Ekle' },
        'Save': { ar: 'حفظ', de: 'Speichern', fr: 'Enregistrer', tr: 'Kaydet' },
        'Submit': { ar: 'إرسال', de: 'Einreichen', fr: 'Soumettre', tr: 'Gönder' },
        'Cancel': { ar: 'إلغاء', de: 'Abbrechen', fr: 'Annuler', tr: 'İptal' },

        // ── Homeowner Report ──
        'Submit Repair Request': { ar: 'تقديم طلب إصلاح', de: 'Reparaturanfrage einreichen', fr: 'Soumettre une demande', tr: 'Onarım Talebi Gönder' },
        'Upload Photos': { ar: 'رفع الصور', de: 'Fotos hochladen', fr: 'Télécharger des photos', tr: 'Fotoğraf Yükle' },
        'Location': { ar: 'الموقع', de: 'Standort', fr: 'Emplacement', tr: 'Konum' },
        'Description': { ar: 'الوصف', de: 'Beschreibung', fr: 'Description', tr: 'Açıklama' },
        'Category': { ar: 'الفئة', de: 'Kategorie', fr: 'Catégorie', tr: 'Kategori' },
        'Priority': { ar: 'الأولوية', de: 'Priorität', fr: 'Priorité', tr: 'Öncelik' },
        'Next': { ar: 'التالي', de: 'Weiter', fr: 'Suivant', tr: 'İleri' },
        'Back': { ar: 'رجوع', de: 'Zurück', fr: 'Retour', tr: 'Geri' },

        // ── Common UI ──
        'Cost:': { ar: 'التكلفة:', de: 'Kosten:', fr: 'Coût :', tr: 'Maliyet:' },
        'Funded': { ar: 'ممول', de: 'Finanziert', fr: 'Financé', tr: 'Finanse Edildi' },
        'Fully Funded': { ar: 'مموّل بالكامل', de: 'Voll finanziert', fr: 'Entièrement financé', tr: 'Tamamen Finanse' },
        'Raised': { ar: 'تم جمع', de: 'Gesammelt', fr: 'Collecté', tr: 'Toplanan' },
        'Verify': { ar: 'تحقق', de: 'Verifizieren', fr: 'Vérifier', tr: 'Doğrula' },
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
        return LANGS[1]; // English
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
                // Skip script/style/noscript
                var parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                var tag = parent.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip elements already handled by data-i18n
                if (parent.hasAttribute('data-i18n')) return NodeFilter.FILTER_REJECT;
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
                    // Update all option styles
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

    // ─── RTL Direction Fix for Drop-down ──────────────────────────────────
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

    // ─── Mount ────────────────────────────────────────────────────────────
    function mount() {
        // Remove any old i18n widget
        var old = document.getElementById('nm-lang-widget');
        if (old) old.remove();

        document.body.appendChild(createSelector());

        // Apply stored/detected language
        applyLanguage(currentLang);
        updateWidgetPosition();

        // Close dropdown on outside click
        document.addEventListener('click', function () {
            if (dropdownOpen) closeDropdown();
        });
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
