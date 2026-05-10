// ============================================================================
// Nammerha Frontend — Auth Module
// Session management and user context
// ============================================================================
import { reportError } from './error-reporter';

export type UserRole = 'homeowner' | 'engineer' | 'donor' | 'supplier' | 'contractor' | 'tradesperson' | 'admin' | 'auditor';

export interface AuthUser {
    user_id: string;
    full_name: string;
    role: UserRole;           // primary role (backward compat)
    roles: UserRole[];        // all active roles
    activeRole: UserRole;     // currently selected role context
    email?: string;
    kyc_verified: boolean;
}

const STORAGE_KEY = 'nammerha_auth';
const DEV_USER_KEY = 'nammerha_dev_user_id';

// ─── Auth State ─────────────────────────────────────────────────────────────
let currentUser: AuthUser | null = null;

export function getCurrentUser(): AuthUser | null {
    if (currentUser) {return currentUser;}

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored) as AuthUser;
            // Backward compat: older localStorage entries may lack roles[]
            if (!parsed.roles) {
                parsed.roles = [parsed.role];
            }
            if (!parsed.activeRole) {
                parsed.activeRole = parsed.role;
            }
            currentUser = parsed;
            return currentUser;
        } catch (err) {
            reportError(err instanceof Error ? err : new Error(String(err)), { context: 'auth_parse_stored_user' });
            localStorage.removeItem(STORAGE_KEY);
        }
    }
    return null;
}

export function setCurrentUser(user: AuthUser): void {
    currentUser = user;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEY);
    // V1-AUDIT FIX: Token is now in httpOnly cookie — cleared server-side.
    // P2-DUP-001 FIX: Removed internal logout fetch. Portal pages (donor-portal,
    // profile) already call authApi.logout() explicitly before clearAuth().
    // The previous implementation fired TWO HTTP POST logout requests.
    localStorage.removeItem(DEV_USER_KEY);
}

export function isAuthenticated(): boolean {
    return getCurrentUser() !== null;
}

export function hasRole(...roles: UserRole[]): boolean {
    const user = getCurrentUser();
    if (!user) { return false; }
    // Multi-Role: check if user has ANY of the requested roles
    return user.roles.some(r => roles.includes(r));
}

// UNIFIED CITIZEN: switchActiveRole() removed (2026-05-10).
// All users have all roles — switching is no longer a platform concept.

// ─── Development Helpers ────────────────────────────────────────────────────
// P2-007 FIX: Use import.meta.env.DEV (Vite resolves at build time) instead of
// process.env.NODE_ENV which is unreliable in browser context.

const IS_DEV: boolean = import.meta.env.DEV === true;

// DEV_USERS are only populated in development builds.
// In production, Vite's dead-code elimination strips this entire block.
// UNIFIED CITIZEN: All dev users have ALL citizen roles — mirrors production behavior.
const ALL_CITIZEN_ROLES: UserRole[] = ['homeowner', 'engineer', 'donor', 'supplier', 'contractor', 'tradesperson'];
const ALL_ADMIN_ROLES: UserRole[] = [...ALL_CITIZEN_ROLES, 'admin', 'auditor'];

const DEV_USERS: Record<string, AuthUser> = IS_DEV
    ? {
        homeowner: {
            user_id: 'dev-homeowner-001',
            full_name: 'Dev Homeowner 001',
            role: 'homeowner',
            roles: ALL_CITIZEN_ROLES,
            activeRole: 'homeowner',
            email: 'ahmad@example.com',
            kyc_verified: true,
        },
        engineer: {
            user_id: 'dev-engineer-001',
            full_name: 'Dev Engineer 001',
            role: 'engineer',
            roles: ALL_CITIZEN_ROLES,
            activeRole: 'engineer',
            email: 'khalid@example.com',
            kyc_verified: true,
        },
        donor: {
            user_id: 'dev-donor-001',
            full_name: 'Sarah Johnson',
            role: 'donor',
            roles: ALL_CITIZEN_ROLES,
            activeRole: 'donor',
            email: 'sarah@example.com',
            kyc_verified: true,
        },
        supplier: {
            user_id: 'dev-supplier-001',
            full_name: 'Dev Supplier 001',
            role: 'supplier',
            roles: ALL_CITIZEN_ROLES,
            activeRole: 'supplier',
            email: 'supplier@example.com',
            kyc_verified: true,
        },
        contractor: {
            user_id: 'dev-contractor-001',
            full_name: 'Dev Contractor 001',
            role: 'contractor',
            roles: ALL_CITIZEN_ROLES,
            activeRole: 'contractor',
            email: 'contractor@example.com',
            kyc_verified: true,
        },
        tradesperson: {
            user_id: 'dev-tradesperson-001',
            full_name: 'Dev Tradesperson 001',
            role: 'tradesperson',
            roles: ALL_CITIZEN_ROLES,
            activeRole: 'tradesperson',
            email: 'tradesperson@example.com',
            kyc_verified: true,
        },
        admin: {
            user_id: 'dev-admin-001',
            full_name: 'Dev Admin 001',
            role: 'admin',
            roles: ALL_ADMIN_ROLES,
            activeRole: 'admin',
            email: 'admin@nammerha.org',
            kyc_verified: true,
        },
        auditor: {
            user_id: 'dev-auditor-001',
            full_name: 'Dev Auditor 001',
            role: 'auditor',
            roles: ALL_ADMIN_ROLES,
            activeRole: 'auditor',
            email: 'auditor@nammerha.org',
            kyc_verified: true,
        },
    }
    : {};

export function devLogin(role: UserRole): void {
    if (!IS_DEV) {
        return; // Silent no-op — dev bypass disabled in production
    }
    const user = DEV_USERS[role];
    if (user) {
        setCurrentUser(user);
        localStorage.setItem(DEV_USER_KEY, user.user_id);
    }
}

export function getDevUsers(): Record<string, AuthUser> {
    if (!IS_DEV) { return {}; }
    return DEV_USERS;
}

