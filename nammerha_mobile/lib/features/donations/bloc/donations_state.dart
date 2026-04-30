import 'package:flutter/foundation.dart';
import '../models/donation_model.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Donations BLoC — State
/// ═══════════════════════════════════════════════════════════════════════════
/// P0-003 REMEDIATION: Created missing BLoC state classes for donations.
/// ═══════════════════════════════════════════════════════════════════════════

@immutable
sealed class DonationsState {
  const DonationsState();
}

/// Initial state before any data load.
class DonationsInitial extends DonationsState {
  const DonationsInitial();
}

/// Loading state — shown on first load.
class DonationsLoading extends DonationsState {
  const DonationsLoading();
}

/// Data loaded successfully.
class DonationsLoaded extends DonationsState {
  final List<DonationEntry> donations;
  final EscrowSummary summary;

  const DonationsLoaded({
    required this.donations,
    required this.summary,
  });
}

/// Error state — API failure or network error.
class DonationsError extends DonationsState {
  final String message;
  const DonationsError(this.message);
}
