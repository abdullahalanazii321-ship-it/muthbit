// النصوص العربية للقيم التي يعيدها الخادم بالإنجليزية، وتنسيق الأرقام والتواريخ.

export const roleLabels = {
  platform_admin: 'مسؤول المنصة',
  company_owner: 'مالك الشركة',
  finance_manager: 'مدير مالي',
  procurement_manager: 'مدير مشتريات',
  procurement_buyer: 'موظف مشتريات',
  ai_agent: 'وكيل ذكي',
  supplier_admin: 'مسؤول مورد'
};

export const statusLabels = {
  draft: 'مسودة',
  sourcing: 'بانتظار العروض',
  pending_approval: 'بانتظار الاعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  ordered: 'صدر أمر الشراء',
  delivered: 'سُلّم',
  closed: 'مقفل',
  cancelled: 'ملغى'
};

// حالة العرض لا حالة الطلب: للعرض حالته، ولطلبه حالة أخرى من الحالات التسع.
export const offerStatusLabels = {
  submitted: 'مُقدَّم',
  selected: 'مختار',
  withdrawn: 'مسحوب'
};

// رموز action التي يكتبها الخادم في audit_log. رمز خارج القاموس يُعرض كما هو — لا ترجمة بالتخمين.
export const auditActionLabels = {
  'company.registered': 'تسجيل شركة',
  'company.active': 'توثيق شركة',
  'company.suspended': 'إيقاف شركة',
  'supplier.registered': 'تسجيل مورد',
  'supplier.verified': 'توثيق مورد',
  'supplier.rejected': 'رفض توثيق مورد',
  'supplier.suspended': 'إيقاف مورد',
  'user.created': 'إنشاء مستخدم',
  'user.login': 'تسجيل دخول',
  'user.suspended': 'إيقاف مستخدم',
  'limits.set': 'ضبط سقوف مشترٍ',
  'request.created': 'إنشاء طلب',
  'request.offer_selected': 'اختيار عرض',
  'request.approved': 'اعتماد طلب',
  'request.rejected': 'رفض طلب',
  'request.policy_blocked': 'منعته السياسة',
  'offer.submitted': 'تقديم عرض',
  'offer.withdrawn': 'سحب عرض',
  'purchase_order.issued': 'إصدار أمر شراء'
};

export const entityTypeLabels = {
  company: 'شركة',
  supplier: 'مورد',
  user: 'مستخدم',
  request: 'طلب',
  offer: 'عرض',
  purchase_order: 'أمر شراء',
  buyer_limits: 'سقوف'
};

// قيمة غير معروفة تُعرض كما هي بدل أن تتعطل الشاشة.
function labelFrom(labels, value) {
  return Object.hasOwn(labels, value) ? labels[value] : String(value ?? '');
}

/** الدور بالعربية. */
export function roleLabel(role) {
  return labelFrom(roleLabels, role);
}

/** الحالة بالعربية. */
export function statusLabel(status) {
  return labelFrom(statusLabels, status);
}

/** حالة العرض بالعربية. */
export function offerStatusLabel(status) {
  return labelFrom(offerStatusLabels, status);
}

/** حدث التدقيق بالعربية، والرمز الإنجليزي كما هو إن لم يكن في القاموس. */
export function auditActionLabel(action) {
  return labelFrom(auditActionLabels, action);
}

/** نوع الكيان بالعربية. */
export function entityTypeLabel(type) {
  return labelFrom(entityTypeLabels, type);
}

// أرقام لاتينية بفواصل الآلاف وحتى منزلتين عشريتين.
const latinNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * المبلغ بصيغة 1,250,000 ر.س بأرقام لاتينية.
 * null يعني أنه لم يُختر عرض بعد، فيُعرض «—» لا صفراً.
 * PostgreSQL يعيد numeric نصاً ("1250000.00")، فالتحويل هنا لا في كل شاشة.
 */
export function formatSAR(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${latinNumber.format(number)} ر.س`;
}

/** تقييم المورد بصيغة 4.7 — يصل من الخادم نصاً ("4.70"). */
export function formatRating(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? latinNumber.format(number) : '—';
}

const pad = (n) => String(n).padStart(2, '0');

function toDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** التاريخ بصيغة 2026-09-10 بتوقيت المتصفح. */
export function formatDate(iso) {
  const date = toDate(iso);
  if (!date) return '—';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** التاريخ والوقت بصيغة 2026-09-11 22:47 بتوقيت المتصفح ونظام 24 ساعة. */
export function formatDateTime(iso) {
  const date = toDate(iso);
  if (!date) return '—';
  return `${formatDate(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// المعدود في العربية يتبع العدد: شهر واحد · شهران · 3 أشهر · 12 شهراً · 100 شهر.
// Intl.PluralRules في المتصفح يعرف هذه الفئات، فلا حاجة لحزمة.
const arabicPlural = new Intl.PluralRules('ar');

function formatCount(value, forms) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  // الصفر «—» لا «0 شهر»: ضمان صفر أو مدة صفر يعني عرضاً ناقصاً.
  if (!Number.isInteger(number) || number <= 0) return '—';
  const form = arabicPlural.select(number);
  if (form === 'one') return forms.one;
  if (form === 'two') return forms.two;
  return `${number} ${forms[form] ?? forms.other}`;
}

/** مدة الضمان بصيغة «12 شهراً». */
export function formatMonths(value) {
  return formatCount(value, { one: 'شهر واحد', two: 'شهران', few: 'أشهر', many: 'شهراً', other: 'شهر' });
}

/** مدة التسليم بصيغة «7 أيام». */
export function formatDays(value) {
  return formatCount(value, { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً', other: 'يوم' });
}

/** عدد العروض بصيغة «عرض واحد» · «عرضان» · «3 عروض» · «11 عرضاً». */
export function formatOfferCount(value) {
  return formatCount(value, { one: 'عرض واحد', two: 'عرضان', few: 'عروض', many: 'عرضاً', other: 'عرض' });
}
