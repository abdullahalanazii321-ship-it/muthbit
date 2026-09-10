// أسباب السياسة كما يرسلها الخادم: policy.reasons في الرد، و error.details.reasons مع policy_blocked.
// الرسائل عربية أصلاً وتُعرض كما وردت. الواجهة لا تعيد حساب السياسة — تعرض قرار الخادم.

// رمز «مطابق للسياسة وضمن السقف» في apps/api/src/services/policy.js — ليس تنبيهاً فلا يُسرد.
const WITHIN_POLICY = 'within_policy';

/** رسائل الأسباب كما وردت، دون «مطابق للسياسة». شكل غير متوقع = لا أسباب. */
export function reasonMessages(reasons) {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((reason) => reason?.code !== WITHIN_POLICY)
    .map((reason) => reason?.message)
    .filter(Boolean);
}

/**
 * أسباب الحجب التي تُسرد تحت رسالة الخطأ — مع policy_blocked وحده.
 * details في الأخطاء الأخرى (400 مثلاً) مخرجات تحقق بالإنجليزية فلا تُعرض.
 */
export function blockedReasons(error) {
  return error?.code === 'policy_blocked' ? reasonMessages(error.details?.reasons) : [];
}
