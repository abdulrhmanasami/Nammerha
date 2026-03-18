/**
 * Nammerha i18n — auth dictionary chunk
 * PLAT-P0-002 FIX: Orphan keys purged (13 dead/misplaced keys removed).
 * Keys: 38
 */
(function () {
    'use strict';
    if (typeof window.__nmDictMerge === 'function') {
        window.__nmDictMerge({
        'auth_welcome': { ar: 'أهلاً بك في نعمِّرها', de: 'Willkommen bei Nammerha', fr: 'Bienvenue sur Nammerha', tr: 'Nammerha\'ya Hoş Geldiniz' },
        'auth_subtitle': { ar: 'منصة إعادة الإعمار', de: 'Transparente Wiederaufbauplattform', fr: 'Plateforme de reconstruction transparente', tr: 'Şeffaf Yeniden Yapım Platformu' },
        'tab_login': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Connexion', tr: 'Giriş' },
        'tab_register': { ar: 'إنشاء حساب', de: 'Registrieren', fr: 'Inscription', tr: 'Kayıt Ol' },
        'email_label': { ar: 'البريد الإلكتروني', de: 'E-Mail', fr: 'E-mail', tr: 'E-posta' },
        'password_label': { ar: 'كلمة المرور', de: 'Passwort', fr: 'Mot de passe', tr: 'Şifre' },
        'full_name_label': { ar: 'الاسم الكامل', de: 'Vollständiger Name', fr: 'Nom complet', tr: 'Ad Soyad' },
        'sign_in_btn': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Se connecter', tr: 'Giriş Yap' },
        'create_account_btn': { ar: 'إنشاء حساب', de: 'Konto erstellen', fr: 'Créer un compte', tr: 'Hesap Oluştur' },
        /* CONF-2026-003 FIX: Updated to match actual auth.ts L241 validation rules.
           Previous: omitted lowercase + symbol — users crafted passwords that got rejected.
           Standard: WCAG 3.3.2 (Labels or Instructions), Nielsen #2 (Match System ↔ Real World). */
        'pw_requirements': { ar: '+٨ أحرف، حرف كبير، حرف صغير، رقم، رمز', de: '8+ Zeichen, 1 Groß-, 1 Kleinbuchstabe, 1 Zahl, 1 Sonderzeichen', fr: '8+ car., 1 majuscule, 1 minuscule, 1 chiffre, 1 symbole', tr: '8+ karakter, 1 büyük harf, 1 küçük harf, 1 rakam, 1 sembol' },
        'forgot_password': { ar: 'نسيت كلمة المرور؟', de: 'Passwort vergessen?', fr: 'Mot de passe oublié ?', tr: 'Şifrenizi mi unuttunuz?' },
        'auth_trust_1': { ar: 'معتمد OCDS', de: 'OCDS-verifiziert', fr: 'Vérifié OCDS', tr: 'OCDS Doğrulanmış' },
        'auth_trust_2': { ar: 'تشفير 256-بت', de: '256-Bit verschlüsselt', fr: 'Chiffrement 256 bits', tr: '256-bit Şifreli' },
        'auth_name_placeholder': { ar: 'الاسم الكامل', de: 'Vor- und Nachname', fr: 'Nom complet', tr: 'Ad Soyad' },
        'auth_pw_placeholder': { ar: 'حد أدنى ٨ أحرف، حرف كبير، رقم', de: 'Mind. 8 Zeichen, 1 Großbuchstabe, 1 Zahl', fr: 'Min 8 car., 1 majuscule, 1 chiffre', tr: 'Min 8 karakter, 1 büyük harf, 1 rakam' },
        'auth_confirm_pw_placeholder': { ar: '••••••••', de: '••••••••', fr: '••••••••', tr: '••••••••' },
        'auth_email_placeholder': { ar: 'you@example.com', de: 'name@beispiel.de', fr: 'vous@exemple.com', tr: 'siz@ornek.com' },
        'auth_pw_dots': { ar: '••••••••', de: '••••••••', fr: '••••••••', tr: '••••••••' },
        /* PLAT-P0-002: ho_sr_* keys moved to homeowner.js (misplaced in auth dictionary) */
        'pw_strength_weak': { ar: 'ضعيف', de: 'Schwach', fr: 'Faible', tr: 'Zayıf' },
        'pw_strength_fair': { ar: 'مقبول', de: 'Ausreichend', fr: 'Passable', tr: 'Orta' },
        'pw_strength_good': { ar: 'جيد', de: 'Gut', fr: 'Bon', tr: 'İyi' },
        'pw_strength_strong': { ar: 'قوي', de: 'Stark', fr: 'Fort', tr: 'Güçlü' },
        'pw_strength_too_short': { ar: 'قصير جداً', de: 'Zu kurz', fr: 'Trop court', tr: 'Çok kısa' },
        /* PLAT-P0-002: Role keys and passive footer consent text removed —
           intent cards deleted (P0-CRIT-001), footer removed (CONF-N02). */
        'verify_email_title': { ar: 'جاري التحقق من البريد…', de: 'E-Mail wird verifiziert…', fr: 'Vérification de l\'e-mail…', tr: 'E-posta Doğrulanıyor…' },
        'verify_email_subtitle': { ar: 'يرجى الانتظار بينما نتحقق من بريدك الإلكتروني', de: 'Bitte warten Sie, während wir Ihre E-Mail verifizieren', fr: 'Veuillez patienter pendant la vérification de votre e-mail', tr: 'E-postanız doğrulanırken lütfen bekleyin' },
        'back_to_login': { ar: '→ العودة لتسجيل الدخول', de: '← Zurück zur Anmeldung', fr: '← Retour à la connexion', tr: '← Girişe Dön' },
        'reset_password_title': { ar: 'إعادة تعيين كلمة المرور', de: 'Passwort zurücksetzen', fr: 'Réinitialiser le mot de passe', tr: 'Şifre Sıfırlama' },
        'reset_password_subtitle': { ar: 'أنشئ كلمة مرور جديدة وآمنة لحسابك', de: 'Erstellen Sie ein neues sicheres Passwort für Ihr Konto', fr: 'Créez un nouveau mot de passe sécurisé pour votre compte', tr: 'Hesabınız için yeni güvenli bir şifre oluşturun' },
        'new_password_label': { ar: 'كلمة المرور الجديدة', de: 'Neues Passwort', fr: 'Nouveau mot de passe', tr: 'Yeni Şifre' },
        'confirm_password_label': { ar: 'تأكيد كلمة المرور', de: 'Passwort bestätigen', fr: 'Confirmer le mot de passe', tr: 'Şifreyi Onayla' },
        'reset_password_btn': { ar: 'إعادة تعيين كلمة المرور', de: 'Passwort zurücksetzen', fr: 'Réinitialiser le mot de passe', tr: 'Şifreyi Sıfırla' },
        /* FRC-002 FIX: Password confirmation i18n keys */
        'auth_pw_confirm_placeholder': { ar: 'أعد إدخال كلمة المرور', de: 'Passwort erneut eingeben', fr: 'Ressaisissez le mot de passe', tr: 'Şifreyi tekrar girin' },
        'pw_mismatch_error': { ar: 'كلمتا المرور غير متطابقتين', de: 'Passwörter stimmen nicht überein', fr: 'Les mots de passe ne correspondent pas', tr: 'Şifreler eşleşmiyor' },

        // P0-I18N-001 FIX: Auth orphan key remediation (13 keys)
        'auth_google_sso': { ar: 'المتابعة بحساب Google', de: 'Weiter mit Google', fr: 'Continuer avec Google', tr: 'Google ile devam et' },
        'auth_apple_sso': { ar: 'المتابعة بحساب Apple', de: 'Weiter mit Apple', fr: 'Continuer avec Apple', tr: 'Apple ile devam et' },
        'auth_or_divider': { ar: 'أو', de: 'oder', fr: 'ou', tr: 'veya' },
        'auth_back_home': { ar: 'العودة للرئيسية', de: 'Zur Startseite', fr: 'Retour à l\'accueil', tr: 'Ana Sayfaya Dön' },
        'auth_security_details': { ar: 'تفاصيل الأمان', de: 'Sicherheitsdetails', fr: 'Détails de sécurité', tr: 'Güvenlik Detayları' },
        'auth_terms_required': { ar: 'يجب الموافقة على الشروط', de: 'Zustimmung zu den Bedingungen erforderlich', fr: 'Acceptation des conditions requise', tr: 'Şartların kabul edilmesi gerekli' },
        'remember_me': { ar: 'تذكرني', de: 'Angemeldet bleiben', fr: 'Se souvenir de moi', tr: 'Beni Hatırla' },
        'reg_back': { ar: 'رجوع', de: 'Zurück', fr: 'Retour', tr: 'Geri' },
        'reg_next': { ar: 'التالي', de: 'Weiter', fr: 'Suivant', tr: 'İleri' },
        'reg_step_identity': { ar: 'الهوية', de: 'Identität', fr: 'Identité', tr: 'Kimlik' },
        'reg_step_security': { ar: 'الأمان', de: 'Sicherheit', fr: 'Sécurité', tr: 'Güvenlik' },
        'reg_step_consent': { ar: 'الموافقة', de: 'Zustimmung', fr: 'Consentement', tr: 'Onay' },
        'reg_review_info': { ar: 'راجع معلوماتك قبل إنشاء الحساب', de: 'Überprüfen Sie Ihre Angaben vor der Kontoerstellung', fr: 'Vérifiez vos informations avant de créer le compte', tr: 'Hesap oluşturmadan önce bilgilerinizi kontrol edin' },
        /* DEFER-P0-001: sr-only h1 heading for screen readers */
        'auth_page_heading': { ar: 'تسجيل الدخول أو إنشاء حساب', de: 'Anmelden oder Konto erstellen', fr: 'Connexion ou création de compte', tr: 'Giriş Yap veya Hesap Oluştur' },
        /* DEF-A06 FIX: sr-only <legend> translations for wizard fieldsets */
        'reg_legend_identity': { ar: 'الخطوة ١: هويتك', de: 'Schritt 1: Ihre Identität', fr: 'Étape 1 : Votre identité', tr: 'Adım 1: Kimliğiniz' },
        'reg_legend_security': { ar: 'الخطوة ٢: إنشاء كلمة مرور', de: 'Schritt 2: Passwort erstellen', fr: 'Étape 2 : Créer un mot de passe', tr: 'Adım 2: Şifre Oluşturun' },
        'reg_legend_consent': { ar: 'الخطوة ٣: المراجعة والموافقة', de: 'Schritt 3: Überprüfen und Zustimmen', fr: 'Étape 3 : Vérifier et accepter', tr: 'Adım 3: Gözden Geçir ve Onayla' },
        /* GAP-2026-003 FIX: auth_terms_agree i18n key was MISSING.
           Non-English users saw English-only legal consent text during Step 3.
           Standard: GDPR Art. 7 (Informed Consent), WCAG 3.1.2 (Language of Parts). */
        'auth_terms_agree': { ar: 'أوافق على <a href="/terms.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank">شروط الخدمة</a> و<a href="/privacy.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank">سياسة الخصوصية</a>', de: 'Ich akzeptiere die <a href="/terms.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank">Nutzungsbedingungen</a> und die <a href="/privacy.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank">Datenschutzrichtlinie</a>', fr: 'J\'accepte les <a href="/terms.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank">Conditions d\'utilisation</a> et la <a href="/privacy.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank">Politique de confidentialité</a>', tr: '<a href="/terms.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank">Kullanım Şartlarını</a> ve <a href="/privacy.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank">Gizlilik Politikasını</a> kabul ediyorum' }
        });
    }
})();
