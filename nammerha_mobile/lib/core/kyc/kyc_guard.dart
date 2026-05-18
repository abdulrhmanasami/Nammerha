import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../features/auth/bloc/auth_bloc.dart';
import '../../features/auth/repositories/auth_repository.dart';
import '../i18n/t.dart';
import '../theme/semantic_colors.dart';
import '../widgets/bottom_sheet_grabber.dart';
import '../utils/animation_budget.dart';
import '../bloc/page_index_cubit.dart';
import 'kyc_level.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// P0-003: KYC Guard — Progressive Profiling Gate
/// ═══════════════════════════════════════════════════════════════════════════
/// Intercepts sensitive actions and shows a contextual bottom sheet when the
/// user's KYC level is insufficient. Returns true if allowed, false if blocked.
///
/// Usage:
/// ```dart
/// onTap: () async {
///   if (!await KycGuard.check(context, KycRequirements.submitBid)) return;
///   Navigator.push(context, ...);
/// }
/// ```
///
/// Architecture:
/// - Reads NammerhaUser from AuthBloc (app-root, always available)
/// - Compares user's resolved KYC level against the required level
/// - Shows a premium bottom sheet with:
///   • Visual step indicator (guest → verified → profiled → kycApproved)
///   • Current level highlighted
///   • Required level explanation
///   • Direct action CTA (verify email / complete profile / upload docs)
///
/// Standards:
///   - FATF Recommendation 10 (CDD - Customer Due Diligence)
///   - Nielsen #1 (Visibility of system status)
///   - WCAG AAA (contrast, screen reader labels)
///   - RTL: All spacing via EdgeInsetsDirectional, text via context.tr()
/// ═══════════════════════════════════════════════════════════════════════════
class KycGuard {
  KycGuard._();

  /// Check if the current user meets the required KYC level.
  /// Returns `true` if the user is allowed to proceed.
  /// Shows a gate bottom sheet and returns `false` if blocked.
  static Future<bool> check(BuildContext context, KycLevel required) async {
    final authState = context.read<AuthBloc>().state;

    // Not authenticated — shouldn't happen (user is on dashboard), but defend.
    if (authState is! AuthAuthenticated) return false;

    final user = authState.user;
    final currentLevel = resolveKycLevel(user);

    if (currentLevel >= required) return true;

    // User doesn't meet the requirement — show the gate.
    HapticFeedback.mediumImpact();
    await _showGateSheet(context, user, currentLevel, required);
    return false;
  }

  /// Shows the KYC gate bottom sheet with progressive disclosure.
  static Future<void> _showGateSheet(
    BuildContext context,
    NammerhaUser user,
    KycLevel currentLevel,
    KycLevel requiredLevel,
  ) {
    final colors = context.colors;

    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) {
        return Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.65,
          ),
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                BottomSheetGrabber(colors: colors),
                Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(24, 8, 24, 24),
                  child: Column(
                    children: [
                      // Shield icon
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: colors.warning.withAlpha(15),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          PhosphorIconsRegular.shieldWarning,
                          size: 36,
                          color: colors.warning,
                        ),
                      ).nmAnimate(sheetCtx).fadeIn(duration: 400.ms).scale(
                            begin: const Offset(0.8, 0.8),
                            end: const Offset(1.0, 1.0),
                          ),
                      const SizedBox(height: 16),

                      // Title
                      Text(
                        context.tr('kyc_gate_title'),
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: colors.textPrimary,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),

