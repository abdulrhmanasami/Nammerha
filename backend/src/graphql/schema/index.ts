// ============================================================================
// Nammerha GraphQL — Schema Assembly
// ============================================================================
// Merges all type definitions and resolvers into a single executable schema.
// The schema maps 1:1 to the backend types/index.ts interface definitions
// and wraps existing Express service methods as GraphQL resolvers.
// ============================================================================

import { makeExecutableSchema } from '@graphql-tools/schema';
import { scalarTypeDefs } from '../scalars/index';

// ─── Enum & Common Type Definitions ─────────────────────────────────────────

const commonTypeDefs = `#graphql
    ${scalarTypeDefs}

    # ── User & Identity Enums (maps to types/index.ts) ──────────────────────
    enum UserRole {
        DONOR
        HOMEOWNER
        ENGINEER
        CONTRACTOR
        TRADESPERSON
        SUPPLIER
        ADMIN
        AUDITOR
    }

    enum KycStatus {
        PENDING
        SUBMITTED
        VERIFIED
        REJECTED
        SUSPENDED
    }

    # ── Project Enums ───────────────────────────────────────────────────────
    enum DamageType {
        STRUCTURAL
        PLUMBING
        ELECTRICAL
        MIXED
    }

    enum DamageSeverity {
        MINOR
        MODERATE
        SEVERE
        TOTAL_DESTRUCTION
    }

    enum ProjectStatus {
        DRAFT
        PENDING_ASSESSMENT
        ASSESSED
        PUBLISHED
        IN_PROGRESS
        COMPLETED
        CANCELLED
    }

    # ── Financial Enums ─────────────────────────────────────────────────────
    enum BoqItemStatus {
        PENDING_VERIFICATION
        VERIFIED
        PARTIALLY_FUNDED
        FULLY_FUNDED
        DELIVERED
        INSTALLED
    }

    enum PaymentStatus {
        PENDING
        LOCKED
        RELEASED
        REFUNDED
        DISPUTED
        CANCELLED
    }

    enum PoStatus {
        GENERATED
        SENT_TO_SUPPLIER
        ACKNOWLEDGED
        SHIPPED
        DELIVERED
        CANCELLED
    }

    enum PaymentMethod {
        VISA
        FATORA
    }

    # ── Notification Enums ──────────────────────────────────────────────────
    enum NotificationType {
        DONATION_RECEIVED
        PROOF_SUBMITTED
        FUNDS_RELEASED
        DELIVERY_CONFIRMED
        ENGINEER_ASSIGNED
        PO_GENERATED
        PROJECT_PUBLISHED
        KYC_APPROVED
        KYC_REJECTED
        DISCREPANCY_FLAGGED
        REFUND_APPROVED
        REFUND_REJECTED
    }

    enum NotificationChannel {
        PUSH
        EMAIL
        SMS
        IN_APP
    }

    # ── Verification Enums ──────────────────────────────────────────────────
    enum VerificationStatus {
        SUBMITTED
        VERIFIED
        REJECTED
    }

    # ── Review Enums ────────────────────────────────────────────────────────
    enum ReviewableType {
        CONTRACTOR_PROFILES
        SUPPLIER_PROFILES
        ENGINEER_PROFILES
        TRADESPERSON_PROFILES
        HOMEOWNER_PROFILES
        PROJECT
    }

    enum ReviewStatus {
        PUBLISHED
        HIDDEN
        FLAGGED
        REMOVED
    }

    # ── Impact Enums ────────────────────────────────────────────────────────
    enum ImpactEventType {
        DONATION_RECEIVED
        CONTRACTOR_ASSIGNED
        CONSTRUCTION_STARTED
        MILESTONE_COMPLETED
        PHOTO_PROOF_ADDED
        ESCROW_RELEASED
        PROJECT_COMPLETED
    }

    # ── Donation Intent ─────────────────────────────────────────────────────
    enum DonationIntent {
        ZAKAT
        SADAQAH
        GENERAL
    }
`;

// ─── Entity Type Definitions ────────────────────────────────────────────────

