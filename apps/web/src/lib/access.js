// من يصل إلى أين في الواجهة. توجيه فقط — الخادم يحمي كل مسار بنفسه، فلا رسائل صلاحيات هنا.

// لوحة الشركة على /requests: الجذر / صار صفحة التعريف العامة للزائر.
export const COMPANY_HOME = '/requests';
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

// من ينشئ طلباً — BUYER_ROLES في apps/api/src/routes/requests.routes.js (ai_agent منها بلا شاشة).
// أدوار الشركة الأربعة التي تدخل كلها منها، فرابط «طلب جديد» يظهر لها كلها كما كان زرّه في شاشة الطلبات.
const REQUEST_CREATOR_ROLES = ['procurement_buyer', 'procurement_manager', 'company_owner', 'finance_manager'];

/** الأدوار الأربعة التي يُنشأ بها مستخدم من داخل الشركة (MANAGEABLE_ROLES في الخادم). */
export const CREATABLE_ROLES = ['finance_manager', 'procurement_manager', 'procurement_buyer', 'ai_agent'];

/** من يملك قرار الاعتماد (مسار decision في requests.routes.js) — ومنهم وحدهم يُختار المعتمِد. */
export const APPROVER_ROLES = ['company_owner', 'finance_manager', 'procurement_manager'];

/**
 * مكان كل دور: المورد بوابته، ومسؤول المنصة لوحته، وغيرهما لوحة الشركة.
 * مسؤول المنصة بلا شركة، ومسارات الشركة تردّ عليه بخطأ — فمكانه /platform لا /requests.
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

/** «الطلبات» لكل من مكانه لوحة الشركة — المورد ومسؤول المنصة لهما مكانهما. */
export function canViewRequests(user) {
  return homeFor(user) === COMPANY_HOME;
}

/** رابط «طلب جديد». */
export function canCreateRequest(user) {
  return REQUEST_CREATOR_ROLES.includes(user?.role);
}

/** بوابة المورد للمورد وحده. */
export function canViewSupplierPortal(user) {
  return user?.role === 'supplier_admin';
}

/** يظهر رابط سجل التدقيق ويُفتح مساره لأدوار الشركة الثلاثة وحدها. */
export function canViewAudit(user) {
  return AUDIT_ROLES.includes(user?.role);
}

/** يظهر رابط «الفريق» ويُفتح مساره. */
export function canViewTeam(user) {
  return TEAM_VIEW_ROLES.includes(user?.role);
}

/**
 * انضمام الموظفين برمز الشركة — للمالك وحده كما في companies.routes.js: يقرأ الرمز ويبدّله ويعتمد ويرفض.
 * المدير المالي يضبط السقوف ويوقف، لكنه لا يُدخل أحداً إلى الشركة. الخادم يرفض غير المالك أصلاً؛ هذا إخفاء لا حماية.
 */
export function canManageJoin(user) {
  return user?.role === 'company_owner';
}

/** الدوران الوحيدان اللذان يُسندان عند اعتماد طلب انضمام (JOIN_ASSIGNABLE_ROLES في الخادم). */
export const JOIN_ASSIGNABLE_ROLES = ['procurement_buyer', 'procurement_manager'];

/** أزرار الكتابة في شاشة الفريق — مدير المشتريات يقرأ فقط. */
export function canManageTeam(user) {
  return TEAM_MANAGE_ROLES.includes(user?.role);
}
