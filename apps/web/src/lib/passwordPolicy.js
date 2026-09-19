// مرآة السياسة في الخادم: apps/api/src/utils/password.js — الشروط وترتيبها ونصوصها حرفياً.
// الخادم هو الذي يرفض؛ هذا الملف راحة للمستخدم يرى بها الشروط وهو يكتب، لا حماية.
// إن تغيّرت السياسة هناك، تتغيّر هنا — وفحوص الخادم هي التي تحرس القاعدة.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * رمز خاص = علامة ASCII مطبوعة ليست حرفاً ولا رقماً (بين 33 و126 عدا a-zA-Z0-9)، والمسافة خارجها.
 * محدَّدة بالمدى لا بـ«كل ما ليس حرفاً ولا رقماً»: تلك تعدّ الحرف العربي رمزاً خاصاً.
 */
function hasSymbol(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code > 32 && code < 127 && !/[A-Za-z0-9]/.test(character)) return true;
  }
  return false;
}

export const PASSWORD_RULES = [
  {
    code: 'length',
    label: `من ${PASSWORD_MIN} إلى ${PASSWORD_MAX} محرفاً`,
    test: (value) => value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX
  },
  { code: 'lowercase', label: 'حرف لاتيني صغير (a-z)', test: (value) => /[a-z]/.test(value) },
  { code: 'uppercase', label: 'حرف لاتيني كبير (A-Z)', test: (value) => /[A-Z]/.test(value) },
  { code: 'digit', label: 'رقم (0-9)', test: (value) => /[0-9]/.test(value) },
  { code: 'symbol', label: 'رمز خاص (! @ # $ …)', test: hasSymbol }
];

/** الشروط غير المحقّقة بترتيب PASSWORD_RULES. */
export function passwordGaps(value) {
  if (typeof value !== 'string') return PASSWORD_RULES;
  return PASSWORD_RULES.filter((rule) => !rule.test(value));
}

export function isPasswordValid(value) {
  return passwordGaps(value).length === 0;
}

/** رسالة ما ينقص — نصّ الخادم نفسه، فلا يرى المستخدم صيغتين للقاعدة الواحدة. */
export function passwordMessage(value) {
  const gaps = passwordGaps(value);
  if (gaps.length === 0) return null;
  return `كلمة المرور يجب أن تحقّق: ${gaps.map((rule) => rule.label).join(' · ')}.`;
}
