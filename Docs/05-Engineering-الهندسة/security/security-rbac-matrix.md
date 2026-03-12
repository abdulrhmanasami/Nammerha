# Nammerha RBAC — Role-Based Access Control Matrix

## Roles

| Role        | KYC Required | Description                                                           |
| ----------- | :----------: | --------------------------------------------------------------------- |
| `homeowner` |      ✅      | Reports damage, tracks project progress                               |
| `engineer`  |      ✅      | KYC + professional license verified. Conducts site visits, builds BOQ |
| `donor`     |      ✅      | Funds specific BOQ items via escrow                                   |
| `supplier`  |      ✅      | KYC + trade license verified. Fulfills purchase orders                |
| `admin`     |      ✅      | Verifies proofs, releases escrow, manages platform                    |
| `auditor`   |      ✅      | Read-only audit access to all data                                    |

## Endpoint Permission Matrix

| #   | Endpoint                            | Method | homeowner | engineer | donor | supplier | admin | auditor |   Auth    |
| --- | ----------------------------------- | ------ | :-------: | :------: | :---: | :------: | :---: | :-----: | :-------: |
| 1   | `/api/projects`                     | POST   |    ✅     |    ❌    |  ❌   |    ❌    |  ❌   |   ❌    |    JWT    |
| 2   | `/api/projects/:id/assign-engineer` | POST   |    ❌     |    ❌    |  ❌   |    ❌    |  ✅   |   ❌    |    JWT    |
| 3   | `/api/projects/:id/boq`             | POST   |    ❌     |    ✅    |  ❌   |    ❌    |  ❌   |   ❌    |  JWT+KYC  |
| 4   | `/api/projects/:id/publish`         | PATCH  |    ❌     |    ✅    |  ❌   |    ❌    |  ❌   |   ❌    |  JWT+KYC  |
| 5   | `/api/marketplace/projects`         | GET    |    🌐     |    🌐    |  🌐   |    🌐    |  🌐   |   🌐    |  Public   |
| 6   | `/api/marketplace/projects/:id/boq` | GET    |    🌐     |    🌐    |  🌐   |    🌐    |  🌐   |   🌐    |  Public   |
| 7   | `/api/donations`                    | POST   |    ❌     |    ❌    |  ✅   |    ❌    |  ❌   |   ❌    |  JWT+KYC  |
| 8   | `/api/spatial-proof`                | POST   |    ❌     |    ✅    |  ❌   |    ✅    |  ❌   |   ❌    |  JWT+KYC  |
| 9   | `/api/spatial-proof/project/:id`    | GET    |    ❌     |    ✅    |  ❌   |    ❌    |  ✅   |   ✅    |    JWT    |
| 10  | `/api/admin/verifications/pending`  | GET    |    ❌     |    ❌    |  ❌   |    ❌    |  ✅   |   ✅    |    JWT    |
| 11  | `/api/admin/escrow/release`         | POST   |    ❌     |    ❌    |  ❌   |    ❌    |  ✅   |   ❌    |    JWT    |
| 12  | `/api/admin/escrow/flag`            | POST   |    ❌     |    ❌    |  ❌   |    ❌    |  ✅   |   ❌    |    JWT    |
| 13  | `/api/payments/initiate`            | POST   |    ❌     |    ❌    |  ✅   |    ❌    |  ❌   |   ❌    |  JWT+KYC  |
| 14  | `/api/payments/webhook`             | POST   |    🌐     |    🌐    |  🌐   |    🌐    |  🌐   |   🌐    | Signature |
| 15  | `/api/payments/status/:ref`         | GET    |    ✅     |    ✅    |  ✅   |    ✅    |  ✅   |   ✅    |    JWT    |
| 16  | `/api/payments/history`             | GET    |    ❌     |    ❌    |  ✅   |    ❌    |  ❌   |   ❌    |  JWT+KYC  |
| 17  | `/api/notifications`                | GET    |    ✅     |    ✅    |  ✅   |    ✅    |  ✅   |   ✅    |    JWT    |
| 18  | `/api/notifications/unread-count`   | GET    |    ✅     |    ✅    |  ✅   |    ✅    |  ✅   |   ✅    |    JWT    |
| 19  | `/api/notifications/:id/read`       | PATCH  |    ✅     |    ✅    |  ✅   |    ✅    |  ✅   |   ✅    |    JWT    |
| 20  | `/api/notifications/read-all`       | PATCH  |    ✅     |    ✅    |  ✅   |    ✅    |  ✅   |   ✅    |    JWT    |
| 21  | `/health`                           | GET    |    🌐     |    🌐    |  🌐   |    🌐    |  🌐   |   🌐    |  Public   |

**Legend:** ✅ = Authorized | ❌ = Denied | 🌐 = Public (No auth)

## Security Layers

### 1. Authentication (`authMiddleware`)

- JWT Bearer token validated on every protected request
- Token contains: `user_id`, `role`, `kyc_verified`
- Development fallback: `X-User-Id` header (disabled in production)

### 2. KYC Enforcement (`requireActive`)

- Engineers and suppliers must pass `KYC_Verification_Status = 'verified'`
- Local union/trade license verified before account activation
- Enforcement point: middleware runs AFTER auth, BEFORE route handler

### 3. Role Guard (`requireRole`)

- Middleware factory accepting allowed role list
- Returns 403 for unauthorized role access
- Logged to audit trail

### 4. Audit Trail (`auditMiddleware`)

- ALL mutation requests (POST, PATCH, PUT, DELETE) auto-logged
- Captures: user_id, action, entity_type, entity_id, timestamp, IP, user-agent
- Immutable `audit_trail` table (INSERT-only, no UPDATE/DELETE)

### 5. Payment Security

- Webhook signature verification (HMAC-SHA256 planned for production)
- Idempotent webhook processing (terminal states skip re-processing)
- Escrow funds never directly accessible — release requires admin verification

### 6. Data Integrity

- BIGINT for all monetary values (integer arithmetic, no floating point)
- Parameterized SQL queries (SQL injection prevention)
- SHA-256 hashing for spatial proof image integrity
- GPS proximity validation (100m threshold for delivery proofs)
