// النصوص العربية للقيم التي يعيدها الخادم بالإنجليزية.

export const roleLabels = {
  platform_admin: 'مسؤول المنصة',
  company_owner: 'مالك الشركة',
  finance_manager: 'مدير مالي',
  procurement_manager: 'مدير مشتريات',
  procurement_buyer: 'موظف مشتريات',
  ai_agent: 'وكيل ذكي',
  supplier_admin: 'مسؤول مورد'
};

/** الدور بالعربية. دور غير معروف يُعرض كما هو بدل أن تتعطل الشاشة. */
export function roleLabel(role) {
  return Object.hasOwn(roleLabels, role) ? roleLabels[role] : String(role ?? '');
}
