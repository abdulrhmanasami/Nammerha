import '../network/api_client.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Centralized Error Localization — Arabic UI Error Mapping
/// ═══════════════════════════════════════════════════════════════════════════
/// Maps English backend API error messages to user-facing Arabic.
/// Used by ALL screens to ensure zero English leakage in the UI.
/// ═══════════════════════════════════════════════════════════════════════════

/// Converts an English API error message to user-facing Arabic.
String localizeApiError(String message) {
  final lower = message.toLowerCase();

  // Activation / KYC
  if (lower.contains('not activated') ||
      lower.contains('kyc') ||
      lower.contains('not active') ||
      lower.contains('account is not active')) {
    return 'الحساب غير مفعّل. يرجى إكمال التحقق من الهوية (KYC).';
  }

  // Authorization / Forbidden
  if (lower.contains('not authorized') ||
      lower.contains('forbidden') ||
      lower.contains('access denied') ||
      lower.contains('unauthorized') ||
      lower.contains('permission denied')) {
    return 'ليس لديك صلاحية للوصول لهذه الصفحة.';
  }

  // Not found
  if (lower.contains('not found') || lower.contains('404')) {
    return 'لم يتم العثور على البيانات المطلوبة.';
  }

  // CSRF
  if (lower.contains('csrf') || lower.contains('token')) {
    return 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.';
  }

  // Network / Timeout
  if (lower.contains('network') ||
      lower.contains('timeout') ||
      lower.contains('etimedout') ||
      lower.contains('econnrefused') ||
      lower.contains('socket') ||
      lower.contains('connection')) {
    return 'خطأ في الاتصال بالشبكة. تحقق من اتصالك بالإنترنت.';
  }

  // Rate limiting
  if (lower.contains('rate limit') || lower.contains('too many')) {
    return 'عدد محاولات كثيرة. حاول مرة أخرى بعد قليل.';
  }

  // Server error
  if (lower.contains('internal server') || lower.contains('500')) {
    return 'حدث خطأ في الخادم. حاول مرة أخرى لاحقاً.';
  }

  // Validation
  if (lower.contains('validation') || lower.contains('invalid')) {
    return 'بيانات غير صالحة. يرجى التحقق من المدخلات.';
  }

  // Default fallback
  return 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

/// Localizes an [ApiException] to an Arabic user-facing message.
String localizeApiException(ApiException e) {
  return localizeApiError(e.message);
}
