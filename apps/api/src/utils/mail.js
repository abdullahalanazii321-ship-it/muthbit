'use strict';
const env = require('../config/env');

/**
 * طبقة البريد: وحدة إرسال واحدة، والسائق يُختار بـ MAIL_DRIVER. لا مزوّد مربوط بالشيفرة.
 *
 *   console — الافتراضي في التطوير: يطبع الرسالة والرابط في الطرفية ولا يرسل شيئاً.
 *   resend  — للإنتاج: RESEND_API_KEY و MAIL_FROM، عبر واجهة Resend مباشرة بـ fetch المدمج
 *             في Node 20 — بلا حزمة.
 *
 * وسائقان لا يُختاران بالمتغيّر:
 *   test     — بيئة الاختبار دائماً، أياً كان MAIL_DRIVER: لا إرسال إطلاقاً، والرسائل في
 *              صندوق في الذاكرة تقرؤه الفحوص لتأخذ الرابط.
 *   disabled — الإنتاج بلا سائق صالح: لا يُرسل ولا يُطبع الرابط، بل تحذير بلا محتوى.
 *              console محجوب في الإنتاج عمداً: يكتب رموز إعادة التعيين الخام في سجلات Render،
 *              فيقرؤها كل من يرى السجلات ويغيّر بها كلمة مرور أي مستخدم.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10000;

function resolveDriver() {
  if (env.env === 'test') return 'test';
  const requested = env.mail.driver;
  if (env.isProduction) return requested === 'resend' ? 'resend' : 'disabled';
  return requested === 'resend' ? 'resend' : 'console';
}

const testOutbox = [];

async function sendWithResend(message) {
  if (!env.mail.resendApiKey || !env.mail.from) {
    throw new Error('MAIL_DRIVER=resend يحتاج RESEND_API_KEY و MAIL_FROM.');
  }
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.mail.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.mail.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
  });
  if (!response.ok) {
    // جسم الرد قد يحمل تفاصيل الحساب: الحالة وحدها تكفي للتشخيص.
    throw new Error(`Resend رفض الإرسال: ${response.status}`);
  }
}

/** message: { to, subject, text, html }. يرمي إن فشل الإرسال الحقيقي؛ والمنادي يقرّر ماذا يفعل. */
async function send(message) {
  const driver = resolveDriver();
  if (driver === 'test') {
    testOutbox.push({ ...message });
    return;
  }
  if (driver === 'console') {
    // eslint-disable-next-line no-console
    console.log(['', '── بريد (MAIL_DRIVER=console — لم يُرسل) ──', `إلى: ${message.to}`, `الموضوع: ${message.subject}`, '', message.text, '──', ''].join('\n'));
    return;
  }
  if (driver === 'disabled') {
    // eslint-disable-next-line no-console
    console.warn('[mail] البريد غير مضبوط في الإنتاج (MAIL_DRIVER=resend) — لم تُرسل رسالة.');
    return;
  }
  await sendWithResend(message);
}

module.exports = {
  send,
  resolveDriver,
  /** للفحوص وحدها. */
  testOutbox: () => testOutbox,
  clearTestOutbox: () => {
    testOutbox.length = 0;
  }
};
