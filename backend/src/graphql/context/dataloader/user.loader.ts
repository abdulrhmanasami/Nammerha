import DataLoader from 'dataloader';
import { query as dbQuery } from '../../../config/database';

export function createUserLoader() {
    return new DataLoader<string, Record<string, unknown> | null>(async (userIds) => {
        const result = await dbQuery(
            `SELECT user_id, email, full_name, role, avatar_url,
                    kyc_verification_status, is_active, is_email_verified,
                    created_at, updated_at
             FROM users WHERE user_id = ANY($1)`,
            [userIds]
        );
        const map = new Map();
        result.rows.forEach(r => map.set(r['user_id'], {
            userId: r['user_id'],
            email: r['email'],
            fullName: r['full_name'],
            role: String(r['role']).toUpperCase(),
            avatarUrl: r['avatar_url'],
            kycVerificationStatus: String(r['kyc_verification_status']).toUpperCase(),
            isActive: r['is_active'],
            isEmailVerified: r['is_email_verified'] ?? false,
            createdAt: r['created_at'],
            updatedAt: r['updated_at'],
        }));
        return userIds.map(id => map.get(id) || null);
    });
}
