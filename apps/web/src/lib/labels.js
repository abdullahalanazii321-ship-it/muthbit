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

const sarFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * المبلغ بصيغة 1,250,000 ر.س بأرقام لاتينية.
 * null يعني أنه لم يُختر عرض بعد، فيُعرض «—» لا صفراً.
 * PostgreSQL يعيد numeric نصاً ("1250000.00")، فالتحويل هنا لا في كل شاشة.
 */
export function formatSAR(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${sarFormatter.format(number)} ر.س`;
}

/** التاريخ بصيغة 2026-09-10 بتوقيت المتصفح. */
export function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
