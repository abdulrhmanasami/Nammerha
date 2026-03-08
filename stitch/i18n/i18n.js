// ============================================================================
// Nammerha i18n — Shared Localization Engine (Vanilla JS)
// Epic 11: Language Selector, Suggestion Banner, Dir/Lang Switching, API Wiring
// ============================================================================
// Architecture:
//   - Self-contained, zero-dependency Vanilla JS module
//   - Injects language selector + suggestion banner into any stitch page
//   - Persists user preference in localStorage
//   - Fetches translations from backend /api/translation endpoints
//   - Switches <html dir="" lang=""> dynamically
//
// Per "تأسيس محرك ترجمة احترافي للمنصة.md":
//   §4.3: NO forced redirects — suggestion banner only
//   §6.4: Native names only, no flags
//
// Per "تصميم هوية وتجربة تطبيق Nammerha.md":
//   Phosphor Globe icon for language selector
// ============================================================================

(function () {
    'use strict';

    // ─── Configuration ──────────────────────────────────────────────────
    const API_BASE = window.NM_API_BASE || '';

    const SUPPORTED_LANGS = [
        { code: 'ar', name: 'العربية', dir: 'rtl' },
        { code: 'en', name: 'English', dir: 'ltr' },
        { code: 'de', name: 'Deutsch', dir: 'ltr' },
        { code: 'fr', name: 'Français', dir: 'ltr' },
        { code: 'tr', name: 'Türkçe', dir: 'ltr' },
    ];

    const STORAGE_KEY = 'nm_preferred_locale';
    const BANNER_DISMISSED_KEY = 'nm_banner_dismissed';

    // Phosphor Globe SVG (inline to avoid external dependency)
    const GLOBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" class="nm-globe-icon" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-6.4,32.94l-44.7-27.49a15.92,15.92,0,0,0-6.24-2.23l-22.82-3.08a16.11,16.11,0,0,0-16,7.86h-8.72l-3.8-7.86a15.91,15.91,0,0,0-11-8.67l-8-1.73L96.14,104h16.71a16.06,16.06,0,0,0,7.73-2l12.25-6.76a16.62,16.62,0,0,0,3-2.14l26.91-24.34A15.93,15.93,0,0,0,168,57.48V49.23A88.12,88.12,0,0,1,216,128ZM40,128a87.53,87.53,0,0,1,8.54-37.8l11.34,30.27a16,16,0,0,0,11.62,10l21.43,4.61L96.74,143a16.09,16.09,0,0,0,14.4,9h1.48l-7.23,38.61A16.08,16.08,0,0,0,109,207.32l-1,1.74A88.17,88.17,0,0,1,40,128Z"/></svg>`;

    // Checkmark SVG
    const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" class="nm-check" fill="currentColor"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>`;

    // X (close) SVG
    const CLOSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>`;

    // ─── State ──────────────────────────────────────────────────────────
    let currentLang = getStoredLang() || 'en';
    let dropdownOpen = false;

    // ─── Utils ──────────────────────────────────────────────────────────
    function getStoredLang() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function setStoredLang(code) {
        try {
            localStorage.setItem(STORAGE_KEY, code);
        } catch (e) {
            // localStorage unavailable
        }
    }

    function getLangConfig(code) {
        return SUPPORTED_LANGS.find(function (l) { return l.code === code; }) || SUPPORTED_LANGS[1];
    }

    // ─── Core: Apply Language ───────────────────────────────────────────
    function applyLanguage(langCode) {
        var config = getLangConfig(langCode);
        var html = document.documentElement;

        // Update <html> attributes
        html.setAttribute('lang', config.code);
        html.setAttribute('dir', config.dir);

        currentLang = config.code;
        setStoredLang(config.code);

        // Update selector button text
        var btnLabel = document.getElementById('nm-lang-label');
        if (btnLabel) {
            btnLabel.textContent = config.name;
        }

        // Update active state in dropdown
        var options = document.querySelectorAll('.nm-lang-option');
        options.forEach(function (opt) {
            if (opt.dataset.lang === config.code) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });

        // Close dropdown
        closeDropdown();

        // Translate visible data-i18n elements
        translatePage(config.code);
    }

    // ─── Translation: data-i18n Elements ────────────────────────────────
    function translatePage(langCode) {
        // Skip if already in the source language of the page
        if (langCode === 'en') {
            // Reset to original English text
            var i18nElements = document.querySelectorAll('[data-i18n]');
            i18nElements.forEach(function (el) {
                var original = el.dataset.i18nOriginal;
                if (original) {
                    el.textContent = original;
                }
            });
            return;
        }

        var elements = document.querySelectorAll('[data-i18n]');
        if (elements.length === 0) return;

        // Store original text if not already stored
        elements.forEach(function (el) {
            if (!el.dataset.i18nOriginal) {
                el.dataset.i18nOriginal = el.textContent;
            }
        });

        // Collect unique texts for batch translation
        var textsMap = {};
        elements.forEach(function (el) {
            var originalText = el.dataset.i18nOriginal;
            if (originalText && !textsMap[originalText]) {
                textsMap[originalText] = [];
            }
            if (originalText) {
                textsMap[originalText].push(el);
            }
        });

        var uniqueTexts = Object.keys(textsMap);
        if (uniqueTexts.length === 0) return;

        // Call backend batch translation API
        if (!API_BASE) {
            // No API configured — show placeholder
            console.warn('[i18n] No API_BASE configured. Set window.NM_API_BASE before loading i18n.js');
            return;
        }

        fetch(API_BASE + '/api/translation/translate/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: uniqueTexts,
                source_lang: 'en',
                target_lang: langCode,
                content_type: 'ui',
            }),
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success && data.data && data.data.results) {
                    data.data.results.forEach(function (result) {
                        var els = textsMap[result.source_text];
                        if (els) {
                            els.forEach(function (el) {
                                el.textContent = result.translated_text;
                            });
                        }
                    });
                }
            })
            .catch(function (err) {
                console.warn('[i18n] Translation API error:', err.message);
            });
    }

    // ─── Language Selector Widget ────────────────────────────────────────
    function createLanguageSelector() {
        var config = getLangConfig(currentLang);

        var wrapper = document.createElement('div');
        wrapper.className = 'nm-lang-selector';

        // Button
        var btn = document.createElement('button');
        btn.className = 'nm-lang-btn';
        btn.setAttribute('aria-label', 'Select language');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = GLOBE_SVG + '<span id="nm-lang-label">' + config.name + '</span>';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleDropdown();
        });

        // Dropdown
        var dropdown = document.createElement('div');
        dropdown.className = 'nm-lang-dropdown';
        dropdown.id = 'nm-lang-dropdown';

        SUPPORTED_LANGS.forEach(function (lang) {
            var option = document.createElement('div');
            option.className = 'nm-lang-option' + (lang.code === currentLang ? ' active' : '');
            option.dataset.lang = lang.code;
            option.innerHTML = '<span>' + lang.name + '</span>' + CHECK_SVG;
            option.addEventListener('click', function (e) {
                e.stopPropagation();
                applyLanguage(lang.code);
            });
            dropdown.appendChild(option);
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(dropdown);

        return wrapper;
    }

    function toggleDropdown() {
        dropdownOpen = !dropdownOpen;
        var dropdown = document.getElementById('nm-lang-dropdown');
        var btn = document.querySelector('.nm-lang-btn');
        if (dropdown) {
            dropdown.classList.toggle('open', dropdownOpen);
        }
        if (btn) {
            btn.setAttribute('aria-expanded', String(dropdownOpen));
        }
    }

    function closeDropdown() {
        dropdownOpen = false;
        var dropdown = document.getElementById('nm-lang-dropdown');
        var btn = document.querySelector('.nm-lang-btn');
        if (dropdown) {
            dropdown.classList.remove('open');
        }
        if (btn) {
            btn.setAttribute('aria-expanded', 'false');
        }
    }

    // ─── Suggestion Banner ──────────────────────────────────────────────
    function createSuggestionBanner() {
        var banner = document.createElement('div');
        banner.className = 'nm-suggestion-banner';
        banner.id = 'nm-suggestion-banner';
        banner.setAttribute('role', 'alert');
        return banner;
    }

    function showSuggestionBanner(data) {
        var banner = document.getElementById('nm-suggestion-banner');
        if (!banner || !data.show) return;

        // Don't show if already dismissed this session
        try {
            if (sessionStorage.getItem(BANNER_DISMISSED_KEY) === data.suggested_locale) return;
        } catch (e) {
            // sessionStorage unavailable
        }

        var langConfig = getLangConfig(data.suggested_locale);
        var message = currentLang === 'ar' ? data.message_ar : data.message_en;

        banner.innerHTML =
            '<span>' + message + '</span>' +
            '<button onclick="window.__nmSwitchLang(\'' + data.suggested_locale + '\')">' +
            langConfig.name + '</button>' +
            '<button class="nm-banner-dismiss" onclick="window.__nmDismissBanner(\'' + data.suggested_locale + '\')" aria-label="Dismiss">' +
            CLOSE_SVG + '</button>';

        // Animate in
        requestAnimationFrame(function () {
            banner.classList.add('visible');
        });
    }

    // Global callbacks for banner buttons
    window.__nmSwitchLang = function (code) {
        applyLanguage(code);
        var banner = document.getElementById('nm-suggestion-banner');
        if (banner) banner.classList.remove('visible');
    };

    window.__nmDismissBanner = function (locale) {
        var banner = document.getElementById('nm-suggestion-banner');
        if (banner) banner.classList.remove('visible');
        try {
            sessionStorage.setItem(BANNER_DISMISSED_KEY, locale);
        } catch (e) {
            // sessionStorage unavailable
        }
    };

    function checkSuggestionBanner() {
        // Only check if API is configured
        if (!API_BASE) return;

        fetch(API_BASE + '/api/translation/locale/suggestion?current=' + currentLang)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success && data.data && data.data.show) {
                    showSuggestionBanner(data.data);
                }
            })
            .catch(function () {
                // Silently fail — banner is non-critical
            });
    }

    // ─── Mount into Page ────────────────────────────────────────────────
    function mount() {
        // 1. Create and inject suggestion banner (before nav)
        var banner = createSuggestionBanner();
        document.body.insertBefore(banner, document.body.firstChild);

        // 2. Find the nav and inject language selector
        var mountPoint = document.getElementById('nm-lang-mount');
        if (mountPoint) {
            // Explicit mount point
            mountPoint.appendChild(createLanguageSelector());
        } else {
            // Auto-detect: find the first <nav> and inject before the profile avatar
            var nav = document.querySelector('nav');
            if (nav) {
                var lastChild = nav.lastElementChild;
                if (lastChild) {
                    nav.insertBefore(createLanguageSelector(), lastChild);
                } else {
                    nav.appendChild(createLanguageSelector());
                }
            }
        }

        // 3. Apply stored language
        applyLanguage(currentLang);

        // 4. Close dropdown on outside click
        document.addEventListener('click', function () {
            if (dropdownOpen) closeDropdown();
        });

        // 5. Check suggestion banner (delayed to not block page load)
        setTimeout(checkSuggestionBanner, 1500);
    }

    // ─── Initialize ─────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }

    // ─── Public API ─────────────────────────────────────────────────────
    window.NammerhaI18n = {
        switchLanguage: applyLanguage,
        getCurrentLang: function () { return currentLang; },
        getSupportedLangs: function () { return SUPPORTED_LANGS.slice(); },
        getConnectionProfile: function () { return detectConnectionProfile(); },
    };

    // ═══════════════════════════════════════════════════════════════════════
    // §6.5 — Sustainable UX & Connection-Aware Adaptive Loading
    // ═══════════════════════════════════════════════════════════════════════
    // Per doc §6.5: "مبادئ تجربة المستخدم المستدامة (Sustainable UX)"
    //   - Low-bandwidth mode for weak connections (Syrian infrastructure)
    //   - Lazy loading for non-critical assets
    //   - Respects prefers-reduced-motion
    //   - Navigator.connection API for adaptive behavior
    // ═══════════════════════════════════════════════════════════════════════

    /** Connection speed profiles */
    var CONNECTION_PROFILES = {
        fast: { maxImageSize: Infinity, enableAnimations: true, lazyThreshold: '200px' },
        medium: { maxImageSize: 500000, enableAnimations: true, lazyThreshold: '400px' },
        slow: { maxImageSize: 100000, enableAnimations: false, lazyThreshold: '600px' },
    };

    /**
     * Detect connection profile from Navigator Network Information API.
     * Falls back to 'medium' for unsupported browsers.
     */
    function detectConnectionProfile() {
        var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn) {
            return 'medium'; // Conservative default
        }

        var ect = conn.effectiveType; // '4g', '3g', '2g', 'slow-2g'
        var downlink = conn.downlink;  // Mbps
        var saveData = conn.saveData;  // User opted for reduced data

        // User explicitly requested data saving → slow mode
        if (saveData) {
            return 'slow';
        }

        // Classify by effective connection type
        if (ect === '4g' && downlink > 5) {
            return 'fast';
        }
        if (ect === '4g' || ect === '3g') {
            return 'medium';
        }
        // 2g, slow-2g — definitely slow
        return 'slow';
    }

    /**
     * Apply low-bandwidth optimizations to the current page.
     * Runs after DOM is ready.
     */
    function applyConnectionAdaptations() {
        var profile = detectConnectionProfile();
        var settings = CONNECTION_PROFILES[profile];

        // Expose profile as data attribute on <html> for CSS hooks
        document.documentElement.dataset.connectionProfile = profile;

        // 1. Lazy loading for images (IntersectionObserver)
        if ('IntersectionObserver' in window) {
            var lazyImages = document.querySelectorAll('img[data-src], img[loading="lazy"]');
            if (lazyImages.length > 0) {
                var imageObserver = new IntersectionObserver(function (entries) {
                    entries.forEach(function (entry) {
                        if (entry.isIntersecting) {
                            var img = entry.target;
                            if (img.dataset.src) {
                                img.src = img.dataset.src;
                                img.removeAttribute('data-src');
                            }
                            imageObserver.unobserve(img);
                        }
                    });
                }, { rootMargin: settings.lazyThreshold });

                lazyImages.forEach(function (img) {
                    imageObserver.observe(img);
                });
            }
        }

        // 2. Disable CSS animations on slow connections
        if (!settings.enableAnimations || prefersReducedMotion()) {
            var style = document.createElement('style');
            style.id = 'nm-reduced-motion';
            style.textContent =
                '[data-connection-profile="slow"] *, ' +
                '[data-connection-profile="slow"] *::before, ' +
                '[data-connection-profile="slow"] *::after { ' +
                '  animation-duration: 0.01ms !important; ' +
                '  animation-iteration-count: 1 !important; ' +
                '  transition-duration: 0.01ms !important; ' +
                '}';
            document.head.appendChild(style);
        }

        // 3. Replace heavy background images on slow connections
        if (profile === 'slow') {
            var heavyBgs = document.querySelectorAll('[data-bg-light]');
            heavyBgs.forEach(function (el) {
                // Swap heavy background for a lightweight CSS gradient
                el.style.backgroundImage = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
            });

            // Remove decorative blur elements to save GPU
            var blurs = document.querySelectorAll('.blur-3xl, .blur-2xl, [class*="blur-"]');
            blurs.forEach(function (el) {
                if (el.classList.contains('pointer-events-none')) {
                    el.style.display = 'none';
                }
            });
        }

        // 4. Monitor connection changes (dynamic adaptation)
        var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn && conn.addEventListener) {
            conn.addEventListener('change', function () {
                var newProfile = detectConnectionProfile();
                document.documentElement.dataset.connectionProfile = newProfile;

                // Re-enable animations if connection improved
                if (newProfile === 'fast' || newProfile === 'medium') {
                    var reducedStyle = document.getElementById('nm-reduced-motion');
                    if (reducedStyle) {
                        reducedStyle.remove();
                    }
                }
            });
        }
    }

    /**
     * Check if user prefers reduced motion (accessibility).
     */
    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // ─── Initialize Sustainable UX after mount ──────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyConnectionAdaptations);
    } else {
        applyConnectionAdaptations();
    }

})();