const entityTypeDefs = `#graphql
    """Platform user — all roles: donor, homeowner, engineer, supplier, admin, etc."""
    type User {
        userId: ID!
        email: String!
        phone: String
        fullName: String!
        role: UserRole!
        avatarUrl: String
        kycVerificationStatus: KycStatus!
        isActive: Boolean!
        isEmailVerified: Boolean!
        roles: [UserRole!]!
        createdAt: DateTime!
        updatedAt: DateTime!
    }

    """Authenticated user context injected from JWT"""
    type AuthUser {
        userId: ID!
        role: UserRole!
        roles: [UserRole!]!
        activeRole: UserRole!
        isActive: Boolean!
    }

    """OCDS-compliant project (بطاقة مشروع)"""
    type Project {
        projectId: ID!
        homeownerId: ID!
        assignedEngineerId: ID
        assignedContractorId: ID
        title: String!
        description: String
        coverImageUrl: String
        gpsLocation: String
        addressText: String
        damageType: DamageType!
        damageSeverity: DamageSeverity
        status: ProjectStatus!
        isPublic: Boolean!
        totalEstimatedCost: BigIntCents!
        totalFundedAmount: BigIntCents!
        fundedPercentage: Float!
        publishedAt: DateTime
        completedAt: DateTime
        createdAt: DateTime!
        updatedAt: DateTime!
        # Resolved fields
        homeowner: User
        engineer: User
        boqItems: [BOQItem!]!
        spatialProofs: [SpatialProof!]!
    }

    """Public marketplace project card (from vw_project_cards)"""
    type ProjectCard {
        projectId: ID!
        title: String!
        description: String
        coverImageUrl: String
        addressText: String
        damageType: DamageType!
        status: ProjectStatus!
        totalEstimatedCost: BigIntCents!
        totalFundedAmount: BigIntCents!
        fundedPercentage: Float!
        homeownerName: String!
        latitude: Float
        longitude: Float
        publishedAt: DateTime
        totalItems: Int!
        fullyFundedItems: Int!
    }

    """Itemized Bill of Quantities entry (سلة البناء item)"""
    type BOQItem {
        itemId: ID!
        projectId: ID!
        materialName: String!
        materialCategory: String
        description: String
        imageUrl: String
        unit: String!
        unitPrice: BigIntCents!
        requiredQuantity: Float!
        fundedAmount: BigIntCents!
        fundedPercentage: Float!
        oracleReferencePrice: BigIntCents
        status: BoqItemStatus!
        preferredSupplierId: ID
        preferredSupplier: User
        createdAt: DateTime!
        updatedAt: DateTime!
    }

    """Immutable escrow ledger entry (مجمدة)"""
    type EscrowEntry {
        transactionId: ID!
        donorId: ID!
        itemId: ID!
        projectId: ID!
        amountLocked: BigIntCents!
        currency: String!
        paymentStatus: PaymentStatus!
        paymentMethod: String
        paymentGatewayRef: String
        lockedAt: DateTime!
        releasedAt: DateTime
        releasedBy: ID
        releaseProofId: ID
        giftRecipientName: String
        giftMessage: String
        donationIntent: DonationIntent
        createdAt: DateTime!
    }

    """GPS-verified spatial proof (إثبات مكاني)"""
    type SpatialProof {
        proofId: ID!
        itemId: ID!
        projectId: ID!
        engineerId: ID!
        gpsCoordinates: String!
        gpsAccuracyMeters: Float
        capturedAt: DateTime!
        imageUrl: String!
        imageHash: String
        description: String
        deviceInfo: JSON
        verificationStatus: VerificationStatus!
        verifiedBy: ID
        verifiedAt: DateTime
        createdAt: DateTime!
        engineer: User
    }

    """Purchase order for verified supplier"""
    type PurchaseOrder {
        poId: ID!
        poNumber: String!
        itemId: ID!
        projectId: ID!
        supplierId: ID!
        amount: BigIntCents!
        currency: String!
        status: PoStatus!
        materialName: String!
        quantity: Float!
        unit: String!
        unitPrice: BigIntCents!
        supplierName: String!
        generatedAt: DateTime!
        createdAt: DateTime!
    }

    """User notification"""
    type Notification {
        notificationId: ID!
        userId: ID!
        type: NotificationType!
        title: String!
        body: String!
        data: JSON
        channel: NotificationChannel!
        isRead: Boolean!
        readAt: DateTime
        createdAt: DateTime!
    }

    """Supplier catalog product listing"""
    type SupplierCatalogItem {
        catalogId: ID!
        supplierId: ID!
        materialName: String!
        materialCategory: String!
        description: String
        imageUrl: String
        unit: String!
        unitPriceGuide: BigIntCents!
        minOrderQty: Int!
        leadTimeDays: Int!
        isActive: Boolean!
        createdAt: DateTime!
    }

    """Review with dimensional ratings"""
    type Review {
        reviewId: ID!
        reviewerId: ID!
        reviewableType: ReviewableType!
        reviewableId: ID!
        projectId: ID
        overallRating: Float!
        title: String
        body: String!
        isVerifiedInteraction: Boolean!
        status: ReviewStatus!
        helpfulCount: Int!
        createdAt: DateTime!
        reviewer: User
    }

    """Donor impact communication"""
    type ImpactMessage {
        messageId: ID!
        donorId: ID!
        projectId: ID
        eventType: ImpactEventType!
        titleEn: String!
        titleAr: String!
        bodyEn: String!
        bodyAr: String!
        metadata: JSON!
        readAt: DateTime
        createdAt: DateTime!
    }

    # ── Dashboard Statistics Types ──────────────────────────────────────────

    type SupplierStats {
        pendingOrders: Int!
        wonContracts: Int!
        inTransit: Int!
        totalRevenue: BigIntCents!
        catalogItems: Int!
        totalOrders: Int!
    }

    type EngineerStats {
        assignedProjects: Int!
        proofsPending: Int!
        proofsVerified: Int!
        escrowReleased: BigIntCents!
        activeBids: Int!
        totalBids: Int!
    }

    type ContractorStats {
        activeProjects: Int!
        pendingBids: Int!
        wonBids: Int!
        totalEscrowReceived: BigIntCents!
        totalBids: Int!
        bidWinRate: Float!
    }

    type TradespersonStats {
        activeJobs: Int!
        completedJobs: Int!
        pendingRequests: Int!
        activeAssignments: Int!
        totalEarnings: BigIntCents!
        averageRating: Float
    }

    # ── Pre-signed Upload URL ───────────────────────────────────────────────

    type UploadUrl {
        uploadUrl: String!
        storageKey: String!
        expiresAt: DateTime!
    }

    # ── Payment Intent ──────────────────────────────────────────────────────

    type PaymentIntent {
        intentId: String!
        checkoutUrl: String!
        returnUrl: String!
        amount: BigIntCents!
        currency: String!
    }

    # ── Paginated Response Wrapper ──────────────────────────────────────────

    type PaginatedProjects {
        items: [ProjectCard!]!
        total: Int!
        page: Int!
        pageSize: Int!
        hasMore: Boolean!
    }

    type PaginatedNotifications {
        items: [Notification!]!
        total: Int!
        unreadCount: Int!
    }
`;

