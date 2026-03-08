// ============================================================================
// Nammerha Frontend — Auth Module
// Session management and role-based UI switching
// ============================================================================

export type UserRole = 'homeowner' | 'engineer' | 'donor' | 'supplier' | 'admin' | 'auditor';

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
        } catch {
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
// Quick role switching for development/demo purposes

const DEV_USERS: Record<string, AuthUser> = {
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
    admin: {
        user_id: 'dev-admin-001',
        full_name: 'مدير النظام',
        role: 'admin',
        email: 'admin@nammerha.org',
        kyc_verified: true,
    },
};

export function devLogin(role: UserRole): void {
    const user = DEV_USERS[role];
    if (user) {
        setCurrentUser(user);
        localStorage.setItem(DEV_USER_KEY, user.user_id);
    }
}

export function getDevUsers(): typeof DEV_USERS {
    return DEV_USERS;
}
