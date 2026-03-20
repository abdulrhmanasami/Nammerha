/**
 * Nammerha i18n — auth dictionary chunk
 * PLAT-P0-002 FIX: Orphan keys purged (13 dead/misplaced keys removed).
 * PLT-F005: Added remember_me_duration key.
 * Keys: 61
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
        /* PLT-F005 FIX: Session duration context for "Remember Me" checkbox.
           Previous: Key missing — Arabic users saw English "30 days" fallback.
           Standard: WCAG 3.3.2 (Labels or Instructions), i18n completeness. */
        'remember_me_duration': { ar: '٣٠ يوم', de: '30 Tage', fr: '30 jours', tr: '30 gün' },
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
        'auth_terms_agree': { ar: 'أوافق على <a href="/terms.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank" rel="noopener noreferrer">شروط الخدمة</a> و<a href="/privacy.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a>', de: 'Ich akzeptiere die <a href="/terms.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank" rel="noopener noreferrer">Nutzungsbedingungen</a> und die <a href="/privacy.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank" rel="noopener noreferrer">Datenschutzrichtlinie</a>', fr: 'J\'accepte les <a href="/terms.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank" rel="noopener noreferrer">Conditions d\'utilisation</a> et la <a href="/privacy.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank" rel="noopener noreferrer">Politique de confidentialité</a>', tr: '<a href="/terms.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank" rel="noopener noreferrer">Kullanım Şartlarını</a> ve <a href="/privacy.html" class="text-trust-blue underline hover:text-trust-blue/80 transition-colors" target="_blank" rel="noopener noreferrer">Gizlilik Politikasını</a> kabul ediyorum' },

        /* PLT-W6: Final 2 orphan keys — auth tab buttons (auth.html L89-90).
           HTML uses data-i18n="sign_in" / "create_account" but dictionary only had
           tab_login / tab_register under different key names. Non-English users
           saw English "Sign In" and "Create Account" on the most critical UI element. */
        'sign_in': { ar: 'تسجيل الدخول', de: 'Anmelden', fr: 'Connexion', tr: 'Giriş Yap' },
        'create_account': { ar: 'إنشاء حساب', de: 'Konto erstellen', fr: 'Créer un compte', tr: 'Hesap Oluştur' },

        // ═══ PLT-W7: auth.ts t() dynamic keys — validation, feedback, flows ═══
        'auth_email_required': { ar: 'البريد الإلكتروني مطلوب', de: 'E-Mail erforderlich', fr: 'E-mail requis', tr: 'E-posta gerekli' },
        'auth_email_invalid': { ar: 'البريد الإلكتروني غير صالح', de: 'Ungültige E-Mail', fr: 'E-mail invalide', tr: 'Geçersiz e-posta' },
        'auth_name_required': { ar: 'الاسم مطلوب', de: 'Name erforderlich', fr: 'Nom requis', tr: 'Ad gerekli' },
        'auth_password_weak': { ar: 'كلمة المرور ضعيفة', de: 'Passwort zu schwach', fr: 'Mot de passe faible', tr: 'Şifre zayıf' },
        'auth_password_complexity': { ar: 'كلمة المرور لا تستوفي المتطلبات', de: 'Passwort erfüllt die Anforderungen nicht', fr: 'Le mot de passe ne remplit pas les exigences', tr: 'Şifre gereksinimleri karşılamıyor' },
        'auth_fill_all_fields': { ar: 'يرجى ملء جميع الحقول', de: 'Bitte alle Felder ausfüllen', fr: 'Veuillez remplir tous les champs', tr: 'Lütfen tüm alanları doldurun' },
        'auth_enter_email_password': { ar: 'أدخل البريد الإلكتروني وكلمة المرور', de: 'E-Mail und Passwort eingeben', fr: 'Saisissez e-mail et mot de passe', tr: 'E-posta ve şifre girin' },
        'auth_signing_in': { ar: 'جاري تسجيل الدخول…', de: 'Anmeldung läuft…', fr: 'Connexion en cours…', tr: 'Giriş yapılıyor…' },
        'auth_creating_account': { ar: 'جاري إنشاء الحساب…', de: 'Konto wird erstellt…', fr: 'Création du compte…', tr: 'Hesap oluşturuluyor…' },
        'auth_login_failed': { ar: 'فشل تسجيل الدخول', de: 'Anmeldung fehlgeschlagen', fr: 'Échec de la connexion', tr: 'Giriş başarısız' },
        'auth_reg_failed': { ar: 'فشل إنشاء الحساب', de: 'Registrierung fehlgeschlagen', fr: 'Échec de l\'inscription', tr: 'Kayıt başarısız' },
        'auth_reg_success': { ar: 'تم إنشاء حسابك بنجاح!', de: 'Konto erfolgreich erstellt!', fr: 'Compte créé avec succès !', tr: 'Hesap başarıyla oluşturuldu!' },
        'auth_welcome_back': { ar: 'أهلاً بعودتك!', de: 'Willkommen zurück!', fr: 'Bon retour !', tr: 'Tekrar hoş geldiniz!' },
        'auth_network_error': { ar: 'خطأ في الشبكة. حاول مرة أخرى.', de: 'Netzwerkfehler. Bitte erneut versuchen.', fr: 'Erreur réseau. Veuillez réessayer.', tr: 'Ağ hatası. Tekrar deneyin.' },
        'auth_forgot_enter_email': { ar: 'أدخل بريدك الإلكتروني', de: 'Geben Sie Ihre E-Mail ein', fr: 'Saisissez votre e-mail', tr: 'E-postanızı girin' },
        'auth_forgot_sending': { ar: 'جاري الإرسال…', de: 'Wird gesendet…', fr: 'Envoi en cours…', tr: 'Gönderiliyor…' },
        'auth_forgot_sent': { ar: 'تم إرسال رابط إعادة التعيين!', de: 'Link zum Zurücksetzen gesendet!', fr: 'Lien de réinitialisation envoyé !', tr: 'Sıfırlama bağlantısı gönderildi!' },
        'auth_forgot_error': { ar: 'فشل الإرسال. حاول مرة أخرى.', de: 'Senden fehlgeschlagen. Bitte erneut versuchen.', fr: 'Échec de l\'envoi. Veuillez réessayer.', tr: 'Gönderim başarısız. Tekrar deneyin.' },
        'auth_forgot_link_text': { ar: 'إرسال رابط إعادة التعيين', de: 'Link zum Zurücksetzen senden', fr: 'Envoyer le lien de réinitialisation', tr: 'Sıfırlama bağlantısı gönder' },
        'auth_sso_coming_soon': { ar: 'قريباً — لم يتم تفعيله بعد', de: 'Demnächst — noch nicht aktiviert', fr: 'Bientôt — pas encore activé', tr: 'Yakında — henüz etkinleştirilmedi' },

        // ═══ PLT-W8: verify-email.ts t() keys ═══
        'verify_success_title': { ar: 'تم التحقق!', de: 'Verifiziert!', fr: 'Vérifié !', tr: 'Doğrulandı!' },
        'verify_success_body': { ar: 'تم تأكيد بريدك الإلكتروني بنجاح', de: 'Ihre E-Mail wurde erfolgreich bestätigt', fr: 'Votre e-mail a été confirmé', tr: 'E-postanız başarıyla onaylandı' },
        'verify_expired_title': { ar: 'انتهت صلاحية الرابط', de: 'Link abgelaufen', fr: 'Lien expiré', tr: 'Bağlantı süresi doldu' },
        'verify_expired_body': { ar: 'يرجى طلب رابط تحقق جديد', de: 'Bitte fordern Sie einen neuen Link an', fr: 'Veuillez demander un nouveau lien', tr: 'Lütfen yeni bir doğrulama bağlantısı isteyin' },
        'verify_failed_title': { ar: 'فشل التحقق', de: 'Verifizierung fehlgeschlagen', fr: 'Vérification échouée', tr: 'Doğrulama başarısız' },
        'verify_failed_body': { ar: 'لم نتمكن من التحقق من بريدك', de: 'Ihre E-Mail konnte nicht verifiziert werden', fr: 'Impossible de vérifier votre e-mail', tr: 'E-postanız doğrulanamadı' },
        'verify_not_found_title': { ar: 'الحساب غير موجود', de: 'Konto nicht gefunden', fr: 'Compte introuvable', tr: 'Hesap bulunamadı' },
        'verify_not_found_body': { ar: 'لم نعثر على حساب بهذا البريد', de: 'Kein Konto mit dieser E-Mail gefunden', fr: 'Aucun compte trouvé avec cet e-mail', tr: 'Bu e-posta ile hesap bulunamadı' },
        'verify_timeout_title': { ar: 'انقطع الاتصال', de: 'Zeitüberschreitung', fr: 'Délai expiré', tr: 'Zaman aşımı' },
        'verify_timeout_body': { ar: 'حاول مرة أخرى لاحقاً', de: 'Bitte versuchen Sie es später erneut', fr: 'Veuillez réessayer plus tard', tr: 'Lütfen daha sonra tekrar deneyin' },
        'verify_invalid_link': { ar: 'رابط تحقق غير صالح', de: 'Ungültiger Verifizierungslink', fr: 'Lien de vérification invalide', tr: 'Geçersiz doğrulama bağlantısı' },
        'verify_no_token': { ar: 'الرمز مفقود', de: 'Token fehlt', fr: 'Jeton manquant', tr: 'Token eksik' },
        'verify_network_error': { ar: 'خطأ في الشبكة', de: 'Netzwerkfehler', fr: 'Erreur réseau', tr: 'Ağ hatası' },
        'verify_server_unreachable': { ar: 'لا يمكن الوصول للخادم', de: 'Server nicht erreichbar', fr: 'Serveur inaccessible', tr: 'Sunucuya ulaşılamıyor' },
        'verify_resend_enter_email': { ar: 'أدخل بريدك لإعادة الإرسال', de: 'E-Mail eingeben zum erneuten Senden', fr: 'Saisissez votre e-mail pour renvoyer', tr: 'Yeniden göndermek için e-postanızı girin' },
        'verify_resend_sending': { ar: 'جاري إعادة الإرسال…', de: 'Wird erneut gesendet…', fr: 'Renvoi en cours…', tr: 'Yeniden gönderiliyor…' },
        'verify_resend_success': { ar: 'تم إعادة إرسال رابط التحقق', de: 'Verifizierungslink erneut gesendet', fr: 'Lien de vérification renvoyé', tr: 'Doğrulama bağlantısı yeniden gönderildi' },
        'verify_resend_failed': { ar: 'فشلت إعادة الإرسال', de: 'Erneutes Senden fehlgeschlagen', fr: 'Échec du renvoi', tr: 'Yeniden gönderim başarısız' },
        'verify_resend_network_error': { ar: 'خطأ في الشبكة أثناء الإرسال', de: 'Netzwerkfehler beim Senden', fr: 'Erreur réseau lors de l\'envoi', tr: 'Gönderim sırasında ağ hatası' },

        // ═══ PLT-W8: reset-password.ts t() keys ═══
        'reset_submit_btn': { ar: 'إعادة تعيين', de: 'Zurücksetzen', fr: 'Réinitialiser', tr: 'Sıfırla' },
        'reset_resetting': { ar: 'جاري إعادة التعيين…', de: 'Wird zurückgesetzt…', fr: 'Réinitialisation…', tr: 'Sıfırlanıyor…' },
        'reset_success': { ar: 'تم تغيير كلمة المرور بنجاح', de: 'Passwort erfolgreich geändert', fr: 'Mot de passe modifié avec succès', tr: 'Şifre başarıyla değiştirildi' },
        'reset_failed': { ar: 'فشلت إعادة التعيين', de: 'Zurücksetzen fehlgeschlagen', fr: 'Échec de la réinitialisation', tr: 'Sıfırlama başarısız' },
        'reset_invalid_token': { ar: 'الرمز غير صالح أو منتهٍ', de: 'Token ungültig oder abgelaufen', fr: 'Jeton invalide ou expiré', tr: 'Token geçersiz veya süresi dolmuş' },
        'reset_timeout': { ar: 'انقطع الاتصال', de: 'Zeitüberschreitung', fr: 'Délai expiré', tr: 'Zaman aşımı' },
        'reset_network_error': { ar: 'خطأ في الشبكة', de: 'Netzwerkfehler', fr: 'Erreur réseau', tr: 'Ağ hatası' },
        'reset_password_mismatch': { ar: 'كلمتا المرور غير متطابقتين', de: 'Passwörter stimmen nicht überein', fr: 'Les mots de passe ne correspondent pas', tr: 'Şifreler eşleşmiyor' },
        'reset_password_weak': { ar: 'كلمة المرور ضعيفة جداً', de: 'Passwort zu schwach', fr: 'Mot de passe trop faible', tr: 'Şifre çok zayıf' }
        });
    }
})();
