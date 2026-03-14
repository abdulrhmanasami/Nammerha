// ============================================================================
// Nammerha — Tour Definitions
// ============================================================================
// Declarative tour step data for each portal. Each tour targets existing HTML
// elements by CSS selector and provides bilingual content.
// ============================================================================

export interface TourStep {
    /** CSS selector for the target element */
    selector: string;
    /** Tooltip position relative to target */
    position?: 'top' | 'bottom' | 'left' | 'right';
    title_en: string;
    title_ar: string;
    content_en: string;
    content_ar: string;
}

export interface TourDefinition {
    id: string;
    steps: TourStep[];
}

export const TOUR_DEFINITIONS: Record<string, TourDefinition> = {

    // ─── Homeowner Portal ───────────────────────────────────────────────
    homeowner: {
        id: 'homeowner',
        steps: [
            {
                selector: '#tab-dashboard',
                position: 'right',
                title_en: 'Your Dashboard',
                title_ar: 'لوحة التحكم',
                content_en: 'This is your home base. See all active projects, pending approvals, and escrow balances at a glance.',
                content_ar: 'هذه لوحتك الرئيسية. شاهد جميع مشاريعك النشطة والموافقات المعلقة وأرصدة الضمان.',
            },
            {
                selector: '#kpi-active',
                position: 'bottom',
                title_en: 'Active Projects',
                title_ar: 'المشاريع النشطة',
                content_en: 'Track how many reconstruction projects are currently in progress.',
                content_ar: 'تتبع عدد مشاريع إعادة الإعمار الجارية حالياً.',
            },
            {
                selector: '#tab-projects',
                position: 'right',
                title_en: 'My Projects',
                title_ar: 'مشاريعي',
                content_en: 'View all your damage reports and their lifecycle — from submission to completion.',
                content_ar: 'اعرض جميع تقارير الأضرار ودورة حياتها — من الإرسال حتى الاكتمال.',
            },
            {
                selector: '#tab-requests',
                position: 'right',
                title_en: 'Service Requests',
                title_ar: 'طلبات الخدمة',
                content_en: 'Need a plumber or electrician? Post a repair request and we\'ll match nearby tradespeople.',
                content_ar: 'تحتاج سباكاً أو كهربائياً؟ أرسل طلب إصلاح وسنبحث لك عن حرفيين قريبين.',
            },
            {
                selector: '#tab-approvals',
                position: 'right',
                title_en: 'Approvals',
                title_ar: 'الموافقات',
                content_en: 'Review and approve engineer assessments and construction phase completions.',
                content_ar: 'راجع ووافق على تقييمات المهندسين واكتمال مراحل البناء.',
            },
            {
                selector: 'a[href="/homeowner-report.html"]',
                position: 'top',
                title_en: 'Report Damage',
                title_ar: 'أبلغ عن ضرر',
                content_en: 'Start here! Click this button to submit a new damage report with photos and GPS location.',
                content_ar: 'ابدأ من هنا! اضغط هذا الزر لإرسال تقرير ضرر جديد مع صور وموقع GPS.',
            },
        ],
    },

    // ─── Contractor Portal ──────────────────────────────────────────────
    contractor: {
        id: 'contractor',
        steps: [
            {
                selector: '#tab-dashboard',
                position: 'right',
                title_en: 'Contractor Dashboard',
                title_ar: 'لوحة تحكم المقاول',
                content_en: 'Your command center — see project stats, active bids, and team assignments.',
                content_ar: 'مركز القيادة — شاهد إحصائيات المشاريع والعطاءات النشطة وتعيينات الفريق.',
            },
            {
                selector: '#tab-bids',
                position: 'right',
                title_en: 'My Bids',
                title_ar: 'عطاءاتي',
                content_en: 'Browse available projects and submit competitive bids. Track bid status in real-time.',
                content_ar: 'تصفح المشاريع المتاحة وقدّم عطاءات تنافسية. تتبع حالة العطاء في الوقت الفعلي.',
            },
            {
                selector: '#tab-team',
                position: 'right',
                title_en: 'Team Management',
                title_ar: 'إدارة الفريق',
                content_en: 'Assign tradespersons to your projects. Manage your workforce efficiently.',
                content_ar: 'عيّن الحرفيين في مشاريعك. أدِر فريق العمل بكفاءة.',
            },
            {
                selector: '#tab-payments',
                position: 'right',
                title_en: 'Payments',
                title_ar: 'المدفوعات',
                content_en: 'Track escrow releases, milestone payments, and invoicing.',
                content_ar: 'تتبع إفراج الضمان، دفعات المراحل، والفوترة.',
            },
        ],
    },

    // ─── Engineer Portal ────────────────────────────────────────────────
    engineer: {
        id: 'engineer',
        steps: [
            {
                selector: '#tab-dashboard',
                position: 'right',
                title_en: 'Engineer Dashboard',
                title_ar: 'لوحة تحكم المهندس',
                content_en: 'See your assigned projects, bidding opportunities, and performance score.',
                content_ar: 'شاهد مشاريعك المعيّنة وفرص التقديم ونقاط أدائك.',
            },
            {
                selector: '#tab-assigned',
                position: 'right',
                title_en: 'Assigned Projects',
                title_ar: 'المشاريع المعيّنة',
                content_en: 'Projects assigned to you for assessment. Create BOQs and verify construction phases.',
                content_ar: 'المشاريع المعيّنة لك للتقييم. أنشئ جداول الكميات وتحقق من مراحل البناء.',
            },
            {
                selector: '#tab-bids',
                position: 'right',
                title_en: 'My Bids',
                title_ar: 'عطاءاتي',
                content_en: 'Track your submitted bids and their acceptance status.',
                content_ar: 'تتبع عطاءاتك المقدمة وحالة قبولها.',
            },
        ],
    },

    // ─── Supplier Portal ────────────────────────────────────────────────
    supplier: {
        id: 'supplier',
        steps: [
            {
                selector: '#tab-dashboard',
                position: 'right',
                title_en: 'Supplier Dashboard',
                title_ar: 'لوحة تحكم المورّد',
                content_en: 'Overview of your catalog, pending orders, and revenue metrics.',
                content_ar: 'نظرة عامة على كتالوجك، الطلبات المعلقة، ومقاييس الإيرادات.',
            },
            {
                selector: '#tab-catalog',
                position: 'right',
                title_en: 'Catalog',
                title_ar: 'الكتالوج',
                content_en: 'Manage your construction materials catalog — add products, set prices, update stock.',
                content_ar: 'أدِر كتالوج مواد البناء — أضف منتجات، حدد الأسعار، حدّث المخزون.',
            },
            {
                selector: '#tab-orders',
                position: 'right',
                title_en: 'Orders',
                title_ar: 'الطلبات',
                content_en: 'Process incoming purchase orders. Confirm, ship, and track deliveries.',
                content_ar: 'عالج أوامر الشراء الواردة. أكّد، شحن، وتتبع عمليات التسليم.',
            },
        ],
    },

    // ─── Tradesperson Portal ────────────────────────────────────────────
    tradesperson: {
        id: 'tradesperson',
        steps: [
            {
                selector: '#tab-dashboard',
                position: 'right',
                title_en: 'Tradesperson Dashboard',
                title_ar: 'لوحة تحكم الحرفي',
                content_en: 'See available jobs, your current assignments, and earnings summary.',
                content_ar: 'شاهد الوظائف المتاحة، تعييناتك الحالية، وملخص الأرباح.',
            },
            {
                selector: '#tab-jobs',
                position: 'right',
                title_en: 'Available Jobs',
                title_ar: 'الوظائف المتاحة',
                content_en: 'Browse service requests from homeowners that match your trade. Accept jobs to start working.',
                content_ar: 'تصفح طلبات الخدمة من أصحاب المنازل التي تناسب حرفتك. اقبل الوظائف للبدء.',
            },
            {
                selector: '#tab-assignments',
                position: 'right',
                title_en: 'My Assignments',
                title_ar: 'تعييناتي',
                content_en: 'Contractor-assigned work. Accept or decline assignments from teams you work with.',
                content_ar: 'أعمال مُعيّنة من المقاولين. اقبل أو ارفض التعيينات من الفرق التي تعمل معها.',
            },
        ],
    },

    // ─── Admin Dashboard ────────────────────────────────────────────────
    admin: {
        id: 'admin',
        steps: [
            {
                selector: '#tab-overview',
                position: 'right',
                title_en: 'Platform Overview',
                title_ar: 'نظرة عامة على المنصة',
                content_en: 'Key platform metrics: total users, active projects, escrow volume, and compliance status.',
                content_ar: 'مقاييس المنصة الرئيسية: إجمالي المستخدمين، المشاريع النشطة، حجم الضمان، وحالة الامتثال.',
            },
            {
                selector: '#tab-kyc',
                position: 'right',
                title_en: 'KYC Verification',
                title_ar: 'التحقق من الهوية',
                content_en: 'Review and approve identity verification submissions from new users.',
                content_ar: 'مراجعة والموافقة على طلبات التحقق من الهوية للمستخدمين الجدد.',
            },
            {
                selector: '#tab-escrow',
                position: 'right',
                title_en: 'Escrow Management',
                title_ar: 'إدارة الضمان',
                content_en: 'Oversee frozen escrow funds, approve milestone releases, and resolve disputes.',
                content_ar: 'الإشراف على أموال الضمان المجمّدة، الموافقة على إفراج المراحل، وحل النزاعات.',
            },
        ],
    },
};
