/// Nammerha Demo Mode — Realistic Mock Data
/// Syrian reconstruction projects with Arabic names and realistic BOQ data
class MockData {
  MockData._();

  // ─── USERS ─────────────────────────────────────────────────────
  static const Map<String, dynamic> donorUser = {
    'userId': 'donor_001',
    'fullName': 'أحمد الخالدي',
    'email': 'ahmad@example.com',
    'role': 'DONOR',
    'kycVerificationStatus': 'VERIFIED',
    'avatarInitial': 'أ',
  };

  static const Map<String, dynamic> engineerUser = {
    'userId': 'eng_001',
    'fullName': 'م. سارة المحمد',
    'email': 'sara.eng@example.com',
    'role': 'ENGINEER',
    'kycVerificationStatus': 'VERIFIED',
    'avatarInitial': 'س',
  };

  static const Map<String, dynamic> supplierUser = {
    'userId': 'sup_001',
    'fullName': 'شركة البناء الحديث',
    'email': 'supplier@example.com',
    'role': 'SUPPLIER',
    'kycVerificationStatus': 'VERIFIED',
    'avatarInitial': 'ش',
  };

  // ─── MARKETPLACE PROJECTS ────────────────────────────────────
  static const List<Map<String, dynamic>> marketplaceProjects = [
    {
      'projectId': 'proj_001',
      'title': 'ترميم منزل عائلة الحسين — حلب',
      'description': 'إعادة ترميم منزل من طابقين في حي الحمدانية بحلب. المنزل تعرض لأضرار هيكلية جزئية تشمل الجدران الخارجية والسقف. يحتاج إلى إعادة بناء الجدران وتجديد شبكة الكهرباء والسباكة.',
      'damageType': 'هيكلي جزئي',
      'status': 'ACTIVE',
      'totalEstimatedCost': 1250000,
      'fundedPercentage': 67.5,
      'homeownerName': 'عبد الرحمن الحسين',
      'addressText': 'حي الحمدانية، حلب',
      'latitude': 36.2021,
      'longitude': 37.1343,
    },
    {
      'projectId': 'proj_002',
      'title': 'إعادة بناء مدرسة النور — حمص',
      'description': 'مشروع إعادة بناء مدرسة ابتدائية في حي الوعر بحمص. المدرسة تخدم أكثر من 200 طالب وتحتاج إلى ترميم شامل للصفوف والملعب وتجديد المرافق الصحية.',
      'damageType': 'تدمير كامل',
      'status': 'ACTIVE',
      'totalEstimatedCost': 3500000,
      'fundedPercentage': 23.0,
      'homeownerName': 'مديرية التربية — حمص',
      'addressText': 'حي الوعر، حمص',
      'latitude': 34.7325,
      'longitude': 36.7139,
    },
    {
      'projectId': 'proj_003',
      'title': 'ترميم منزل عائلة الشعار — دمشق',
      'description': 'ترميم شقة سكنية في منطقة المزة بدمشق. الأضرار تشمل الواجهة والنوافذ والأرضيات بسبب الانفجارات القريبة.',
      'damageType': 'أضرار سطحية',
      'status': 'ACTIVE',
      'totalEstimatedCost': 450000,
      'fundedPercentage': 91.2,
      'homeownerName': 'محمد الشعار',
      'addressText': 'المزة، دمشق',
      'latitude': 33.5138,
      'longitude': 36.2765,
    },
    {
      'projectId': 'proj_004',
      'title': 'مركز صحي مجتمعي — الرقة',
      'description': 'بناء مركز صحي مجتمعي بسعة 50 مريض يومياً في مدينة الرقة. يشمل عيادات عامة وأسنان ومختبر تحاليل.',
      'damageType': 'بناء جديد',
      'status': 'ACTIVE',
      'totalEstimatedCost': 5200000,
      'fundedPercentage': 12.8,
      'homeownerName': 'جمعية الإغاثة',
      'addressText': 'وسط المدينة، الرقة',
      'latitude': 35.9528,
      'longitude': 39.0079,
    },
    {
      'projectId': 'proj_005',
      'title': 'ترميم سوق المدينة — حلب القديمة',
      'description': 'مشروع ترميم جزء من سوق المدينة التاريخي في حلب القديمة. يهدف لاستعادة المحلات التجارية وترميم الأقواس الحجرية.',
      'damageType': 'تراثي',
      'status': 'ACTIVE',
      'totalEstimatedCost': 8750000,
      'fundedPercentage': 5.3,
      'homeownerName': 'بلدية حلب القديمة',
      'addressText': 'المدينة القديمة، حلب',
      'latitude': 36.1990,
      'longitude': 37.1560,
    },
  ];

