// ============================================================================
// Nammerha — Error Key Constants (Wave 4: BLoC i18n Architecture)
// ============================================================================
// BLoC layers cannot access BuildContext, so they emit ERROR KEYS instead of
// translated strings. The UI layer translates via context.tr(key).
//
// Pattern:
//   BLoC: emit(AuthError(ErrorKeys.loginFailed));
//   UI:   Text(context.tr(state.message))
//
// Standard: Platinum i18n — zero hardcoded Arabic in business logic layer
// ============================================================================

/// Centralized error key constants for type-safe BLoC → UI error messaging.
/// All keys MUST have corresponding entries in translations.dart.
abstract final class ErrorKeys {
  // ─── Auth ───────────────────────────────────────────────────────────────
  static const loginFailed = 'err_login_failed';
  static const registerFailed = 'err_register_failed';
  static const verifyEmail = 'err_verify_email';
  static const invalidCredentials = 'err_invalid_credentials';
  static const accountLocked = 'err_account_locked';
  static const authRequired = 'err_auth_required';
  static const sessionExpired = 'err_session_expired';
  static const tokenInvalidated = 'err_token_invalidated';
  static const invalidToken = 'err_invalid_token';
  static const missingFields = 'err_missing_fields';
  static const tooManyRequests = 'err_too_many_requests';
  static const serverError = 'err_server';
  static const notFound = 'err_not_found';
  static const unauthorized = 'err_unauthorized';
  static const profileRequired = 'err_profile_required';

  // ─── P2-W5-001: Backend Error Unification — New Keys ───────────────────
  static const emailTooLong = 'err_email_too_long';
  static const invalidEmailFormat = 'err_invalid_email_format';
  static const passwordTooLong = 'err_password_too_long';
  static const incorrectPassword = 'err_incorrect_password';
  static const passwordSameAsOld = 'err_password_same_as_old';
  static const socialOnlyAccount = 'err_social_only_account';
  static const tokenExpired = 'err_token_expired';

  // ─── Auth Success Messages ──────────────────────────────────────────────
  // P0-AUD-001 FIX: Keys for auth_repository.dart fallback messages.
  // Replaces hardcoded Arabic strings that bypassed i18n entirely.
  static const verificationLinkSent = 'msg_verification_link_sent';
  static const resetLinkSent = 'msg_reset_link_sent';
  static const passwordChanged = 'msg_password_changed';
  static const resendVerificationSent = 'msg_resend_verification_sent';

  // ─── Verify Email (Deep Link Screen) ───────────────────────────────────
  // P1-VE-001 FIX: Replaces 4 hardcoded Arabic strings in verify_email_bloc.dart.
  // BLoC emits these keys → UI resolves via context.tr().
  static const verifyEmailInvalidToken = 'err_verify_email_invalid_token';
  static const verifyEmailSuccess = 'msg_verify_email_success';
  static const verifyEmailExpired = 'err_verify_email_expired';
  static const verifyEmailFailed = 'err_verify_email_failed';
  static const verifyEmailResent = 'msg_verify_email_resent';
  static const verifyEmailResendFailed = 'err_verify_email_resend_failed';

  // ─── Generic ────────────────────────────────────────────────────────────
  static const generic = 'err_generic';
  static const network = 'err_network';
  static const actionFailed = 'err_action_failed';
  static const submitFailed = 'err_submit_failed';
  static const loadFailed = 'err_load_failed';
  static const saveFailed = 'err_save_failed';

  // ─── Admin ──────────────────────────────────────────────────────────────
  static const escrowReleaseSuccess = 'err_escrow_release_success';
  static const kycVerified = 'err_kyc_verified';
  static const kycRejected = 'err_kyc_rejected';
  static const adminLoadStatsFailed = 'err_admin_load_stats_failed';

  // ─── Bids ───────────────────────────────────────────────────────────────
  static const loadBids = 'err_load_bids';
  static const bidSubmitted = 'msg_bid_submitted';
  static const bidFailed = 'err_bid_failed';

  // ─── Checkout / Cart ───────────────────────────────────────────────────
  static const checkoutGeneric = 'err_checkout_generic';
  static const checkoutNetwork = 'err_checkout_network';

  // ─── Compliance (OFAC/SDN) ─────────────────────────────────────────────
  static const complianceClear = 'msg_compliance_clear';
  static const complianceScanFailed = 'err_compliance_scan_failed';
  static const complianceApprovalFailed = 'err_compliance_approval_failed';
  static const complianceReportFailed = 'err_compliance_report_failed';

  // ─── Damage Report ────────────────────────────────────────────────────
  static const damageReportFailed = 'err_damage_report_failed';
  static const gpsPermissionRequired = 'err_gps_permission_required';

  // ─── Map ───────────────────────────────────────────────────────────────
  static const mapLoadFailed = 'err_map_load_failed';

  // ─── Project Dashboard ────────────────────────────────────────────────
  static const projectDashboardFailed = 'err_project_dashboard_failed';
  static const projectLogFailed = 'err_project_log_failed';
  static const projectApprovalFailed = 'err_project_approval_failed';
  static const projectApprovalResponseFailed = 'err_project_approval_response_failed';

  // ─── Reality Capture (360°) ───────────────────────────────────────────
  static const captureLoadFailed = 'err_capture_load_failed';
  static const captureEncrypting = 'msg_capture_encrypting';
  static const captureUploading = 'msg_capture_uploading';
  static const captureSuccess = 'msg_capture_success';
  static const captureUploadFailed = 'err_capture_upload_failed';
  static const captureHiddenWorkFailed = 'err_capture_hidden_work_failed';

  // ─── Reviews ──────────────────────────────────────────────────────────
  static const reviewLoadFailed = 'err_review_load_failed';
  static const reviewSubmitFailed = 'err_review_submit_failed';
  static const reviewVoteFailed = 'err_review_vote_failed';
  static const reviewReportFailed = 'err_review_report_failed';
  static const reviewDeleteFailed = 'err_review_delete_failed';

  // ─── BOQ (Engineer) ───────────────────────────────────────────────────
  static const boqLoadFailed = 'err_boq_load_failed';
  static const boqPublishFailed = 'err_boq_publish_failed';

  // ─── Homeowner ─────────────────────────────────────────────────────────
  static const homeownerLoadFailed = 'err_homeowner_load_failed';
  static const homeownerActionFailed = 'err_homeowner_action_failed';
  static const homeownerCancelFailed = 'err_homeowner_cancel_failed';

  // ─── Tradesperson ─────────────────────────────────────────────────────
  static const tradespersonLoadFailed = 'err_tradesperson_load_failed';
  static const tradespersonProfileFailed = 'err_tradesperson_profile_failed';
  static const tradespersonAvailabilityFailed = 'err_tradesperson_availability_failed';
  static const tradespersonTaskAccepted = 'msg_tradesperson_task_accepted';
  static const tradespersonTaskFailed = 'err_tradesperson_task_failed';
  static const tradespersonTaskRejected = 'msg_tradesperson_task_rejected';

  // ─── Profile ──────────────────────────────────────────────────────────
  static const profileSaveFailed = 'err_profile_save_failed';

  // ─── Currency ─────────────────────────────────────────────────────────
  static const currencySuffix = 'currency_syp';
}
