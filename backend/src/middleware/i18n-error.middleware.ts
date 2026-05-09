// ============================================================================
// Nammerha Backend — I18N Error Response Middleware (I18N-004)
// ============================================================================
// Intercepts ALL JSON error responses and translates English messages to Arabic
// when the client sends Accept-Language: ar. This eliminates the need to
// modify 192+ individual error strings across 37 route files.
//
// Architecture: Monkey-patches res.json() to inspect outgoing payloads.
// Only translates when: (1) status >= 400, (2) payload has 'error' field,
// (3) Accept-Language starts with 'ar'.
// ============================================================================

import { Request, Response, NextFunction } from 'express';

/** Detects Arabic locale from Accept-Language header */
function isArabicClient(req: Request): boolean {
    const lang = req.headers['accept-language'] ?? '';
    return lang.startsWith('ar');
}

// ─── Translation Map ────────────────────────────────────────────────────────
// Exact matches first, then pattern-based fallbacks.
// Keys are lowercase for case-insensitive matching.

const EXACT_TRANSLATIONS: Record<string, string> = {
    // Auth
    'authentication required': 'يجب تسجيل الدخول',
    'authentication failed': 'فشل التحقق من الهوية',
    'unauthorized': 'غير مصرح',
    'token expired': 'انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً',
    'invalid token': 'رمز غير صالح',
    'invalid session': 'جلسة غير صالحة',
    'session expired — please log in again': 'انتهت الجلسة — يرجى تسجيل الدخول مجدداً',
    'token invalidated — please log in again': 'تم إلغاء الجلسة — يرجى تسجيل الدخول مجدداً',
    'user not found': 'المستخدم غير موجود',
    'invalid email format': 'صيغة البريد الإلكتروني غير صحيحة',
    'email is required': 'البريد الإلكتروني مطلوب',
    'invalid verification token': 'رمز التحقق غير صالح',
    'verification token not found or already used': 'رمز التحقق غير موجود أو مستخدم مسبقاً',
    'invalid or expired reset token': 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية',
    'token and new password are required': 'الرمز وكلمة المرور الجديدة مطلوبان',
    'new password must be different from current password': 'يجب أن تختلف كلمة المرور الجديدة عن الحالية',
    'current password is incorrect': 'كلمة المرور الحالية غير صحيحة',
    'current password and new password are required': 'كلمة المرور الحالية والجديدة مطلوبتان',
    'endpoint not found': 'المسار غير موجود',
    'internal server error': 'خطأ في الخادم',

    // Roles
    'role is required': 'الدور مطلوب',
    'role not found': 'الدور غير موجود',
    'you already have this role': 'لديك هذا الدور مسبقاً',
    'this role cannot be self-assigned': 'لا يمكن تعيين هذا الدور ذاتياً',
    'you do not have this role activated': 'هذا الدور غير مفعّل لديك',
    'failed to activate role': 'فشل تفعيل الدور',
    'failed to fetch roles': 'فشل جلب الأدوار',
    'failed to switch role': 'فشل تبديل الدور',

    // Mobile Guard
    'missing x-app-version header. please update your app.': 'هيدر إصدار التطبيق مفقود. يرجى تحديث التطبيق.',
    'missing x-api-version header. please update your app.': 'هيدر إصدار الواجهة مفقود. يرجى تحديث التطبيق.',

    // Projects & Donations
    'missing projectid': 'معرّف المشروع مطلوب',
    'project id required': 'معرّف المشروع مطلوب',
    'payment not found': 'الدفعة غير موجودة',
    'file not found': 'الملف غير موجود',
    'file key is required': 'مفتاح الملف مطلوب',
    'missing file key': 'مفتاح الملف مفقود',

    // Reviews
    'review not found': 'المراجعة غير موجودة',
    'review not found or already removed': 'المراجعة غير موجودة أو تمت إزالتها',
    'cannot review yourself': 'لا يمكنك مراجعة نفسك',
    'you can only edit your own reviews': 'يمكنك تعديل مراجعاتك فقط',
    'you have already reviewed this entity': 'لقد راجعت هذا الكيان مسبقاً',
    'you have already reported this review': 'لقد أبلغت عن هذه المراجعة مسبقاً',
    'only the reviewed party can respond': 'فقط الطرف المُراجَع يمكنه الرد',
    'response already exists for this review': 'يوجد رد مسبق لهذه المراجعة',
    'invalid reviewable type': 'نوع الكيان المُراجَع غير صالح',
    'invalid reviewable_type': 'نوع الكيان المُراجَع غير صالح',
    'invalid profile type for review': 'نوع الملف الشخصي غير صالح للمراجعة',

    // Storage
    'storage health check failed': 'فشل فحص صحة التخزين',
    'key id is required': 'معرّف المفتاح مطلوب',

    // Compliance
    'term not found': 'المصطلح غير موجود',
    'zone not found': 'المنطقة غير موجودة',
    'zone id required': 'معرّف المنطقة مطلوب',
    'imagery id required': 'معرّف الصورة مطلوب',
    'imagery not found': 'الصورة غير موجودة',

    // Subscriptions
    'planid is required': 'معرّف الخطة مطلوب',
    'invalid csp report': 'تقرير CSP غير صالح',
    'invalid error report payload': 'بيانات تقرير الخطأ غير صالحة',
    'invalid webhook signature': 'توقيع الويب هوك غير صالح',
    'missing required webhook fields': 'حقول الويب هوك المطلوبة مفقودة',
    'page not found.': 'الصفحة غير موجودة.',
    'unsupported locale.': 'اللغة غير مدعومة.',
    'path traversal denied.': 'محاولة وصول غير مشروعة.',
    'message not found or already read': 'الرسالة غير موجودة أو تمت قراءتها',
};

