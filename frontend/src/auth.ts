// ============================================================================
// Nammerha Frontend — Auth Module
// Session management and role-based UI switching
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

/**
 * Switch the user's active role context.
 * Updates localStorage immediately; backend sync is done via API.
 */
export function switchActiveRole(role: UserRole): void {
    const user = getCurrentUser();
    if (!user || !user.roles.includes(role)) { return; }
    user.activeRole = role;
    user.role = role; // backward compat
    setCurrentUser(user);
    // Dispatch custom event so all components can react
    window.dispatchEvent(new CustomEvent('role:switched', { detail: { role } }));
}

// ─── Development Helpers ────────────────────────────────────────────────────
// P2-007 FIX: Use import.meta.env.DEV (Vite resolves at build time) instead of
// process.env.NODE_ENV which is unreliable in browser context.

const IS_DEV: boolean = import.meta.env.DEV === true;

// DEV_USERS are only populated in development builds.
// In production, Vite's dead-code elimination strips this entire block.
const DEV_USERS: Record<string, AuthUser> = IS_DEV
    ? {
        homeowner: {
            user_id: 'dev-homeowner-001',
            full_name: 'أحمد كريم',
            role: 'homeowner',
            roles: ['homeowner'],
            activeRole: 'homeowner',
            email: 'ahmad@example.com',
            kyc_verified: true,
        },
        engineer: {
            user_id: 'dev-engineer-001',
            full_name: 'خالد المهندس',
            role: 'engineer',
            roles: ['engineer'],
            activeRole: 'engineer',
            email: 'khalid@example.com',
            kyc_verified: true,
        },
        donor: {
            user_id: 'dev-donor-001',
            full_name: 'Sarah Johnson',
            role: 'donor',
            roles: ['donor'],
            activeRole: 'donor',
            email: 'sarah@example.com',
            kyc_verified: true,
        },
        supplier: {
            user_id: 'dev-supplier-001',
            full_name: 'محمد التاجر',
            role: 'supplier',
            roles: ['supplier'],
            activeRole: 'supplier',
            email: 'supplier@example.com',
            kyc_verified: true,
        },
        contractor: {
            user_id: 'dev-contractor-001',
            full_name: 'عمر المقاول',
            role: 'contractor',
            roles: ['contractor'],
            activeRole: 'contractor',
            email: 'contractor@example.com',
            kyc_verified: true,
        },
        tradesperson: {
            user_id: 'dev-tradesperson-001',
            full_name: 'حسن الحرفي',
            role: 'tradesperson',
            roles: ['tradesperson'],
            activeRole: 'tradesperson',
            email: 'tradesperson@example.com',
            kyc_verified: true,
        },
        admin: {
            user_id: 'dev-admin-001',
            full_name: 'مدير النظام',
            role: 'admin',
            roles: ['admin'],
            activeRole: 'admin',
            email: 'admin@nammerha.org',
            kyc_verified: true,
        },
        auditor: {
            user_id: 'dev-auditor-001',
            full_name: 'المدقق الرسمي',
            role: 'auditor',
            roles: ['auditor'],
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

