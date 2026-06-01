// ============================================================================
// Nammerha Backend — Privacy Service
// ============================================================================
// Field-level privacy filter engine. Strips profile data based on the viewer's
// relationship to the profile owner.
//
// Visibility tiers (from most to least permissive):
//   'public'          — any authenticated user
//   'project_members' — users sharing a project with the owner
//   'private'         — owner only (+ admins)
// ============================================================================

import { query } from '../config/database';
import { logger } from '../utils/logger';
import type {
  PrivacyFieldSettings,
  PrivacySettingsMap,
  PrivacyVisibility,
  ViewerContext,
} from '../types';

// ─── CRIT-001: Static field whitelist per role ──────────────────────────────
// Only these fields are valid privacy targets. Any field NOT in this whitelist
// is ignored in settings updates — preventing injection of arbitrary keys.

const ROLE_FIELD_WHITELIST: Readonly<Record<string, readonly string[]>> = {
  contractor: [
    'company_name',
    'trade_category',
    'years_experience',
    'service_areas',
    'portfolio_urls',
    'max_concurrent_projects',
    'commercial_license_number',
    'insurance_expiry',
    'insurance_status',
    'commercial_license_url',
    'insurance_document_url',
    'verification_status',
  ],
  engineer: [
    'specialization',
    'university',
    'graduation_year',
    'years_experience',
    'professional_memberships',
    'certification_urls',
    'engineering_license_number',
    'license_expiry',
    'license_status',
    'engineering_license_url',
    'verification_status',
  ],
  supplier: [
    'company_name',
    'supply_categories',
    'delivery_radius_km',
    'min_order_amount',
    'warehouse_address',
    'commercial_register_number',
    'register_status',
    'commercial_register_expiry',
    'commercial_register_url',
    'verification_status',
  ],
  tradesperson: [
    'trade_type',
    'years_experience',
    'daily_rate',
    'tools_owned',
    'availability_status',
    'guild_membership_id',
    'guild_expiry',
    'guild_document_url',
    'certification_expiry',
    'verification_status',
  ],
  homeowner: [
    'property_type',
    'displacement_status',
    'family_size',
    'property_address',
    'ownership_proof_url',
    'verification_status',
  ],
  user: [
    'preferred_causes',
    'preferred_currency',
    'is_anonymous_default',
    'donation_count',
    'total_donated_amount',
    'tax_receipt_email',
  ],
} as const;

// ─── Role-specific default visibility settings ─────────────────────────────

const DEFAULT_SETTINGS: Readonly<Record<string, PrivacyFieldSettings>> = {
  contractor: {
    company_name: 'public',
    trade_category: 'public',
    years_experience: 'public',
    service_areas: 'public',
    portfolio_urls: 'public',
    max_concurrent_projects: 'project_members',
    commercial_license_number: 'project_members',
    insurance_expiry: 'project_members',
    insurance_status: 'project_members',
    commercial_license_url: 'private',
    insurance_document_url: 'private',
    verification_status: 'private',
  },
  engineer: {
    specialization: 'public',
    university: 'public',
    graduation_year: 'public',
    years_experience: 'public',
    professional_memberships: 'public',
    certification_urls: 'project_members',
    engineering_license_number: 'project_members',
    license_expiry: 'project_members',
    license_status: 'project_members',
    engineering_license_url: 'private',
    verification_status: 'private',
  },
  supplier: {
    company_name: 'public',
    supply_categories: 'public',
    delivery_radius_km: 'public',
    min_order_amount: 'public',
    warehouse_address: 'project_members',
    commercial_register_number: 'project_members',
    register_status: 'project_members',
    commercial_register_expiry: 'project_members',
    commercial_register_url: 'private',
    verification_status: 'private',
  },
  tradesperson: {
    trade_type: 'public',
    years_experience: 'public',
    daily_rate: 'public',
    tools_owned: 'public',
    availability_status: 'public',
    guild_membership_id: 'project_members',
    guild_expiry: 'project_members',
    certification_expiry: 'project_members',
    guild_document_url: 'private',
    verification_status: 'private',
  },
  homeowner: {
    property_type: 'public',
    displacement_status: 'project_members',
    family_size: 'private',
    property_address: 'private',
    ownership_proof_url: 'private',
    verification_status: 'private',
  },
  user: {
    preferred_causes: 'public',
    preferred_currency: 'public',
    is_anonymous_default: 'private',
    donation_count: 'private',
    total_donated_amount: 'private',
    tax_receipt_email: 'private',
  },
};

// ─── Visibility tier hierarchy ──────────────────────────────────────────────
// A viewer at tier N can see fields at tier N and above (more permissive).
const TIER_ORDER: Record<PrivacyVisibility, number> = {
  public: 0,
  project_members: 1,
  private: 2,
};

const CONTEXT_TIER: Record<ViewerContext, number> = {
  self: 2, // Owner sees EVERYTHING
  project_member: 1, // Sees public + project_members
  public: 0, // Sees public only
};

// ─── Service Functions ──────────────────────────────────────────────────────

/**
 * Get a user's privacy settings. Creates defaults if none exist.
 */
