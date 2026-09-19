'use strict';
const { z } = require('zod');

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

/**
 * رمز خاص = علامة ASCII مطبوعة ليست حرفاً ولا رقماً — أي ما بين 33 و126 عدا a-zA-Z0-9،
 * وهي ! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~
 * والمسافة خارجها عمداً.
 *
 * ومحدَّدة بالمدى لا بقائمة «كل ما ليس حرفاً ولا رقماً»: تلك تعدّ الحرف العربي رمزاً خاصاً،
 * فتمرّ كلمة عربية بحتة وكأنها حقّقت الشرط.
 */
function hasSymbol(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code > 32 && code < 127 && !/[A-Za-z0-9]/.test(character)) return true;
  }
  return false;
}

/**
 * سياسة كلمة المرور في موضع واحد: هنا.
 *
 * كانت مكرّرة في auth.routes.js و companies.routes.js و suppliers.routes.js،
 * وشرطها الوحيد ثمانية محارف — فكان الرقم المكرّر ثماني مرات يمرّ.
 * وتكرارها كان يعني أن تشديدها في موضع يترك ثغرة في الباقي.
 *
 * الترتيب هنا هو ترتيب الشروط في الرسالة، وهو نفسه ترتيب القائمة الحيّة في الواجهة
 * (apps/web/src/lib/passwordPolicy.js) — فيقرأ المستخدم الصيغة نفسها في الشاشة وفي رد الخادم.
 */
const RULES = [
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

/** الشروط غير المحقّقة بترتيب RULES. الكلمة المطابقة تعيد مصفوفة فارغة. */
function passwordGaps(value) {
  if (typeof value !== 'string') return RULES;
  return RULES.filter((rule) => !rule.test(value));
}

/** رسالة تسمّي ما ينقص تحديداً، لا «كلمة مرور غير صالحة». null إن كانت مطابقة. */
function passwordMessage(value) {
  const gaps = passwordGaps(value);
  if (gaps.length === 0) return null;
  return `كلمة المرور يجب أن تحقّق: ${gaps.map((rule) => rule.label).join(' · ')}.`;
}

/**
 * يُستعمل عند **إنشاء** كلمة المرور فقط: تسجيل الشركة، وتسجيل المورد، وإنشاء مستخدم داخل الشركة.
 *
 * ولا يُستعمل في مخطط تسجيل الدخول أبداً. الحسابات القائمة أُنشئت قبل هذه السياسة،
 * وفرضُها عند الدخول يقفلها كلها. مخطط الدخول يبقى z.string().min(1) حرفياً،
 * ويحرسه فحص في tests/smoke.js يثبت أن كلمة لا تحقّق السياسة ما زالت تدخل.
 */
const passwordSchema = z.string().superRefine((value, ctx) => {
  const message = passwordMessage(value);
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

/**
 * رسالة كلمة المرور من خطأ zod، إن كان الرفض بسببها — وإلا null.
 *
 * تُرفع إلى error.message لأنها هي التي يراها المستخدم: flatten() على مخطط متداخل
 * يقف عند المستوى الأول فلا يصل اسم الحقل، و«البيانات غير صحيحة» لا تقول ما ينقص.
 * والاقتصار على custom مقصود: غياب الحقل أصلاً يولّد رسالة zod الإنجليزية، ولا تُعرض.
 */
function passwordErrorMessage(zodError) {
  const issue = zodError.issues.find(
    (item) => item.code === 'custom' && item.path[item.path.length - 1] === 'password'
  );
  return issue ? issue.message : null;
}

module.exports = {
  PASSWORD_MIN,
  PASSWORD_MAX,
  PASSWORD_RULES: RULES,
  passwordGaps,
  passwordMessage,
  passwordSchema,
  passwordErrorMessage
};
