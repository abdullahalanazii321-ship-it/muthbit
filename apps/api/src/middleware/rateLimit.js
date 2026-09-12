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

function createLimiter({ windowMs, limit, messageAr, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: skipInTestEnv,
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

/** تسجيل مورد: ٥ في الساعة — يمنع إغراق قاعدة البيانات بموردين وهميين. */
const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  messageAr: GENERIC_MESSAGE
});

/** سقف عام لكل ما تحت /api: ١٢٠ طلباً في الدقيقة. لا يشمل /health. */
const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  messageAr: GENERIC_MESSAGE
});

module.exports = { loginLimiter, registerLimiter, apiLimiter, setLimitsEnabledForTests };
