// ============================================================================
// Nammerha — Tour Definitions (Platinum Standard)
// ============================================================================
// GAP-05 FIX: Premium onboarding tour content with human-centered storytelling.
//
// Design Philosophy:
//   - Each tour tells a STORY, not a feature list
//   - First step always creates emotional context ("Why you're here")
//   - Middle steps teach by showing, not telling
//   - Last step is always a CALL TO ACTION ("Start here!")
//   - Arabic content is NATIVELY WRITTEN, not translated
//   - Icons use the UNIFIED Phosphor icon system (self-hosted)
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

// ─── Phosphor Icon Inline Helper ────────────────────────────────────────
// Unified with the project's `<i class="ph ph-{name}">` pattern.
// Self-hosted at /fonts/phosphor/phosphor.css — zero CDN dependency.
const ph = (name: string): string =>
  `<i class="ph ph-${name} nm-tour-icon" aria-hidden="true"></i>`;

export const TOUR_DEFINITIONS: Record<string, TourDefinition> = {
  // ─── Homepage / Landing Tour (First-Time Visitors) ──────────────────
  homepage: {
    id: 'homepage',
    steps: [
      {
        selector: '#main-map',
        position: 'bottom',
        title_en: `${ph('globe')}A Living Map of Hope`,
        title_ar: `${ph('globe')}خريطة حيّة للأمل`,
        content_en:
          'Every pin on this map is a real family waiting for their home to be rebuilt. Tap any marker to see their story — and how you can help.',
        content_ar:
          'كل دبوس على هذه الخريطة يمثل عائلة حقيقية تنتظر إعادة بناء منزلها. اضغط على أي علامة لتعرف قصتهم — وكيف يمكنك المساعدة.',
      },
      {
        selector: '#projects-carousel',
        position: 'top',
        title_en: `${ph('buildings')}Projects That Need You`,
        title_ar: `${ph('buildings')}مشاريع تحتاج لك`,
        content_en:
          "These aren't abstract numbers — each card is a real house with verified materials and progress updates tracked by GPS.",
        content_ar:
          'هذه ليست أرقام مجردة — كل بطاقة هي منزل حقيقي بمواد موثّقة وتحديثات تقدم متتبّعة بنظام GPS.',
      },
      {
        selector: '#search-input',
        position: 'bottom',
        title_en: `${ph('magnifying-glass')}Find Any Neighborhood`,
        title_ar: `${ph('magnifying-glass')}ابحث عن أي حي`,
        content_en:
          'Search by city, district, or project name. Every neighborhood in Syria is covered.',
        content_ar: 'ابحث بالمدينة أو الحي أو اسم المشروع. كل حي في سوريا مشمول.',
      },
      {
        selector: '#quick-actions-grid',
        position: 'top',
        title_en: `${ph('lightning')}Get Started Now`,
        title_ar: `${ph('lightning')}ابدأ الآن`,
        content_en:
          "Whether you're a homeowner reporting damage, an engineer writing a BOQ, or a contractor bidding on projects — start right here.",
        content_ar:
          'سواء كنت صاحب منزل يُبلغ عن ضرر، أو مهندساً يكتب جدول كميات، أو مقاولاً يتقدم بعطاء — ابدأ من هنا.',
      },
    ],
  },

  // ─── Project Details Tour (When viewing a specific project) ──────────
  project: {
    id: 'project',
    steps: [
      {
        selector: '#hero-section',
        position: 'bottom',
        title_en: `${ph('map-pin')}This Is Real`,
        title_ar: `${ph('map-pin')}هذا حقيقي`,
        content_en:
          'Every project is GPS-verified. The location, damage assessment, and cost estimates are validated by licensed engineers on the ground.',
        content_ar:
          'كل مشروع موثّق بنظام GPS. الموقع وتقييم الأضرار وتقديرات التكلفة مُصادق عليها من مهندسين مرخّصين ميدانياً.',
      },
      {
        selector: '#transparency-toggle',
        position: 'bottom',
        title_en: `${ph('shield-check')}Full Transparency`,
        title_ar: `${ph('shield-check')}شفافية كاملة`,
        content_en:
          'Expand this to see exactly where your payment is in the pipeline — from planning to GPS-verified delivery.',
        content_ar:
          'وسّع هذا لترى بالضبط أين تبرعك في المسار — من التخطيط حتى التسليم المُوثّق بـ GPS.',
      },
      {
        selector: '#boq-container, #boq-skeleton',
        position: 'top',
        title_en: `${ph('package')}Transparent Bill of Quantities`,
        title_ar: `${ph('package')}جدول كميات شفاف`,
        content_en:
          'Every material is itemized with real costs. See exactly what each house needs: cement, wiring, windows \u2014 all verified by licensed engineers.',
        content_ar:
          'كل مادة مسجّلة بتكاليف حقيقية. شاهد بالضبط ما يحتاجه كل منزل: إسمنت، أسلاك، نوافذ \u2014 كل شيء موثّق من مهندسين مرخّصين.',
      },
      {
        selector: '.add-to-cart-btn',
        position: 'top',
        title_en: `${ph('eye')}Track Every Material`,
        title_ar: `${ph('eye')}تتبّع كل مادة`,
        content_en:
          'Each material is GPS-tracked from procurement to delivery. Full transparency from start to finish.',
        content_ar:
          'كل مادة متتبّعة بنظام GPS من الشراء حتى التسليم. شفافية كاملة من البداية للنهاية.',
      },
    ],
  },

  // ─── Homeowner Portal ───────────────────────────────────────────────
  homeowner: {
    id: 'homeowner',
    steps: [
      {
        selector: '#tab-dashboard',
        position: 'right',
        title_en: `${ph('house')}Welcome Home`,
        title_ar: `${ph('house')}أهلاً بك في بيتك`,
        content_en:
          'This is your personal recovery center. See every project, every approval, every escrow balance — all in one place.',
        content_ar:
          'هذا مركز التعافي الخاص بك. شاهد كل مشروع، كل موافقة، كل رصيد ضمان — في مكان واحد.',
      },
      {
        selector: '#kpi-active',
        position: 'bottom',
        title_en: `${ph('chart-line-up')}Live Progress`,
        title_ar: `${ph('chart-line-up')}تقدم مباشر`,
        content_en:
          'These numbers update in real-time. Track how many reconstruction phases are active right now.',
        content_ar: 'هذه الأرقام تُحدّث لحظياً. تتبّع عدد مراحل إعادة الإعمار النشطة الآن.',
      },
      {
        selector: '#tab-projects',
        position: 'right',
        title_en: `${ph('clipboard-text')}Your Projects`,
        title_ar: `${ph('clipboard-text')}مشاريعك`,
        content_en:
          "Every damage report you've submitted lives here — from first submission to completion. Nothing goes missing.",
        content_ar: 'كل تقرير ضرر قدّمته موجود هنا — من الإرسال الأول حتى الاكتمال. لا شيء يضيع.',
      },
      {
        selector: '#tab-requests',
        position: 'right',
        title_en: `${ph('wrench')}Need a Repair?`,
        title_ar: `${ph('wrench')}تحتاج إصلاحاً؟`,
        content_en:
          "Need a plumber or electrician? Post a request and we'll match you with nearby verified tradespeople automatically.",
        content_ar:
          'تحتاج سبّاكاً أو كهربائياً؟ أرسل طلباً وسنربطك بحرفيين موثّقين قريبين منك تلقائياً.',
      },
      {
        selector: '#tab-approvals',
        position: 'right',
        title_en: `${ph('check-square')}Your Approval Power`,
        title_ar: `${ph('check-square')}صلاحية الموافقة`,
        content_en:
          'You have the final say. Review engineer assessments and approve construction milestones before funds are released.',
        content_ar:
          'القرار النهائي لك. راجع تقييمات المهندسين ووافق على مراحل البناء قبل صرف الأموال.',
      },
      {
        selector: 'a[href="/homeowner-report.html"]',
        position: 'top',
        title_en: `${ph('arrow-right')}Start Here — Report Damage`,
        title_ar: `${ph('arrow-right')}ابدأ من هنا — أبلغ عن ضرر`,
        content_en:
          'Ready? Click this button to submit your first damage report with photos and GPS location. An engineer will be assigned within 48 hours.',
        content_ar:
          'جاهز؟ اضغط هنا لإرسال تقرير ضرر جديد بالصور وموقع GPS. سيتم تعيين مهندس خلال 48 ساعة.',
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
        title_en: `${ph('hard-hat')}Your Command Center`,
        title_ar: `${ph('hard-hat')}مركز قيادتك`,
        content_en:
          'Welcome, builder. Your dashboard shows live project stats, active bids, team assignments, and escrow status — everything at a glance.',
        content_ar:
          'أهلاً أيها البنّاء. لوحتك تعرض إحصائيات المشاريع، العطاءات النشطة، تعيينات الفريق، وحالة الضمان — كل شيء بنظرة واحدة.',
      },
      {
        selector: '#tab-bids',
        position: 'right',
        title_en: `${ph('note-pencil')}Win Projects`,
        title_ar: `${ph('note-pencil')}اربح مشاريعاً`,
        content_en:
          'Browse available reconstruction projects and submit competitive bids. Our transparent system ensures fair selection.',
        content_ar:
          'تصفّح مشاريع إعادة الإعمار المتاحة وقدّم عطاءات تنافسية. نظامنا الشفاف يضمن اختياراً عادلاً.',
      },
      {
        // F-006 FIX: Was #tab-team — no 'team' tab exists in contractor portal.
        // Contractor ALL_TABS: ['dashboard', 'marketplace', 'bids', 'payments'].
        // Remapped to #tab-marketplace which is where contractor manages projects.
        selector: '#tab-marketplace',
        position: 'right',
        title_en: `${ph('users-three')}Build Your Team`,
        title_ar: `${ph('users-three')}ابنِ فريقك`,
        content_en:
          "Browse available projects and assign your tradespeople. Track who's working where and optimize your workforce.",
        content_ar: 'تصفّح المشاريع المتاحة وعيّن حرفييك. تتبّع من يعمل أين وحسّن فريق عملك.',
      },
      {
        selector: '#tab-payments',
        position: 'right',
        title_en: `${ph('vault')}Transparent Payments`,
        title_ar: `${ph('vault')}مدفوعات شفافة`,
        content_en:
          'Every payment is milestone-based and escrow-protected. You get paid when GPS-verified proof confirms delivery. No disputes.',
        content_ar:
          'كل دفعة مرتبطة بمرحلة ومحمية بالضمان. تحصل على أموالك عندما يؤكد إثبات GPS التسليم. بدون نزاعات.',
      },
    ],
  },

  // ─── Engineer Portal ────────────────────────────────────────────────
  engineer: {
    id: 'engineer',
    steps: [
      {
        // F-006 FIX: Was #tab-dashboard — engineer portal has no 'dashboard' tab.
        // Engineer tabs: ['projects', 'bids', 'captures']. Default is 'projects'.
        selector: '#tab-projects',
        position: 'right',
        title_en: `${ph('ruler')}Engineer Dashboard`,
        title_ar: `${ph('ruler')}لوحة المهندس`,
        content_en:
          'Your professional workspace. See assigned projects, bidding opportunities, and your verified performance score.',
        content_ar:
          'مساحة عملك المهنية. شاهد المشاريع المعيّنة وفرص التقديم ونقاط أدائك المُوثّقة.',
      },
      {
        // F-006 FIX: Was #tab-assigned — engineer portal has no 'assigned' tab.
        // The 'captures' tab is where engineers do field GPS verification.
        selector: '#tab-captures',
        position: 'right',
        title_en: `${ph('clipboard-text')}Field Captures & Assessments`,
        title_ar: `${ph('clipboard-text')}الالتقاطات الميدانية والتقييمات`,
        content_en:
          'Projects assigned to you for professional assessment. Create FIDIC-compliant BOQs and verify each construction phase with GPS-stamped evidence.',
        content_ar:
          'المشاريع المعيّنة لك للتقييم المهني. أنشئ جداول كميات متوافقة مع FIDIC وتحقق من كل مرحلة بإثبات GPS.',
      },
      {
        selector: '#tab-bids',
        position: 'right',
        title_en: `${ph('target')}Find Opportunities`,
        title_ar: `${ph('target')}اعثر على فرص`,
        content_en:
          'Browse new damage reports and bid on assessment contracts. Your reputation score influences selection priority.',
        content_ar:
          'تصفّح تقارير الأضرار الجديدة وقدّم عطاءات على عقود التقييم. سمعتك تؤثر على أولوية الاختيار.',
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
        title_en: `${ph('package')}Supplier Hub`,
        title_ar: `${ph('package')}مركز الموردين`,
        content_en:
          'Your supply chain at a glance — catalog health, pending orders, revenue trends, and delivery metrics.',
        content_ar:
          'سلسلة التوريد بنظرة — صحة الكتالوج، الطلبات المعلّقة، اتجاهات الإيرادات، ومقاييس التسليم.',
      },
      {
        selector: '#tab-catalog',
        position: 'right',
        title_en: `${ph('list')}Your Catalog`,
        title_ar: `${ph('list')}كتالوجك`,
        content_en:
          'List your construction materials — cement, steel, pipes. Set competitive prices and real-time stock levels.',
        content_ar:
          'ادرج مواد البناء — إسمنت، حديد، أنابيب. حدد أسعاراً تنافسية ومستويات مخزون لحظية.',
      },
      {
        selector: '#tab-orders',
        position: 'right',
        title_en: `${ph('truck')}Incoming Orders`,
        title_ar: `${ph('truck')}الطلبات الواردة`,
        content_en:
          'Process purchase orders from verified contractors. Confirm, ship, and upload GPS delivery proof to release escrow payment.',
        content_ar:
          'عالج أوامر الشراء من مقاولين موثّقين. أكّد، شحن، وارفع إثبات تسليم GPS لصرف دفعة الضمان.',
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
        title_en: `${ph('wrench')}Your Work, Your Way`,
        title_ar: `${ph('wrench')}شغلك، بطريقتك`,
        content_en:
          'See available jobs, current assignments, and your earnings — all updated in real time. Pick jobs that match your skills.',
        content_ar:
          'شاهد الوظائف المتاحة، التعيينات الحالية، وأرباحك — كل شيء محدّث لحظياً. اختر ما يناسب مهاراتك.',
      },
      {
        // F-006 FIX: Was #tab-jobs — tradesperson portal has no 'jobs' tab.
        // Tradesperson ALL_TABS: ['dashboard', 'requests', 'assignments', 'earnings'].
        // 'requests' is where tradespeople browse available work.
        selector: '#tab-requests',
        position: 'right',
        title_en: `${ph('map-pin')}Jobs Near You`,
        title_ar: `${ph('map-pin')}وظائف قريبة منك`,
        content_en:
          'Homeowners need your skills. Browse repair requests sorted by distance and trade type. Accept a job to start earning.',
        content_ar:
          'أصحاب المنازل يحتاجون مهاراتك. تصفّح طلبات الإصلاح حسب المسافة ونوع الحرفة. اقبل وظيفة لبدء الكسب.',
      },
      {
        selector: '#tab-assignments',
        position: 'right',
        title_en: `${ph('clipboard-text')}Team Assignments`,
        title_ar: `${ph('clipboard-text')}تعيينات الفريق`,
        content_en:
          'Work on bigger projects through contractor teams. Accept assignments, track milestones, and get paid on time.',
        content_ar:
          'اعمل على مشاريع أكبر من خلال فرق المقاولين. اقبل التعيينات، تتبّع المراحل، واحصل على أموالك بالوقت.',
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
        title_en: `${ph('gauge')}Platform Pulse`,
        title_ar: `${ph('gauge')}نبض المنصة`,
        content_en:
          'The operational nerve center. Total users, active projects, escrow volume, compliance status — live KPIs for the entire platform.',
        content_ar:
          'مركز الأعصاب التشغيلي. إجمالي المستخدمين، المشاريع النشطة، حجم الضمان، حالة الامتثال — مؤشرات أداء لحظية للمنصة بأكملها.',
      },
      {
        selector: '#tab-kyc',
        position: 'right',
        title_en: `${ph('shield-check')}Identity Verification`,
        title_ar: `${ph('shield-check')}التحقق من الهوية`,
        content_en:
          'Review KYC submissions from new users. Our AI confidence scoring highlights suspicious applications for manual review.',
        content_ar:
          'راجع طلبات التحقق من هوية المستخدمين الجدد. تسجيل الثقة بالذكاء الاصطناعي يُبرز الطلبات المشبوهة للمراجعة اليدوية.',
      },
      {
        selector: '#tab-escrow',
        position: 'right',
        title_en: `${ph('lock-key')}Escrow Oversight`,
        title_ar: `${ph('lock-key')}رقابة الضمان`,
        content_en:
          'Oversee all escrow-locked funds. Approve milestone releases when GPS delivery proof is verified. Resolve disputes with full audit trail.',
        content_ar:
          'أشرف على جميع أموال الضمان المجمّدة. وافق على إفراج المراحل عندما يتم التحقق من إثبات تسليم GPS. حل النزاعات مع سجل تدقيق كامل.',
      },
    ],
  },
};
