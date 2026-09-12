'use strict';
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * تحديد معدل الطلبات — دفاع عن المسارات العامة قبل أن تصل المصادقة.
 *
 * المفتاح هو عنوان IP (السلوك الافتراضي للحزمة)، ويُقرأ بعد `app.set('trust proxy', 1)`
 * الموجود أصلاً في app.js — بدونه تبدو كل طلبات Render قادمة من عنوان واحد.
 *
 * العدّ في ذاكرة العملية لا في قاعدة بيانات ولا Redis: يكفي خادماً واحداً،
 * ويُصفَّر عند كل إعادة تشغيل، ولا يُشارَك بين نسخ متعددة إن تعدّدت لاحقاً.
 */

// في بيئة الاختبار الحدود معطّلة: smoke.js يسجّل دخول عشرات المرات في ثوانٍ،
// والحد سيُسقط الفحوص لسبب ليس خللاً. فحص الحد نفسه يفتح هذه البوابة لنفسه ثم يغلقها.
let enabledInTests = false;

/** تُستدعى من الفحوص وحدها: تفعّل المحددات داخل بيئة الاختبار ثم تعيدها للتعطيل. */
function setLimitsEnabledForTests(enabled) {
  enabledInTests = Boolean(enabled);
}

const skipInTestEnv = () => env.env === 'test' && !enabledInTests;

/**
 * مظروف الخطأ نفسه المستخدم في كل المنصة، برمز `rate_limited` ورسالة عربية.
 * `retry_after_seconds` يُحسب من وقت تصفير النافذة، فإن غاب فمن طول النافذة.
 */
function buildHandler(windowMs, messageAr) {
  return (req, res) => {
    const resetTime = req.rateLimit && req.rateLimit.resetTime;
    const remainingMs = resetTime ? resetTime.getTime() - Date.now() : windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    return res.status(429).json({
      error: {
        code: 'rate_limited',
        message: messageAr,
        details: { retry_after_seconds: retryAfterSeconds }
      }
    });
  };
}

/**
 * appliesTo: يقصر المحدد على طلبات بعينها؛ ما عداها لا يُعدّ أصلاً.
 * requestWasSuccessful: يعرّف «المحاولة الناجحة» التي تُستردّ مع skipSuccessfulRequests.
 */
function createLimiter({
  windowMs,
  limit,
  messageAr,
  skipSuccessfulRequests = false,
  appliesTo = null,
  requestWasSuccessful = null
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: (req, res) => skipInTestEnv() || (appliesTo ? !appliesTo(req, res) : false),
    ...(requestWasSuccessful ? { requestWasSuccessful } : {}),
    handler: buildHandler(windowMs, messageAr)
  });
}

const GENERIC_MESSAGE = 'محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.';

/**
 * الدخول: ١٠ محاولات في ١٥ دقيقة.
 * skipSuccessfulRequests يعاقب المحاولات الفاشلة وحدها — من يدخل ويخرج مراراً لا يُحبس،
 * ومن يجرّب كلمات المرور يُوقَف.
 */
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  messageAr: 'محاولات دخول كثيرة. انتظر ١٥ دقيقة ثم أعد المحاولة.',
  skipSuccessfulRequests: true
});

/**
 * إنشاء حساب جديد: ٥ في الساعة.
 * نسخة واحدة تُركَّب على `POST /api/auth/register-company` و `POST /api/suppliers/register` معاً،
 * فالمخزن والمفتاح (IP) واحد والعدّاد مشترك بينهما: من استنفد الخمس على أحدهما
 * لا يجد خمساً أخرى على الآخر. الحد على الفعل — إنشاء حساب — لا على المسار.
 * يمنع إغراق قاعدة البيانات بشركات وموردين وهميين.
 */
const accountCreationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  messageAr: GENERIC_MESSAGE
});

/**
 * مفتاح الوكيل الذكي: ٢٠ محاولة فاشلة في ١٥ دقيقة.
 *
 * السبب كلفة المعالج لا تخمين المفتاح: كل مفتاح تطابق بادئته وكيلاً نشطاً يكلّف
 * `bcrypt.compare` كاملة (BCRYPT_ROUNDS=12)، وخادم Render المجاني بـ 0.1 CPU.
 * ترك ذلك عند الحد العام (١٢٠/دقيقة) يعني أن من يملك الرابط يشغل المعالج فيوقف المنصة
 * عن كل مستخدميها — حرمان من الخدمة لا مجرد تخمين.
 *
 * appliesTo: لا يُعدّ إلا ما حمل الرأس فعلاً، فلا تستهلكه جلسة منتهية برمز Bearer.
 * requestWasSuccessful: المحاولة «الفاشلة» هي 401 وحدها — أي مفتاح مرفوض.
 * ما عداها (٤٠٣ صلاحية · ٤٢٢ سياسة · نجاح) مرّ من المصادقة ولا يُحسب،
 * فالوكيل الشرعي الذي تمنعه السياسة مراراً لا يُحبس بذنب ليس ذنبه.
 */
const agentKeyLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  messageAr: 'محاولات كثيرة بمفتاح وكيل غير صالح. انتظر ١٥ دقيقة ثم أعد المحاولة.',
  skipSuccessfulRequests: true,
  appliesTo: (req) => Boolean(req.headers['x-api-key']),
  requestWasSuccessful: (req, res) => res.statusCode !== 401
});

/** سقف عام لكل ما تحت /api: ١٢٠ طلباً في الدقيقة. لا يشمل /health. */
const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  messageAr: GENERIC_MESSAGE
});

module.exports = {
  loginLimiter,
  accountCreationLimiter,
  agentKeyLimiter,
  apiLimiter,
  setLimitsEnabledForTests
};
