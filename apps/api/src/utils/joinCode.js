'use strict';
const crypto = require('crypto');

/**
 * رمز انضمام الشركة: ثمانية محارف من أبجدية بلا 0 ولا O ولا 1 ولا I تفادياً للالتباس عند القراءة والإملاء.
 * الأبجدية نفسها في دالة القاعدة mb_join_code() (هجرة company_join_requests) — تلك تولّد رمز الشركة
 * عند إنشائها، وهذه عند التوليد اليدوي. غيّر الاثنتين معاً.
 *
 * الرمز لا يمنح صلاحية: يربط طلب الانضمام بشركته فقط، والاعتماد قرار المالك.
 */
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 8;

/** حالتا طلب الانضمام في users.status. المستخدم فيهما بلا دور ولا سقف، ولا يدخل، ولا يظهر في الفريق. */
const JOIN_STATUSES = ['join_pending', 'join_rejected'];

/** الرسالة الوحيدة لكل رمز لا يقبل انضماماً: غير موجود، أو لشركة غير مفعّلة. لا تكشف عن الشركة شيئاً. */
const INVALID_JOIN_CODE_MESSAGE = 'رمز الشركة غير صحيح.';

/** crypto.randomInt مولّد معمّى ومنتظم — لا Math.random. */
function generateJoinCode() {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

/** الرمز كما كتبه الموظف: بلا فراغات، وبالحالة الكبيرة. ما ليس نصاً يصير فارغاً فيُرفض كأي رمز خاطئ. */
function normalizeJoinCode(raw) {
  return typeof raw === 'string' ? raw.replace(/\s+/g, '').toUpperCase() : '';
}

module.exports = {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  JOIN_STATUSES,
  INVALID_JOIN_CODE_MESSAGE,
  generateJoinCode,
  normalizeJoinCode
};