// ─── Input Types ────────────────────────────────────────────────────────────

const inputTypeDefs = `#graphql
    input CreateProjectInput {
        title: String!
        damageType: DamageType!
        damageSeverity: DamageSeverity
        description: String
        gpsLat: Float!
        gpsLng: Float!
        addressText: String
        coverImageUrl: String
    }

    input AddBOQItemInput {
        materialName: String!
        materialCategory: String
        description: String
        unit: String!
        unitPrice: BigIntCents!
        requiredQuantity: Float!
        imageUrl: String
        preferredSupplierId: ID!
    }

    input DonationItemInput {
        itemId: ID!
        amount: BigIntCents!
    }

    input CreateDonationInput {
        items: [DonationItemInput!]!
        paymentMethod: PaymentMethod!
        returnUrl: String
        giftRecipientName: String
        giftMessage: String
        donationIntent: DonationIntent
    }

    input SubmitSpatialProofInput {
        itemId: ID!
        projectId: ID!
        gpsLat: Float!
        gpsLng: Float!
        gpsAccuracyMeters: Float
        imageUrl: String!
        description: String
        deviceInfo: JSON
        clientHash: String
    }

    input ReleaseEscrowInput {
        proofId: ID!
        itemId: ID!
    }

    input RequestUploadUrlInput {
        projectId: ID!
        category: String!
        filename: String!
        contentType: String!
        sizeBytes: Int!
    }

    input MarketplaceFilters {
        damageType: DamageType
        status: ProjectStatus
        minFundedPercentage: Float
        maxFundedPercentage: Float
        search: String
        page: Int
        pageSize: Int
    }

    input CreateReviewInput {
        reviewableType: ReviewableType!
        reviewableId: ID!
        projectId: ID
        overallRating: Float!
        title: String
        body: String!
        ratings: [DimensionRatingInput!]!
    }

    input DimensionRatingInput {
        dimensionKey: String!
        score: Float!
    }
`;

// ─── Query & Mutation Root Types ────────────────────────────────────────────

