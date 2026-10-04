'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db/knex');
const env = require('../config/env');
const audit = require('../utils/audit');
const mail = require('../utils/mail');
const sentry = require('../utils/sentry');
const { badRequest } = require('../utils/errors');

/**
 * إعادة تعيين كلمة المرور: إصدار الرمز وإرساله، ثم استهلاكه.
 *
 * الرد على «نسيت كلمة المرور» يخرج قبل أي بحث في القاعدة (auth.routes.js)، وما هنا يجري بعده.
 * فلا يختلف الرد ولا زمنه بين بريد مسجّل وغير مسجّل، موقوف أو فعّال:
 * البحث والإدراج والإرسال كلها بعد أن غادر الرد.
 */

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** الرد الوحيد على «نسيت كلمة المرور» — بالحرف، في كل الحالات. */
const FORGOT_MESSAGE = 'إن كان هذا البريد مسجّلاً، أرسلنا إليه رابط إعادة التعيين.';

/** رسالة واحدة للرمز غير الموجود والمنتهي والمستعمل: لا يُعرف منها أيّها. */
const INVALID_TOKEN_MESSAGE = 'رابط إعادة التعيين غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.';

const RESET_SUCCESS_MESSAGE = 'تم تغيير كلمة المرور. سجّل الدخول بكلمتك الجديدة.';

const hashToken = (token) => crypto.createHash('sha256').update(token, 'utf8').digest('hex');

// الرابط يحمل الرمز بعد # لا بعد ?: ما بعد # لا يُرسَل إلى أي خادم، فلا يظهر في سجلات
// استضافة الواجهة ولا في رأس Referer لأي مورد تحمّله الصفحة.
const resetLink = (token) => `${env.appUrl}/reset-password#token=${token}`;

function resetEmail(to, token) {
  const link = resetLink(token);
  const text = [
    'طلبتَ إعادة تعيين كلمة المرور في مثبت.',
    '',
    'افتح هذا الرابط لاختيار كلمة مرور جديدة. صلاحيته ساعة واحدة، ويصلح مرة واحدة:',
    link,
    '',
    'إن لم تطلب ذلك فتجاهل هذه الرسالة — كلمة مرورك الحالية لم تتغيّر.'
  ].join('\n');
  const html = `<div dir="rtl" lang="ar">
<p>طلبتَ إعادة تعيين كلمة المرور في مثبت.</p>
<p>افتح هذا الرابط لاختيار كلمة مرور جديدة. صلاحيته ساعة واحدة، ويصلح مرة واحدة:</p>
<p><a href="${link}">إعادة تعيين كلمة المرور</a></p>
<p>إن لم تطلب ذلك فتجاهل هذه الرسالة — كلمة مرورك الحالية لم تتغيّر.</p>
</div>`;
  return { to, subject: 'إعادة تعيين كلمة المرور — مثبت', text, html };
}

// المهام الجارية بعد الرد. الفحوص تنتظرها بـ whenIdle قبل أن تقرأ القاعدة أو صندوق البريد.
const pending = new Set();

async function issue(email) {
  const user = await db('users').where({ email }).first();
  // لا رمز لحساب غير فعّال، ولا لحساب بلا كلمة مرور أصلاً (الوكيل الذكي يدخل بمفتاح).
  if (!user || user.status !== 'active' || !user.password_hash) return;

  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  await db('password_reset_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + TOKEN_TTL_MS)
  });
  await mail.send(resetEmail(user.email, token));
}

/** يُنادى بعد إرسال الرد. لا يرمي: الفشل هنا لا يصل المستخدم، ويُسجَّل للتشخيص. */
function issueInBackground(email) {
  const job = issue(email)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[password-reset] تعذّر إصدار رابط إعادة التعيين:', err.message);
      sentry.captureUnexpected(err);
    })
    .finally(() => pending.delete(job));
  pending.add(job);
}

/** للفحوص وحدها: ينتظر كل مهمة إصدار جارية. */
async function whenIdle() {
  while (pending.size > 0) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.all([...pending]);
  }
}

/**
 * يستهلك الرمز ويضبط كلمة المرور. كلمة المرور فحصتها passwordSchema في المسار قبل الوصول هنا.
 * في معاملة واحدة وبقفل على صف الرمز (forUpdate): طلبان متزامنان بالرمز نفسه لا ينجحان معاً.
 */
async function resetPassword({ token, password, ip }) {
  const invalid = badRequest(INVALID_TOKEN_MESSAGE);
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  await db.transaction(async (trx) => {
    // المنتهي والمستعمل يُستبعدان في الاستعلام نفسه وبساعة القاعدة، فلا فرق بينهما وبين الغائب.
    const row = await trx('password_reset_tokens')
      .where({ token_hash: hashToken(token) })
      .whereNull('used_at')
      .andWhere('expires_at', '>', trx.fn.now())
      .forUpdate()
      .first();
    if (!row) throw invalid;

    // حساب أُوقف بعد صدور الرابط: الرابط لم يعد يصلح.
    const user = await trx('users').where({ id: row.user_id }).first();
    if (!user || user.status !== 'active') throw invalid;

    // session_version + 1 يُبطل كل رمز دخول صادر قبل هذه اللحظة (middleware/auth.js).
    // وأي مسار يغيّر كلمة المرور لاحقاً يجب أن يزيده بالطريقة نفسها.
    await trx('users')
      .where({ id: user.id })
      .update({
        password_hash: passwordHash,
        session_version: trx.raw('session_version + 1'),
        updated_at: trx.fn.now()
      });
    await trx('password_reset_tokens').where({ id: row.id }).update({ used_at: trx.fn.now() });
    await trx('password_reset_tokens').where({ user_id: user.id }).whereNot({ id: row.id }).del();

    await audit.record(trx, {
      actor: { id: user.id, role: user.role, companyId: user.company_id, supplierId: user.supplier_id },
      entityType: 'user',
      entityId: user.id,
      action: 'user.password_reset',
      ip
    });
  });
}

module.exports = {
  FORGOT_MESSAGE,
  INVALID_TOKEN_MESSAGE,
  RESET_SUCCESS_MESSAGE,
  TOKEN_TTL_MS,
  hashToken,
  issueInBackground,
  whenIdle,
  resetPassword
};
