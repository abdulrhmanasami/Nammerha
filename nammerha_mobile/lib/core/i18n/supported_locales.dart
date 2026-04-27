// ============================================================================
// Nammerha i18n — Supported Locales Registry
// ============================================================================
// Matches web i18n.js LANGS array. Phase 1: AR + EN.
// Phase 2 keys (DE, FR, TR) are included in the dictionary but the locale
// picker only exposes AR/EN until professional translation review is complete.
// ============================================================================

/// Metadata for a supported locale.
class NammerhaLocale {
  final String code;
  final String nativeName;
  final String dir; // 'rtl' or 'ltr'

  const NammerhaLocale({
    required this.code,
    required this.nativeName,
    required this.dir,
  });

  bool get isRTL => dir == 'rtl';
}

/// All supported locales — matches web i18n.js LANGS.
/// Order determines display order in the language picker.
const kSupportedLocales = <NammerhaLocale>[
  NammerhaLocale(code: 'ar', nativeName: 'العربية', dir: 'rtl'),
  NammerhaLocale(code: 'en', nativeName: 'English', dir: 'ltr'),
  // Phase 2 — keys exist in dictionary, picker hidden until review
  // NammerhaLocale(code: 'de', nativeName: 'Deutsch', dir: 'ltr'),
  // NammerhaLocale(code: 'fr', nativeName: 'Français', dir: 'ltr'),
  // NammerhaLocale(code: 'tr', nativeName: 'Türkçe', dir: 'ltr'),
];

/// Default locale — Arabic (Syria)
const kDefaultLocaleCode = 'ar';

/// SharedPreferences key — matches web's nm_preferred_locale
const kLocaleStorageKey = 'nm_preferred_locale';