                      // Subtitle
                      Text(
                        context.tr('kyc_gate_subtitle'),
                        style: TextStyle(
                          fontSize: 14,
                          color: colors.textSecondary,
                          height: 1.5,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 24),

                      // Progress steps
                      _buildProgressSteps(context, colors, currentLevel, requiredLevel),
                      const SizedBox(height: 24),

                      // Action required card
                      _buildActionCard(context, colors, currentLevel, requiredLevel),
                      const SizedBox(height: 16),

                      // CTA button
                      _buildCtaButton(context, sheetCtx, colors, currentLevel),
                      const SizedBox(height: 8),

                      // Dismiss button
                      TextButton(
                        onPressed: () => Navigator.pop(sheetCtx),
                        child: Text(
                          context.tr('kyc_gate_later'),
                          style: TextStyle(
                            color: colors.textSecondary,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Builds the visual 4-step KYC progress indicator.
  static Widget _buildProgressSteps(
    BuildContext context,
    SemanticColors colors,
    KycLevel current,
    KycLevel required,
  ) {
    final steps = [
      _KycStep(
        KycLevel.guest,
        context.tr('kyc_step_registered'),
        PhosphorIconsRegular.userPlus,
      ),
      _KycStep(
        KycLevel.verified,
        context.tr('kyc_step_email_verified'),
        PhosphorIconsRegular.envelopeSimple,
      ),
      _KycStep(
        KycLevel.profiled,
        context.tr('kyc_step_profile_complete'),
        PhosphorIconsRegular.identificationCard,
      ),
      _KycStep(
        KycLevel.kycApproved,
        context.tr('kyc_step_kyc_approved'),
        PhosphorIconsRegular.sealCheck,
      ),
    ];

    return Column(
      children: List.generate(steps.length, (index) {
        final step = steps[index];
        final isCompleted = current >= step.level;
        final isRequired = step.level.value <= required.value;
        final isNext =
            step.level.value == current.value + 1 && step.level.value <= required.value;

        return Padding(
          padding: EdgeInsets.only(bottom: index < steps.length - 1 ? 0 : 0),
          child: Row(
            children: [
              // Step indicator circle
              Column(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: isCompleted
                          ? colors.success
                          : isNext
                              ? colors.warning
                              : colors.backgroundSecondary,
                      shape: BoxShape.circle,
                      border: isRequired && !isCompleted
                          ? Border.all(
                              color: isNext
                                  ? colors.warning
                                  : colors.strokeSubtle,
                              width: 2,
                            )
                          : null,
                    ),
                    child: Icon(
                      isCompleted
                          ? PhosphorIconsRegular.check
                          : step.icon,
                      size: 16,
                      color: isCompleted
                          ? Colors.white
                          : isNext
                              ? colors.warning
                              : colors.textSubtle,
                    ),
                  ),
                  if (index < steps.length - 1)
                    Container(
                      width: 2,
                      height: 20,
                      color: isCompleted
                          ? colors.success.withAlpha(60)
                          : colors.strokeSubtle.withAlpha(60),
                    ),
                ],
              ),
              const SizedBox(width: 14),
              // Step label
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    bottom: index < steps.length - 1 ? 20 : 0,
                  ),
                  child: Text(
                    step.label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight:
                          isCompleted || isNext ? FontWeight.w700 : FontWeight.w500,
                      color: isCompleted
                          ? colors.success
                          : isNext
                              ? colors.warning
                              : colors.textSubtle,
                    ),
                  ),
                ),
              ),
              // Checkmark for completed steps
              if (isCompleted)
                Padding(
                  padding: EdgeInsets.only(
                    bottom: index < steps.length - 1 ? 20 : 0,
                  ),
                  child: Icon(
                    PhosphorIconsRegular.checkCircle,
                    size: 18,
                    color: colors.success,
                  ),
                ),
            ],
          ),
        );
      }),
    );
  }

  /// Builds the contextual action card explaining what the user needs.
  static Widget _buildActionCard(
    BuildContext context,
    SemanticColors colors,
    KycLevel current,
    KycLevel required,
  ) {
    final String messageKey;
    final IconData icon;
    final Color accentColor;

    if (current < KycLevel.verified) {
      messageKey = 'kyc_action_verify_email';
      icon = PhosphorIconsRegular.envelopeSimple;
      accentColor = colors.primaryBrand;
    } else if (current < KycLevel.profiled) {
      messageKey = 'kyc_action_complete_profile';
      icon = PhosphorIconsRegular.identificationCard;
      accentColor = colors.warning;
    } else {
      messageKey = 'kyc_action_submit_docs';
      icon = PhosphorIconsRegular.fileArrowUp;
      accentColor = colors.secondaryAccent;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: accentColor.withAlpha(8),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accentColor.withAlpha(30)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: accentColor.withAlpha(20),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 22, color: accentColor),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              context.tr(messageKey),
              style: TextStyle(
                fontSize: 13,
                color: colors.textPrimary,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Builds the primary CTA button based on the next required action.
  static Widget _buildCtaButton(
    BuildContext context,
    BuildContext sheetCtx,
    SemanticColors colors,
    KycLevel current,
  ) {
    final String labelKey;
    final IconData icon;

    if (current < KycLevel.verified) {
      labelKey = 'kyc_cta_verify_email';
      icon = PhosphorIconsRegular.envelopeSimple;
    } else if (current < KycLevel.profiled) {
      labelKey = 'kyc_cta_complete_profile';
      icon = PhosphorIconsRegular.userCircle;
    } else {
      labelKey = 'kyc_cta_upload_docs';
      icon = PhosphorIconsRegular.fileArrowUp;
    }

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () {
          Navigator.pop(sheetCtx);
          // Navigate to the appropriate screen based on the requirement.
          // For email verification: the user already has the email sent.
          // For profile completion: navigate to profile tab.
          // For KYC docs: navigate to profile tab (KYC section).
          if (current < KycLevel.verified) {
            // Email not verified — the user needs to check their inbox.
            // Show a helpful SnackBar since we can't navigate to email app easily.
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(context.tr('kyc_check_email_hint')),
                backgroundColor: colors.primaryBrand,
                behavior: SnackBarBehavior.floating,
                margin: const EdgeInsets.all(16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            );
          } else {
            // Profile incomplete or KYC not approved — switch to Profile tab.
            // DashboardScreen uses PageIndexCubit to manage tab index.
            // Profile tab is the last tab (index 4 for non-admin, 2 for admin).
            try {
              final pageCubit = context.read<PageIndexCubit>();
              // Non-admin has 5 tabs (0-4), admin has 3 tabs (0-2).
              // Profile is always the LAST tab.
              final authState = context.read<AuthBloc>().state;
              if (authState is AuthAuthenticated) {
                final isAdmin = authState.user.role.toUpperCase() == 'ADMIN' ||
                    authState.user.role.toUpperCase() == 'AUDITOR';
                pageCubit.setPage(isAdmin ? 2 : 4);
              }
            } catch (_) {
              // PageIndexCubit not in tree — graceful degradation.
              debugPrint('[KycGuard] PageIndexCubit not in context tree.');
            }
          }
        },
        icon: Icon(icon, size: 18),
        label: Text(context.tr(labelKey)),
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.primaryBrand,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    );
  }
}

/// Internal model for KYC step visualization.
class _KycStep {
  final KycLevel level;
  final String label;
  final IconData icon;
  const _KycStep(this.level, this.label, this.icon);
}