  // ─── BOQ ITEMS (for proj_001) ─────────────────────────────────
  static const List<Map<String, dynamic>> boqItems = [
    {
      'itemId': 'boq_001',
      'materialName': 'إسمنت بورتلاندي',
      'requiredQuantity': 200,
      'unit': 'كيس',
      'unitPrice': 2500,
      'fundedPercentage': 85.0,
      'status': 'PARTIALLY_FUNDED',
    },
    {
      'itemId': 'boq_002',
      'materialName': 'حديد تسليح ø12',
      'requiredQuantity': 5,
      'unit': 'طن',
      'unitPrice': 180000,
      'fundedPercentage': 100.0,
      'status': 'FULLY_FUNDED',
    },
    {
      'itemId': 'boq_003',
      'materialName': 'طابوق أحمر',
      'requiredQuantity': 5000,
      'unit': 'قطعة',
      'unitPrice': 150,
      'fundedPercentage': 40.0,
      'status': 'PARTIALLY_FUNDED',
    },
    {
      'itemId': 'boq_004',
      'materialName': 'رمل ناعم',
      'requiredQuantity': 15,
      'unit': 'متر مكعب',
      'unitPrice': 15000,
      'fundedPercentage': 0.0,
      'status': 'UNFUNDED',
    },
    {
      'itemId': 'boq_005',
      'materialName': 'أسلاك كهربائية',
      'requiredQuantity': 500,
      'unit': 'متر',
      'unitPrice': 350,
      'fundedPercentage': 60.0,
      'status': 'PARTIALLY_FUNDED',
    },
    {
      'itemId': 'boq_006',
      'materialName': 'أنابيب مياه PVC',
      'requiredQuantity': 100,
      'unit': 'متر',
      'unitPrice': 800,
      'fundedPercentage': 0.0,
      'status': 'UNFUNDED',
    },
  ];

  // ─── DONATION HISTORY ─────────────────────────────────────────
  static const List<Map<String, dynamic>> donationHistory = [
    {
      'transactionId': 'txn_001',
      'projectTitle': 'ترميم منزل عائلة الحسين — حلب',
      'materialName': 'إسمنت بورتلاندي',
      'amountLocked': 125000,
      'currency': 'SYP',
      'paymentStatus': 'SUCCESS',
      'paymentMethod': 'fatora',
      'lockedAt': '2026-04-15T10:30:00Z',
    },
    {
      'transactionId': 'txn_002',
      'projectTitle': 'إعادة بناء مدرسة النور — حمص',
      'materialName': 'حديد تسليح ø12',
      'amountLocked': 360000,
      'currency': 'SYP',
      'paymentStatus': 'ESCROW_RELEASED',
      'paymentMethod': 'fatora',
      'lockedAt': '2026-03-28T14:15:00Z',
    },
    {
      'transactionId': 'txn_003',
      'projectTitle': 'ترميم منزل عائلة الشعار — دمشق',
      'materialName': 'طابوق أحمر',
      'amountLocked': 75000,
      'currency': 'SYP',
      'paymentStatus': 'SUCCESS',
      'paymentMethod': 'fatora',
      'lockedAt': '2026-04-01T08:45:00Z',
    },
  ];

  // ─── ENGINEER PROJECTS ─────────────────────────────────────────
  static const List<Map<String, dynamic>> engineerProjects = [
    {
      'projectId': 'proj_001',
      'title': 'ترميم منزل عائلة الحسين — حلب',
      'totalEstimatedCost': 1250000,
      'fundedPercentage': 67.5,
      'status': 'قيد التنفيذ',
      'pendingProofs': 3,
    },
    {
      'projectId': 'proj_003',
      'title': 'ترميم منزل عائلة الشعار — دمشق',
      'totalEstimatedCost': 450000,
      'fundedPercentage': 91.2,
      'status': 'جاهز للتسليم',
      'pendingProofs': 1,
    },
  ];