const rootTypeDefs = `#graphql
    type Query {
        # ── Auth ────────────────────────────────────────────────────────────
        """Get current authenticated user profile"""
        me: User

        # ── Marketplace (Path 2: Public) ─────────────────────────────────
        """Browse published reconstruction projects"""
        marketplace(filters: MarketplaceFilters): PaginatedProjects!

        """Get project details by ID"""
        project(projectId: ID!): Project

        """Get BOQ items for a project"""
        projectBOQ(projectId: ID!): [BOQItem!]!

        # ── Role Dashboards ──────────────────────────────────────────────
        """Supplier dashboard statistics"""
        supplierStats: SupplierStats!

        """Engineer dashboard statistics"""
        engineerStats: EngineerStats!

        """Contractor dashboard statistics"""
        contractorStats: ContractorStats!

        """Tradesperson dashboard statistics"""
        tradespersonStats: TradespersonStats!

        # ── Notifications ─────────────────────────────────────────────────
        """Get user notifications (paginated)"""
        notifications(page: Int, pageSize: Int): PaginatedNotifications!

        # ── Donor ─────────────────────────────────────────────────────────
        """Get donor's escrow history"""
        donorEscrowHistory: [EscrowEntry!]!

        """Get donor's impact messages"""
        donorImpactMessages: [ImpactMessage!]!

        # ── Engineer ──────────────────────────────────────────────────────
        """Get engineer's assigned projects"""
        engineerProjects: [Project!]!

        # ── Supplier ─────────────────────────────────────────────────────
        """Get supplier's catalog items"""
        supplierCatalog: [SupplierCatalogItem!]!

        """Get supplier's purchase orders"""
        supplierOrders: [PurchaseOrder!]!

        # ── Spatial Proofs (Path 3) ──────────────────────────────────────
        """Get spatial proofs for a project"""
        spatialProofs(projectId: ID!): [SpatialProof!]!

        # ── Reviews ──────────────────────────────────────────────────────
        """Get reviews for an entity"""
        reviews(reviewableType: ReviewableType!, reviewableId: ID!): [Review!]!
    }

    type Mutation {
        # ── Auth ────────────────────────────────────────────────────────────
        """Register a new user account"""
        register(
            email: String!
            password: String!
            fullName: String!
            role: UserRole!
            phone: String
        ): AuthPayload!

        """Login with email and password"""
        login(email: String!, password: String!): AuthPayload!

        """Refresh JWT token"""
        refreshToken(refreshToken: String!): AuthPayload!

        # ── Projects (Path 1) ────────────────────────────────────────────
        """Create a new reconstruction project"""
        createProject(input: CreateProjectInput!): Project!

        """Add a BOQ item to a project"""
        addBOQItem(projectId: ID!, input: AddBOQItemInput!): BOQItem!

        # ── Donations (Path 2) ───────────────────────────────────────────
        """Create a donation with payment intent"""
        createDonation(input: CreateDonationInput!): PaymentIntent!

        # ── Spatial Proofs (Path 3) ──────────────────────────────────────
        """Submit a GPS-verified spatial proof"""
        submitSpatialProof(input: SubmitSpatialProofInput!): SpatialProof!

        # ── Escrow (Path 4) ──────────────────────────────────────────────
        """Release escrow funds after proof verification (admin only)"""
        releaseEscrow(input: ReleaseEscrowInput!): EscrowEntry!

        # ── Storage ──────────────────────────────────────────────────────
        """Request a pre-signed upload URL for direct-to-MinIO upload"""
        requestUploadUrl(input: RequestUploadUrlInput!): UploadUrl!

        # ── Notifications ─────────────────────────────────────────────────
        """Mark notification as read"""
        markNotificationRead(notificationId: ID!): Notification!

        """Mark all notifications as read"""
        markAllNotificationsRead: Boolean!

        # ── Supplier ─────────────────────────────────────────────────────
        """Acknowledge a purchase order"""
        acknowledgePO(poId: ID!): PurchaseOrder!

        """Update PO status (ship, deliver)"""
        updatePOStatus(poId: ID!, status: PoStatus!): PurchaseOrder!

        # ── Reviews ──────────────────────────────────────────────────────
        """Create a review for an entity"""
        createReview(input: CreateReviewInput!): Review!

        # ── Push Tokens ──────────────────────────────────────────────────
        """Register a device push token for notifications"""
        registerPushToken(
            deviceToken: String!
            platform: String!
            deviceId: String
        ): Boolean!
    }

    type AuthPayload {
        token: String!
        refreshToken: String
        user: User!
    }

    type Subscription {
        """Real-time notification stream"""
        notificationReceived: Notification!

        """Real-time project update stream"""
        projectUpdated(projectId: ID!): Project!
    }
`;

// ─── Schema Assembly ────────────────────────────────────────────────────────

import { resolvers } from '../resolvers/index';

const typeDefs = [commonTypeDefs, entityTypeDefs, inputTypeDefs, rootTypeDefs];

export const schema = makeExecutableSchema({ typeDefs, resolvers });
export { typeDefs, resolvers };
