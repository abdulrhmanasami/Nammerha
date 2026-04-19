export function mapUser(row: Record<string, unknown>) {
    return {
        userId: row['user_id'],
        email: row['email'],
        phone: row['phone'],
        fullName: row['full_name'],
        role: String(row['role']).toUpperCase(),
        avatarUrl: row['avatar_url'],
        kycVerificationStatus: String(row['kyc_verification_status']).toUpperCase(),
        isActive: row['is_active'],
        isEmailVerified: row['is_email_verified'] ?? false,
        roles: row['roles'] ?? [String(row['role']).toUpperCase()],
        createdAt: row['created_at'],
        updatedAt: row['updated_at'],
    };
}

export function mapNotification(row: Record<string, unknown>) {
    return {
        notificationId: row['notification_id'],
        userId: row['user_id'],
        type: String(row['type']).toUpperCase(),
        title: row['title'],
        body: row['body'],
        data: row['data'],
        channel: String(row['channel'] ?? 'in_app').toUpperCase(),
        isRead: row['is_read'],
        readAt: row['read_at'],
        createdAt: row['created_at'],
    };
}

export function mapEscrowEntry(row: Record<string, unknown>) {
    return {
        transactionId: row['transaction_id'],
        donorId: row['donor_id'],
        itemId: row['item_id'],
        projectId: row['project_id'],
        amountLocked: String(row['amount_locked'] ?? '0'),
        currency: row['currency'] ?? 'USD',
        paymentStatus: String(row['payment_status']).toUpperCase(),
        paymentMethod: row['payment_method'],
        paymentGatewayRef: row['payment_gateway_ref'],
        lockedAt: row['locked_at'],
        releasedAt: row['released_at'],
        releasedBy: row['released_by'],
        releaseProofId: row['release_proof_id'],
        giftRecipientName: row['gift_recipient_name'],
        giftMessage: row['gift_message'],
        donationIntent: row['donation_intent'] ? String(row['donation_intent']).toUpperCase() : null,
        createdAt: row['created_at'],
    };
}

export function mapSupplierCatalogItem(row: Record<string, unknown>) {
    return {
        catalogId: row['catalog_id'],
        supplierId: row['supplier_id'],
        materialName: row['material_name'],
        materialCategory: row['material_category'],
        description: row['description'],
        imageUrl: row['image_url'],
        unit: row['unit'],
        unitPriceGuide: String(row['unit_price_guide'] ?? '0'),
        minOrderQty: Number(row['min_order_qty'] ?? 1),
        leadTimeDays: Number(row['lead_time_days'] ?? 7),
        isActive: row['is_active'],
        createdAt: row['created_at'],
    };
}

export function mapPurchaseOrder(row: Record<string, unknown>) {
    return {
        poId: row['po_id'],
        poNumber: row['po_number'],
        itemId: row['item_id'],
        projectId: row['project_id'],
        supplierId: row['supplier_id'],
        amount: String(row['amount'] ?? '0'),
        currency: row['currency'] ?? 'USD',
        status: String(row['status']).toUpperCase(),
        materialName: row['material_name'],
        quantity: Number(row['quantity'] ?? 0),
        unit: row['unit'],
        unitPrice: String(row['unit_price'] ?? '0'),
        supplierName: row['supplier_name'],
        generatedAt: row['generated_at'],
        createdAt: row['created_at'],
    };
}

export function mapSpatialProof(row: Record<string, unknown>) {
    return {
        proofId: row['proof_id'],
        itemId: row['item_id'],
        projectId: row['project_id'],
        engineerId: row['engineer_id'],
        gpsCoordinates: row['gps_coordinates'],
        gpsAccuracyMeters: row['gps_accuracy_meters'] != null ? Number(row['gps_accuracy_meters']) : null,
        capturedAt: row['captured_at'],
        imageUrl: row['image_url'],
        imageHash: row['image_hash'],
        description: row['description'],
        deviceInfo: row['device_info'],
        verificationStatus: String(row['verification_status']).toUpperCase(),
        verifiedBy: row['verified_by'],
        verifiedAt: row['verified_at'],
        createdAt: row['created_at'],
    };
}

export function mapImpactMessage(row: Record<string, unknown>) {
    return {
        messageId: row['message_id'],
        donorId: row['donor_id'],
        projectId: row['project_id'],
        eventType: String(row['event_type']).toUpperCase(),
        titleEn: row['title_en'],
        titleAr: row['title_ar'],
        bodyEn: row['body_en'],
        bodyAr: row['body_ar'],
        metadata: row['metadata'] ?? {},
        readAt: row['read_at'],
        createdAt: row['created_at'],
    };
}

export function mapReview(row: Record<string, unknown>) {
    return {
        reviewId: row['review_id'],
        reviewerId: row['reviewer_id'],
        reviewableType: String(row['reviewable_type']).toUpperCase(),
        reviewableId: row['reviewable_id'],
        projectId: row['project_id'],
        overallRating: Number(row['overall_rating'] ?? 0),
        title: row['title'],
        body: row['body'],
        isVerifiedInteraction: row['is_verified_interaction'] ?? false,
        status: String(row['status'] ?? 'published').toUpperCase(),
        helpfulCount: Number(row['helpful_count'] ?? 0),
        createdAt: row['created_at'],
    };
}
