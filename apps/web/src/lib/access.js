// من يصل إلى أين في الواجهة. توجيه فقط — الخادم يحمي كل مسار بنفسه، فلا رسائل صلاحيات هنا.

export const COMPANY_HOME = '/';
export const SUPPLIER_HOME = '/supplier';

// الأدوار التي يسمح لها GET /api/audit — apps/api/src/routes/audit.routes.js.
const AUDIT_ROLES = ['company_owner', 'finance_manager', 'procurement_manager', 'platform_admin'];

/** المورد مكانه بوابته، وغيره مكانه لوحة الشركة. */
export function homeFor(user) {
  return user?.role === 'supplier_admin' ? SUPPLIER_HOME : COMPANY_HOME;
}

/** يظهر رابط سجل التدقيق ويُفتح مساره لهذه الأدوار الأربعة وحدها. */
export function canViewAudit(user) {
  return AUDIT_ROLES.includes(user?.role);
}
