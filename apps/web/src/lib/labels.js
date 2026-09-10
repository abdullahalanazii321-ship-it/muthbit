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

/** التاريخ بصيغة 2026-09-10 بتوقيت المتصفح. */
export function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
