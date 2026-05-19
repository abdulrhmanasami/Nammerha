// ============================================================================
// Nammerha — بيانات تجريبية عربية للصفحة الرئيسية
// SEED-001: Arabic demo data for pre-launch homepage presentation.
// Shows realistic Syrian reconstruction projects to visitors before
// real projects exist in the database.
// REMOVAL: Delete this file once real projects are added to the database.
// ============================================================================

export interface DemoProject {
  project_id: string;
  title: string;
  damage_type: string;
  funded_amount: number; // cents
  total_budget: number; // cents
  funded_percentage: number;
  cover_image_url?: string;
  ocds_id: string;
  compliance_level: string;
  region: string;
}

/**
 * مشاريع تجريبية واقعية — بيانات عربية بالكامل
 * تمثل مشاريع إعادة إعمار حقيقية في مختلف المحافظات السورية
 */
export const DEMO_PROJECTS: DemoProject[] = [
  {
    project_id: 'demo-001',
    title: 'ترميم مدرسة حلب الشرقية',
    damage_type: 'structural',
    funded_amount: 4_250_000, // $42,500
    total_budget: 8_500_000, // $85,000
    funded_percentage: 50,
    ocds_id: 'OCDS-SYR-2026-001',
    compliance_level: 'platinum',
    region: 'حلب',
  },
  {
    project_id: 'demo-002',
    title: 'إعادة تأهيل شبكة المياه — حمص القديمة',
    damage_type: 'plumbing',
    funded_amount: 12_000_000, // $120,000
    total_budget: 15_000_000, // $150,000
    funded_percentage: 80,
    ocds_id: 'OCDS-SYR-2026-002',
    compliance_level: 'platinum',
    region: 'حمص',
  },
  {
    project_id: 'demo-003',
    title: 'بناء وحدات سكنية — الغوطة الشرقية',
    damage_type: 'structural',
    funded_amount: 7_500_000, // $75,000
    total_budget: 25_000_000, // $250,000
    funded_percentage: 30,
    ocds_id: 'OCDS-SYR-2026-003',
    compliance_level: 'gold',
    region: 'ريف دمشق',
  },
  {
    project_id: 'demo-004',
    title: 'ترميم سوق المدينة التاريخي — حلب',
    damage_type: 'mixed',
    funded_amount: 35_000_000, // $350,000
    total_budget: 35_000_000, // $350,000
    funded_percentage: 100,
    ocds_id: 'OCDS-SYR-2026-004',
    compliance_level: 'platinum',
    region: 'حلب',
  },
  {
    project_id: 'demo-005',
    title: 'إصلاح الشبكة الكهربائية — درعا',
    damage_type: 'electrical',
    funded_amount: 1_800_000, // $18,000
    total_budget: 6_000_000, // $60,000
    funded_percentage: 30,
    ocds_id: 'OCDS-SYR-2026-005',
    compliance_level: 'gold',
    region: 'درعا',
  },
  {
    project_id: 'demo-006',
    title: 'ترميم مستشفى الرقة الوطني',
    damage_type: 'structural',
    funded_amount: 18_000_000, // $180,000
    total_budget: 20_000_000, // $200,000
    funded_percentage: 90,
    ocds_id: 'OCDS-SYR-2026-006',
    compliance_level: 'platinum',
    region: 'الرقة',
  },
];

/**
 * إحصائيات تجريبية للصفحة الرئيسية
 * تعكس أرقام واقعية لمنصة في مراحلها الأولى
 */
export const DEMO_STATS = {
  total_funded: 78_550_000, // $785,500
  trend_percent: 23.4,
};
