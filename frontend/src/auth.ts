// ============================================================================
// Nammerha Frontend — Auth Module
// Session management and role-based UI switching
// ============================================================================

export type UserRole = 'homeowner' | 'engineer' | 'donor' | 'supplier' | 'contractor' | 'tradesperson' | 'admin' | 'auditor';

export interface AuthUser {
    user_id: string;
    full_name: string;
    role: UserRole;
    email?: string;
    kyc_verified: boolean;
}

const STORAGE_KEY = 'nammerha_auth';
const DEV_USER_KEY = 'nammerha_dev_user_id';

// ─── Auth State ─────────────────────────────────────────────────────────────
let currentUser: AuthUser | null = null;

export function getCurrentUser(): AuthUser | null {
    if (currentUser) return currentUser;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            currentUser = JSON.parse(stored) as AuthUser;
            return currentUser;
        } catch (err) {
            console.warn('[Auth] Failed to parse stored user, clearing:', err);
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
    localStorage.removeItem('nammerha_token');
    localStorage.removeItem(DEV_USER_KEY);
}

export function isAuthenticated(): boolean {
    return getCurrentUser() !== null;
}

export function hasRole(...roles: UserRole[]): boolean {
    const user = getCurrentUser();
    return user !== null && roles.includes(user.role);
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
            email: 'ahmad@example.com',
            kyc_verified: true,
        },
        engineer: {
            user_id: 'dev-engineer-001',
            full_name: 'خالد المهندس',
            role: 'engineer',
            email: 'khalid@example.com',
            kyc_verified: true,
        },
        donor: {
            user_id: 'dev-donor-001',
            full_name: 'Sarah Johnson',
            role: 'donor',
            email: 'sarah@example.com',
            kyc_verified: true,
        },
        supplier: {
            user_id: 'dev-supplier-001',
            full_name: 'محمد التاجر',
            role: 'supplier',
            email: 'supplier@example.com',
            kyc_verified: true,
        },
        contractor: {
            user_id: 'dev-contractor-001',
            full_name: 'عمر المقاول',
            role: 'contractor',
            email: 'contractor@example.com',
            kyc_verified: true,
        },
        tradesperson: {
            user_id: 'dev-tradesperson-001',
            full_name: 'حسن الحرفي',
            role: 'tradesperson',
            email: 'tradesperson@example.com',
            kyc_verified: true,
        },
        admin: {
            user_id: 'dev-admin-001',
            full_name: 'مدير النظام',
            role: 'admin',
            email: 'admin@nammerha.org',
            kyc_verified: true,
        },
        auditor: {
            user_id: 'dev-auditor-001',
            full_name: 'المدقق الرسمي',
            role: 'auditor',
            email: 'auditor@nammerha.org',
            kyc_verified: true,
        },
    }
    : {};

export function devLogin(role: UserRole): void {
    if (!IS_DEV) {
        console.warn('[AUTH] devLogin is disabled in production');
        return;
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

