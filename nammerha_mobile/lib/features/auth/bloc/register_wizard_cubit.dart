import 'package:flutter/foundation.dart';
import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// Register Wizard Cubit — Platinum Standard (setState → Cubit migration)
// ═══════════════════════════════════════════════════════════════════════════════
// Manages ALL form-level state for the 3-step registration wizard:
//   Step 0: Identity (Full Name)
//   Step 1: Account (Email)
//   Step 2: Security (Password, Confirm, Strength, Terms, Review)
//
// AUD-003 FIX: Draft persistence — saves name + email + step to
// SharedPreferences on step advance and screen dispose. Mirrors web's
// sessionStorage pattern (auth.ts L168-L204). NEVER persists passwords.
//
// AuthBloc remains responsible for the actual API call (register/login).
// This Cubit handles UI orchestration only — zero network calls.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Constants ────────────────────────────────────────────────────────────────

/// SharedPreferences key for registration draft.
/// Matches web's `nmh_reg_draft` key for cross-platform parity.
const String _kRegDraftKey = 'nmh_reg_draft';

// ─── State ───────────────────────────────────────────────────────────────────

class RegisterWizardState extends Equatable {
  final int currentPage;
  final bool obscurePassword;
  final bool obscureConfirm;
  final bool termsAccepted;
  final String password;

  /// AUD-003: Restored draft fields — pre-fill controllers on mount.
  final String draftName;
  final String draftEmail;

  /// AUD-003: True when a draft was restored from SharedPreferences.
  /// Used to show a one-time "Draft restored" notification.
  final bool draftRestored;

  const RegisterWizardState({
    this.currentPage = 0,
    this.obscurePassword = true,
    this.obscureConfirm = true,
    this.termsAccepted = false,
    this.password = '',
    this.draftName = '',
    this.draftEmail = '',
    this.draftRestored = false,
  });

  RegisterWizardState copyWith({
    int? currentPage,
    bool? obscurePassword,
    bool? obscureConfirm,
    bool? termsAccepted,
    String? password,
    String? draftName,
    String? draftEmail,
    bool? draftRestored,
  }) {
    return RegisterWizardState(
      currentPage: currentPage ?? this.currentPage,
      obscurePassword: obscurePassword ?? this.obscurePassword,
      obscureConfirm: obscureConfirm ?? this.obscureConfirm,
      termsAccepted: termsAccepted ?? this.termsAccepted,
      password: password ?? this.password,
      draftName: draftName ?? this.draftName,
      draftEmail: draftEmail ?? this.draftEmail,
      draftRestored: draftRestored ?? this.draftRestored,
    );
  }

  @override
  List<Object?> get props => [
        currentPage,
        obscurePassword,
        obscureConfirm,
        termsAccepted,
        password,
        draftName,
        draftEmail,
        draftRestored,
      ];
}

// ─── Cubit ───────────────────────────────────────────────────────────────────

class RegisterWizardCubit extends Cubit<RegisterWizardState> {
  RegisterWizardCubit() : super(const RegisterWizardState());

  /// Called by PageView.onPageChanged — tracks current step.
  void setPage(int page) {
    emit(state.copyWith(currentPage: page));
  }

  /// Toggle password visibility in the password field.
  void toggleObscurePassword() {
    emit(state.copyWith(obscurePassword: !state.obscurePassword));
  }

  /// Toggle password visibility in the confirm field.
  void toggleObscureConfirm() {
    emit(state.copyWith(obscureConfirm: !state.obscureConfirm));
  }

  /// Toggle GDPR Art.7 terms checkbox.
  void toggleTerms() {
    emit(state.copyWith(termsAccepted: !state.termsAccepted));
  }

  /// Set terms explicitly (from Checkbox.onChanged).
  void setTerms(bool accepted) {
    emit(state.copyWith(termsAccepted: accepted));
  }

  /// Track password text for strength indicator reactivity.
  void updatePassword(String password) {
    emit(state.copyWith(password: password));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUD-003: Draft Persistence (Nielsen #5 — Error Prevention)
  // ═══════════════════════════════════════════════════════════════════════════
  // Saves non-sensitive fields (name + email + step) to SharedPreferences.
  // Restores on next mount. Clears on successful registration.
  //
  // SECURITY: Passwords are NEVER persisted. Only name and email are saved.
  // This mirrors web's sessionStorage pattern (auth.ts L168-L204).
  // ═══════════════════════════════════════════════════════════════════════════

  /// Persist name + email + current step to SharedPreferences.
  /// Called on step advance (`_nextPage`) and screen dispose.
  Future<void> saveDraft({required String name, required String email}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final draft = <String, dynamic>{
        'name': name,
        'email': email,
        'step': state.currentPage,
        'ts': DateTime.now().millisecondsSinceEpoch,
      };
      await prefs.setString(_kRegDraftKey, jsonEncode(draft));
    } catch (e) {
      debugPrint('[Nammerha] bloc/register_wizard_cubit: $e');
      // Degrade gracefully — draft persistence is best-effort.
      // SharedPreferences may fail on restricted storage environments.
    }
  }

  /// Restore draft from SharedPreferences.
  /// Called once on Cubit creation (screen mount).
  /// Returns true if a draft was restored (for controller pre-fill).
  Future<void> restoreDraft() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kRegDraftKey);
      if (raw == null || raw.isEmpty) return;

      final draft = jsonDecode(raw) as Map<String, dynamic>;
      final name = draft['name'] as String? ?? '';
      final email = draft['email'] as String? ?? '';
      final step = draft['step'] as int? ?? 0;
      final ts = draft['ts'] as int? ?? 0;

      // AUD-003: Expire drafts older than 24 hours.
      // Stale drafts from days ago could confuse returning users.
      final age = DateTime.now().millisecondsSinceEpoch - ts;
      if (age > const Duration(hours: 24).inMilliseconds) {
        await clearDraft();
        return;
      }

      // Only restore if there's actual content to restore.
      if (name.isEmpty && email.isEmpty) return;

      // Cap restored step to Step 1 (email) — never jump to Step 2 (password)
      // because passwords are not persisted.
      final safeStep = step.clamp(0, 1);

      emit(state.copyWith(
        draftName: name,
        draftEmail: email,
        currentPage: safeStep,
        draftRestored: true,
      ));
    } catch (e) {
      debugPrint('[Nammerha] bloc/register_wizard_cubit: $e');
      // Corrupt JSON or missing data — degrade gracefully.
    }
  }

  /// Clear the draft from SharedPreferences.
  /// Called on successful registration.
  Future<void> clearDraft() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kRegDraftKey);
    } catch (e) {
      debugPrint('[Nammerha] bloc/register_wizard_cubit: $e');
      // Best-effort cleanup.
    }
  }

  /// Reset the `draftRestored` flag after the UI has shown the notification.
  void acknowledgeDraftRestore() {
    emit(state.copyWith(draftRestored: false));
  }
}