  // ─── ENGINEER BIDS ─────────────────────────────────────────────
  static const List<Map<String, dynamic>> engineerBids = [
    {
      'bidId': 'bid_001',
      'projectTitle': 'مركز صحي مجتمعي — الرقة',
      'bidAmount': 520000,
      'status': 'قيد المراجعة',
      'submittedAt': '2026-04-18T12:00:00Z',
      'methodology': 'فريق من 8 عمال مع إشراف هندسي يومي',
    },
    {
      'bidId': 'bid_002',
      'projectTitle': 'ترميم سوق المدينة — حلب القديمة',
      'bidAmount': 875000,
      'status': 'مقبول',
      'submittedAt': '2026-04-10T09:30:00Z',
      'methodology': 'ترميم تراثي متخصص مع مواد محلية',
    },
    {
      'bidId': 'bid_003',
      'projectTitle': 'إعادة بناء مدرسة النور — حمص',
      'bidAmount': 350000,
      'status': 'مرفوض',
      'submittedAt': '2026-03-20T15:00:00Z',
      'methodology': 'تنفيذ مرحلي على 4 أشهر',
    },
  ];

  // ─── SUPPLIER ORDERS ───────────────────────────────────────────
  static const List<Map<String, dynamic>> supplierOrders = [
    {
      'orderId': 'po_001',
      'projectTitle': 'ترميم منزل عائلة الحسين — حلب',
      'materialName': 'إسمنت بورتلاندي',
      'quantity': 100,
      'unit': 'كيس',
      'totalAmount': 250000,
      'status': 'مُعلّق',
      'createdAt': '2026-04-19T08:00:00Z',
    },
    {
      'orderId': 'po_002',
      'projectTitle': 'إعادة بناء مدرسة النور — حمص',
      'materialName': 'حديد تسليح ø12',
      'quantity': 3,
      'unit': 'طن',
      'totalAmount': 540000,
      'status': 'قيد التوصيل',
      'createdAt': '2026-04-15T10:00:00Z',
    },
    {
      'orderId': 'po_003',
      'projectTitle': 'ترميم منزل عائلة الشعار — دمشق',
      'materialName': 'طابوق أحمر',
      'quantity': 2000,
      'unit': 'قطعة',
      'totalAmount': 300000,
      'status': 'تم التسليم',
      'createdAt': '2026-04-01T14:00:00Z',
    },
  ];

  // ─── ESCROW SUMMARY ─────────────────────────────────────────────
  static const Map<String, dynamic> escrowSummary = {
    'totalLocked': 200000,
    'totalReleased': 360000,
    'totalRefunded': 0,
    'activeEscrows': 2,
  };

  // ─── DASHBOARD STATS ─────────────────────────────────────────────
  static const Map<String, dynamic> donorStats = {
    'totalDonated': 560000,
    'activeProjects': 3,
    'proofsSeen': 7,
    'impactScore': 84,
  };

  static const Map<String, dynamic> engineerStats = {
    'assignedProjects': 2,
    'pendingProofs': 4,
    'verifiedProofs': 12,
    'totalRevenue': 890000,
  };

  static const Map<String, dynamic> supplierStats = {
    'pendingOrders': 1,
    'inTransit': 1,
    'delivered': 1,
    'totalRevenue': 1090000,
  };

  /// Get user data by role
  static Map<String, dynamic> getUserByRole(String role) {
    switch (role) {
      case 'ENGINEER':
        return engineerUser;
      case 'SUPPLIER':
        return supplierUser;
      default:
        return donorUser;
    }
  }

  /// Get stats by role
  static Map<String, dynamic> getStatsByRole(String role) {
    switch (role) {
      case 'ENGINEER':
        return engineerStats;
      case 'SUPPLIER':
        return supplierStats;
      default:
        return donorStats;
    }
  }

  /// Format currency (SYP)
  static String formatCurrency(num amount) {
    final formatted = amount.toStringAsFixed(0).replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    );
    return '$formatted ل.س';
  }
}
