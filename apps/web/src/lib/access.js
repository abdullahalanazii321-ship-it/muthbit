// من يصل إلى أين في الواجهة. توجيه فقط — الخادم يحمي كل مسار بنفسه، فلا رسائل صلاحيات هنا.

export const COMPANY_HOME = '/';
export const SUPPLIER_HOME = '/supplier';
export const PLATFORM_HOME = '/platform';

// الأدوار التي يسمح لها GET /api/audit — apps/api/src/routes/audit.routes.js.
// مسؤول المنصة يسمح له الخادم، لكنه يردّ 400 ما لم يسمِّ الشركة (?company_id=)،
// وشاشة /audit لا تسمّيها. سجلات الشركات يقرأها من لوحة المنصة مسمّاة — فلا مكان له هنا.
const AUDIT_ROLES = ['company_owner', 'finance_manager', 'procurement_manager'];

// فريق الشركة — apps/api/src/routes/companies.routes.js:
// القراءة (المستخدمون والسقوف) لثلاثة أدوار، والكتابة (إنشاء · ضبط سقف · إيقاف) لاثنين منها.
// مسؤول المنصة يقرأ المستخدمين في الخادم، لكن هذه شاشة شركة ولا شركة له.
const TEAM_VIEW_ROLES = ['company_owner', 'finance_manager', 'procurement_manager'];
const TEAM_MANAGE_ROLES = ['company_owner', 'finance_manager'];

/** الأدوار الأربعة التي يُنشأ بها مستخدم من داخل الشركة (MANAGEABLE_ROLES في الخادم). */
export const CREATABLE_ROLES = ['finance_manager', 'procurement_manager', 'procurement_buyer', 'ai_agent'];

/** من يملك قرار الاعتماد (مسار decision في requests.routes.js) — ومنهم وحدهم يُختار المعتمِد. */
export const APPROVER_ROLES = ['company_owner', 'finance_manager', 'procurement_manager'];

/**
 * مكان كل دور: المورد بوابته، ومسؤول المنصة لوحته، وغيرهما لوحة الشركة.
 * مسؤول المنصة بلا شركة، ومسارات الشركة تردّ عليه بخطأ — فمكانه /platform لا /.
 */
export function homeFor(user) {
  if (user?.role === 'supplier_admin') return SUPPLIER_HOME;
  if (user?.role === 'platform_admin') return PLATFORM_HOME;
  return COMPANY_HOME;
}

/** لوحة المنصة لمسؤول المنصة وحده — لا دور آخر يفتحها. */
export function canViewPlatform(user) {
  return user?.role === 'platform_admin';
}

/** يظهر رابط سجل التدقيق ويُفتح مساره لأدوار الشركة الثلاثة وحدها. */
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
