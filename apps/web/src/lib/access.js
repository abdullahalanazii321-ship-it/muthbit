// من يصل إلى أين في الواجهة. توجيه فقط — الخادم يحمي كل مسار بنفسه، فلا رسائل صلاحيات هنا.

export const COMPANY_HOME = '/';
export const SUPPLIER_HOME = '/supplier';

// الأدوار التي يسمح لها GET /api/audit — apps/api/src/routes/audit.routes.js.
const AUDIT_ROLES = ['company_owner', 'finance_manager', 'procurement_manager', 'platform_admin'];

// فريق الشركة — apps/api/src/routes/companies.routes.js:
// القراءة (المستخدمون والسقوف) لثلاثة أدوار، والكتابة (إنشاء · ضبط سقف · إيقاف) لاثنين منها.
// مسؤول المنصة يقرأ المستخدمين في الخادم، لكن هذه شاشة شركة ولا شركة له.
const TEAM_VIEW_ROLES = ['company_owner', 'finance_manager', 'procurement_manager'];
const TEAM_MANAGE_ROLES = ['company_owner', 'finance_manager'];

/** الأدوار الأربعة التي يُنشأ بها مستخدم من داخل الشركة (MANAGEABLE_ROLES في الخادم). */
export const CREATABLE_ROLES = ['finance_manager', 'procurement_manager', 'procurement_buyer', 'ai_agent'];

/** من يملك قرار الاعتماد (مسار decision في requests.routes.js) — ومنهم وحدهم يُختار المعتمِد. */
export const APPROVER_ROLES = ['company_owner', 'finance_manager', 'procurement_manager'];

/** المورد مكانه بوابته، وغيره مكانه لوحة الشركة. */
export function homeFor(user) {
  return user?.role === 'supplier_admin' ? SUPPLIER_HOME : COMPANY_HOME;
}

/** يظهر رابط سجل التدقيق ويُفتح مساره لهذه الأدوار الأربعة وحدها. */
export function canViewAudit(user) {
  return AUDIT_ROLES.includes(user?.role);
}

/** يظهر رابط «الفريق» ويُفتح مساره. */
export function canViewTeam(user) {
  return TEAM_VIEW_ROLES.includes(user?.role);
}

/** أزرار الكتابة في شاشة الفريق — مدير المشتريات يقرأ فقط. */
export function canManageTeam(user) {
  return TEAM_MANAGE_ROLES.includes(user?.role);
}
