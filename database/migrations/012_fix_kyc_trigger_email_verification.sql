-- ============================================================================
-- Migration 012: Fix KYC trigger to allow email verification activation
-- ============================================================================
-- PROBLEM: trg_enforce_kyc_activation blocked ALL is_active = TRUE updates
-- unless kyc_verification_status = 'verified'. This created a circular
-- deadlock: email verification sets is_active = TRUE, but the trigger
-- rejected it because KYC was 'pending'. User couldn't do KYC without
-- being active → deadlock.
--
-- FIX: Allow activation when is_email_verified transitions from FALSE to TRUE
-- (email verification flow). KYC enforcement still applies to manual/admin
-- activations.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_enforce_kyc_activation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow activation when triggered by email verification flow.
  -- Email verification sets is_email_verified = TRUE and is_active = TRUE simultaneously.
  -- Only enforce KYC for manual/admin activations where email verification is not changing.
  IF NEW.is_active = TRUE
     AND NEW.kyc_verification_status != 'verified'
     AND NOT (OLD.is_email_verified = FALSE AND NEW.is_email_verified = TRUE) THEN
    RAISE EXCEPTION 'Cannot activate user %: KYC verification status must be "verified" (current: "%")',
      NEW.user_id,
      NEW.kyc_verification_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