export async function getPrivacySettings(userId: string): Promise<PrivacySettingsMap> {
  const result = await query<{ settings: PrivacySettingsMap }>(
    'SELECT settings FROM privacy_settings WHERE user_id = $1',
    [userId],
  );

  if (result.rows[0]) {
    return result.rows[0].settings;
  }

  // No settings — return defaults based on user's roles
  return createDefaultSettings(userId);
}

/**
 * Update a user's privacy settings. Validates all fields against whitelist.
 */
export async function updatePrivacySettings(
  userId: string,
  newSettings: PrivacySettingsMap,
): Promise<PrivacySettingsMap> {
  // Validate: only whitelisted fields with valid visibility values
  const VALID_VISIBILITIES = new Set<string>(['public', 'project_members', 'private']);
  const sanitized: PrivacySettingsMap = {};

  for (const [role, fields] of Object.entries(newSettings)) {
    const whitelist = ROLE_FIELD_WHITELIST[role];
    if (!whitelist) {
      logger.warn('Privacy update: unknown role ignored', { userId, role });
      continue;
    }

    const sanitizedFields: PrivacyFieldSettings = {};
    for (const [field, visibility] of Object.entries(fields)) {
      if (!whitelist.includes(field)) {
        logger.warn('Privacy update: unknown field ignored', { userId, role, field });
        continue;
      }
      if (!VALID_VISIBILITIES.has(visibility)) {
        logger.warn('Privacy update: invalid visibility ignored', {
          userId,
          role,
          field,
          visibility,
        });
        continue;
      }
      sanitizedFields[field] = visibility as PrivacyVisibility;
    }

    if (Object.keys(sanitizedFields).length > 0) {
      sanitized[role] = sanitizedFields;
    }
  }

  // Merge with existing settings (partial update)
  const existing = await getPrivacySettings(userId);
  const merged: PrivacySettingsMap = { ...existing };

  for (const [role, fields] of Object.entries(sanitized)) {
    merged[role] = { ...(merged[role] ?? {}), ...fields };
  }

  await query(
    `INSERT INTO privacy_settings (user_id, settings, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET settings = $2, updated_at = NOW()`,
    [userId, JSON.stringify(merged)],
  );

  return merged;
}

/**
 * Apply privacy filter to a profile object.
 * Strips fields the viewer is not authorized to see.
 *
 * @param profile - Raw profile data from database
 * @param roleSettings - Privacy settings for this specific role
 * @param viewerContext - Viewer's relationship to the profile owner
 * @returns Filtered profile with redacted fields removed
 */
export function applyPrivacyFilter<T extends Record<string, unknown>>(
  profile: T,
  roleSettings: PrivacyFieldSettings | undefined,
  viewerContext: ViewerContext,
): Partial<T> {
  // Owner sees everything — no filtering
  if (viewerContext === 'self') {
    return { ...profile };
  }

  // No privacy settings — default to showing only user_id and timestamps
  if (!roleSettings) {
    const safe: Partial<T> = {};
    const ALWAYS_VISIBLE = new Set(['user_id', 'created_at', 'updated_at']);
    for (const key of Object.keys(profile)) {
      if (ALWAYS_VISIBLE.has(key)) {
        (safe as Record<string, unknown>)[key] = profile[key];
      }
    }
    return safe;
  }

  const viewerTier = CONTEXT_TIER[viewerContext];
  const filtered: Partial<T> = {};

  // Always include structural fields
  const ALWAYS_VISIBLE = new Set(['user_id', 'created_at', 'updated_at']);

  for (const [key, value] of Object.entries(profile)) {
    if (ALWAYS_VISIBLE.has(key)) {
      (filtered as Record<string, unknown>)[key] = value;
      continue;
    }

    const fieldVisibility = roleSettings[key] ?? 'private'; // Default: private if not configured
    const fieldTier = TIER_ORDER[fieldVisibility];

    // Viewer can see this field if their tier >= field's required tier
    if (viewerTier >= fieldTier) {
      (filtered as Record<string, unknown>)[key] = value;
    }
  }

  return filtered;
}

/**
 * Get default settings for a specific role.
 */
export function getDefaultSettingsForRole(role: string): PrivacyFieldSettings | null {
  return DEFAULT_SETTINGS[role] ?? null;
}

/**
 * Get the list of configurable fields for a role.
 */
export function getConfigurableFields(role: string): readonly string[] {
  return ROLE_FIELD_WHITELIST[role] ?? [];
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

async function createDefaultSettings(userId: string): Promise<PrivacySettingsMap> {
  // Look up user's active roles
  const rolesResult = await query<{ role_name: string }>(
    `SELECT r.role_name FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = $1 AND ur.status = 'active'`,
    [userId],
  );

  const defaults: PrivacySettingsMap = {};
  for (const row of rolesResult.rows) {
    const roleDefaults = DEFAULT_SETTINGS[row.role_name];
    if (roleDefaults) {
      defaults[row.role_name] = { ...roleDefaults };
    }
  }

  // Persist defaults
  if (Object.keys(defaults).length > 0) {
    await query(
      `INSERT INTO privacy_settings (user_id, settings)
             VALUES ($1, $2)
             ON CONFLICT (user_id) DO NOTHING`,
      [userId, JSON.stringify(defaults)],
    );
  }

  return defaults;
}
