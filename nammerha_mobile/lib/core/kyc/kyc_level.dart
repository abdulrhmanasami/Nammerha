// ═══════════════════════════════════════════════════════════════════════════
// P0-003: KYC Level Definitions — Progressive Profiling Gate
// ═══════════════════════════════════════════════════════════════════════════
// Defines trust levels and maps platform actions to minimum requirements.
// Pure client-side — leverages NammerhaUser fields already returned by the
// backend. Server-side enforcement is separate (OFAC/Prisma guards).
//
// Standard: FATF Recommendation 10, ISO/IEC 25010 Security (Authentication)
// ═══════════════════════════════════════════════════════════════════════════

import '../../features/auth/repositories/auth_repository.dart';

/// Progressive KYC levels — each gates specific platform actions.
///
/// ```
/// Level 0 (guest):        Browse, view → no restrictions
/// Level 1 (verified):     Email verified → can fund/purchase
/// Level 2 (profiled):     Name + phone → can bid, camera, portals
/// Level 3 (kycApproved):  Identity docs → contract execution, large escrow
/// ```
enum KycLevel {
  /// Just registered, email not yet verified.
  guest(0),

  /// Email verified. Can fund projects via BOQ → Cart → Escrow.
  verified(1),

  /// Profile complete (name + phone). Can submit bids, use spatial camera,
  /// and access professional portals (Engineer, Contractor, Supplier).
  profiled(2),

  /// Identity documents approved by admin. Can execute contracts and
  /// handle large escrow releases.
  kycApproved(3);

  const KycLevel(this.value);
  final int value;

  bool operator >=(KycLevel other) => value >= other.value;
  bool operator <(KycLevel other) => value < other.value;
}

/// Determines the current KYC level from a NammerhaUser instance.
KycLevel resolveKycLevel(NammerhaUser user) {
  if (user.isKycVerified) return KycLevel.kycApproved;
  if (user.isProfileComplete) return KycLevel.profiled;
  if (user.isEmailVerified) return KycLevel.verified;
  return KycLevel.guest;
}

/// Maps platform actions to their minimum required KYC level.
///
/// Design rationale per FATF 8:
/// - Financial actions (fund, escrow) require at minimum email verification
/// - Professional actions (bid, camera) require profile completion
/// - Contract execution requires full KYC (identity docs)
class KycRequirements {
  KycRequirements._();

  // ─── Level 0: No gate (browse, view) ────────────────────────────────

  // ─── Level 1: Email verified ────────────────────────────────────────
  static const KycLevel fund = KycLevel.verified;
  static const KycLevel addToCart = KycLevel.verified;
  static const KycLevel checkout = KycLevel.verified;

  // ─── Level 2: Profile complete ──────────────────────────────────────
  static const KycLevel submitBid = KycLevel.profiled;
  static const KycLevel spatialCamera = KycLevel.profiled;
  static const KycLevel realityCapture = KycLevel.profiled;
  static const KycLevel engineerPortal = KycLevel.profiled;
  static const KycLevel contractorPortal = KycLevel.profiled;
  static const KycLevel supplierPortal = KycLevel.profiled;

  // ─── Level 3: KYC approved ──────────────────────────────────────────
  static const KycLevel contractExecution = KycLevel.kycApproved;
  static const KycLevel largeEscrowRelease = KycLevel.kycApproved;
}
