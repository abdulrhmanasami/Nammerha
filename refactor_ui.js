const fs = require('fs');
const path = require('path');

const filesToCleanLTR = [
  'frontend/auth.html',
  'frontend/reset-password.html',
  'frontend/verify-email.html',
  'frontend/src/pages/profile.ts',
  'frontend/src/pages/contractor-portal.ts',
  'frontend/src/pages/homeowner-portal.ts',
  'frontend/src/pages/auth.ts',
  'frontend/src/components/EscrowVault.ts',
  'frontend/src/components/live-oracle-ticker.ts'
];

for (const f of filesToCleanLTR) {
  const p = path.resolve(__dirname, f);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf-8');
    content = content.replace(/ dir="ltr"/g, '');
    content = content.replace(/\[dir="ltr"\]/g, '[dir="rtl"]');
    fs.writeFileSync(p, content);
    console.log(`Removed dir="ltr" from ${f}`);
  }
}

const titlesToTranslate = {
  'admin-escrow.html': 'نعمّرها — التحقق من الضمان',
  'admin-fintech.html': 'نعمّرها — لوحة التقنية المالية',
  'admin-kyc.html': 'نعمّرها — التحقق من الهوية',
  'admin-revenue.html': 'نعمّرها — لوحة الإيرادات',
  'engineer-boq.html': 'نعمّرها — بناء جدول الكميات',
  'engineer-camera.html': 'نعمّرها — التحقق الميداني',
  'homeowner-report.html': 'نعمّرها — الإبلاغ عن أضرار',
  'index.html': 'نعمّرها — منصة إعادة إعمار سوريا',
  'pricing.html': 'نعمّرها — الأسعار',
  'refund-policy.html': 'نعمّرها — سياسة الاسترداد',
  'contact.html': 'نعمّرها — تواصل معنا',
  'auth.html': 'نعمّرها — تسجيل الدخول',
  'verify-email.html': 'نعمّرها — تأكيد البريد'
};

for (const [f, title] of Object.entries(titlesToTranslate)) {
  const p = path.resolve(__dirname, 'frontend', f);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf-8');
    content = content.replace(/<title>.*<\/title>/, `<title>${title}</title>`);
    fs.writeFileSync(p, content);
    console.log(`Translated title in ${f}`);
  }
}

// terms.html text replacement
const termsPath = path.resolve(__dirname, 'frontend/terms.html');
if (fs.existsSync(termsPath)) {
  let content = fs.readFileSync(termsPath, 'utf-8');
  content = content.replace(
    /Your use of the Platform is also governed by our/g,
    'يخضع استخدامك للمنصة أيضاً لـ'
  );
  content = content.replace(
    /\. We collect KYC data, GPS coordinates, and transactional data to ensure accountability\s+and prevent fraud\./g,
    '. نقوم بجمع بيانات التحقق من الهوية (KYC) وإحداثيات الموقع (GPS) والبيانات المالية لضمان المساءلة ومنع الاحتيال.'
  );
  fs.writeFileSync(termsPath, content);
  console.log(`Translated terms.html`);
}

// skeleton-guard.ts text replacement
const skeletonPath = path.resolve(__dirname, 'frontend/src/utils/skeleton-guard.ts');
if (fs.existsSync(skeletonPath)) {
  let content = fs.readFileSync(skeletonPath, 'utf-8');
  content = content.replace(/'still loading'/g, "'جاري التحميل...'");
  content = content.replace(/'Still loading…'/g, "'جاري التحميل...'");
  content = content.replace(/'Taking longer than usual…'/g, "'يستغرق وقتاً أطول من المعتاد...'");
  fs.writeFileSync(skeletonPath, content);
  console.log(`Translated skeleton-guard.ts`);
}

// toast.ts text replacement
const toastPath = path.resolve(__dirname, 'frontend/src/utils/toast.ts');
if (fs.existsSync(toastPath)) {
  let content = fs.readFileSync(toastPath, 'utf-8');
  content = content.replace(/Use haptics to complement visual feedback./g, 'استخدم الاهتزاز لدعم الملاحظات المرئية.');
  fs.writeFileSync(toastPath, content);
  console.log(`Translated toast.ts`);
}

// crypto-bridge.ts text replacement
const cryptoPath = path.resolve(__dirname, 'frontend/src/workers/crypto-bridge.ts');
if (fs.existsSync(cryptoPath)) {
  let content = fs.readFileSync(cryptoPath, 'utf-8');
  content = content.replace(/'Worker error'/g, "'خطأ في المعالج'");
  content = content.replace(/Worker crashed/g, "تعطل المعالج");
  content = content.replace(/Worker SHA-256 timeout \(30s\)/g, "انتهت مهلة تشفير SHA-256");
  content = content.replace(/Worker dataurl-to-hash timeout \(30s\)/g, "انتهت مهلة التشفير للبيانات");
  fs.writeFileSync(cryptoPath, content);
  console.log(`Translated crypto-bridge.ts`);
}

// workspace-map.ts text replacement
const workspacePath = path.resolve(__dirname, 'frontend/src/utils/workspace-map.ts');
if (fs.existsSync(workspacePath)) {
  let content = fs.readFileSync(workspacePath, 'utf-8');
  content = content.replace(/Continue to \[X\]/g, "المتابعة إلى [X]");
  fs.writeFileSync(workspacePath, content);
  console.log(`Translated workspace-map.ts`);
}
