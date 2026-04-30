import 'package:flutter/foundation.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// Donations BLoC — Events
/// ═══════════════════════════════════════════════════════════════════════════
/// P0-003 REMEDIATION: Created missing BLoC event classes for donations.
/// ═══════════════════════════════════════════════════════════════════════════

@immutable
sealed class DonationsEvent {
  const DonationsEvent();
}

/// Triggered on screen init — loads donations + escrow summary.
class DonationsLoadRequested extends DonationsEvent {
  const DonationsLoadRequested();
}

/// Triggered by pull-to-refresh.
class DonationsRefreshRequested extends DonationsEvent {
  const DonationsRefreshRequested();
}

/// Triggered when a push notification is received for a donation update.
class DonationUpdatedFromPush extends DonationsEvent {
  final Map<String, dynamic> data;
  const DonationUpdatedFromPush(this.data);
}