// ─── Pattern-Based Translations ─────────────────────────────────────────────
// For dynamic messages (containing variables like ${minutesLeft})

const PATTERN_TRANSLATIONS: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
    [/^missing required fields?:?\s/i, 'الحقول المطلوبة مفقودة'],
    [/^required:?\s/i, 'حقول مطلوبة مفقودة'],
    [/too many (?:requests?|verification attempts|error reports)/i, 'طلبات كثيرة جداً — حاول مرة أخرى لاحقاً'],
    [/verify your email/i, 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول. تحقق من صندوق الوارد للحصول على رابط التحقق.'],
    [/verification token has expired/i, 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.'],
    [/reset token has expired/i, 'انتهت صلاحية رمز إعادة التعيين. يرجى طلب رمز جديد.'],
    [/this version of the app is no longer supported/i, 'هذا الإصدار من التطبيق لم يعد مدعوماً. يرجى التحديث من متجر التطبيقات.'],
    [/app version .+ is deprecated/i, 'إصدار التطبيق قديم. يرجى التحديث.'],
    [/account temporarily locked/i, 'الحساب مقفل مؤقتاً — حاول مرة أخرى لاحقاً'],
    [/invalid email or password/i, 'البريد الإلكتروني أو كلمة المرور غير صحيحة'],
    [/profile setup required/i, 'يجب إكمال الملف الشخصي قبل القيام بهذه العملية.'],
    [/account not activated/i, 'الحساب غير مفعّل. يجب التحقق من الهوية (KYC).'],
    [/this feature requires a premium subscription/i, 'هذه الميزة تتطلب اشتراكاً مدفوعاً.'],
    [/unable to verify/i, 'تعذر التحقق — حاول مرة أخرى.'],
    [/idempotency.key reused/i, 'مفتاح التكرار مُستخدم مع بيانات مختلفة'],
    [/request is currently processing/i, 'الطلب قيد المعالجة. يرجى المحاولة بعد لحظات.'],
    [/daily api quota exceeded/i, 'تم تجاوز الحصة اليومية — حاول غداً أو تواصل مع الدعم.'],
    [/edit window has expired/i, 'انتهت فترة التعديل المسموحة'],
    [/must be (?:between|at least|an? )/i, (m) => `خطأ في التحقق: ${m[0]}`],
    [/unsupported payment method/i, 'طريقة الدفع غير مدعومة. المتاح: فيزا، فاتورة.'],
    [/invalid gateway/i, 'بوابة الدفع غير صالحة. المتاح: visa, fatora'],
    [/x-api-key header is required/i, 'مفتاح الـ API مطلوب للوصول المؤسسي'],
    [/invalid or inactive api key/i, 'مفتاح الـ API غير صالح أو غير مفعّل'],
];

/**
 * Translates an English error message to Arabic.
 * Returns the original message if no translation is found.
 */
function translateError(message: string): string {
    // 1. Try exact match (case-insensitive)
    const exact = EXACT_TRANSLATIONS[message.toLowerCase()];
    if (exact) {return exact;}

    // 2. Try pattern match
    for (const [pattern, translation] of PATTERN_TRANSLATIONS) {
        const match = message.match(pattern);
        if (match) {
            return typeof translation === 'function' ? translation(match) : translation;
        }
    }

    // 3. No translation found — return original
    return message;
}

/**
 * I18N Error Middleware.
 * Intercepts res.json() to translate error messages for Arabic clients.
 */
export function i18nErrorMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Only intercept for Arabic clients
    if (!isArabicClient(req)) {
        next();
        return;
    }

    // Monkey-patch res.json to intercept error responses
    const originalJson = res.json.bind(res);

    res.json = function (body: Record<string, unknown>) {
        // Only translate error responses (status >= 400 with an 'error' field)
        if (res.statusCode >= 400 && body && typeof body === 'object' && typeof body['error'] === 'string') {
            const translated = translateError(body['error'] as string);
            if (translated !== body['error']) {
                body = { ...body, error: translated };
            }
        }
        return originalJson(body);
    } as typeof res.json;

    next();
}
