'use strict';
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * تحديد معدل الطلبات — دفاع عن المسارات العامة قبل أن تصل المصادقة.
 *
 * المفتاح هو عنوان IP (السلوك الافتراضي للحزمة)، ويُقرأ بعد `app.set('trust proxy', 1)`
 * الموجود أصلاً في app.js — بدونه تبدو كل طلبات Render قادمة من عنوان واحد.
 * يشذّ عن ذلك `loginEmailLimiter` وحده: مفتاحه البريد المُستهدَف لا مصدر الطلب.
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
 * نص الحجب — واحد حرفاً بحرف في كل المحددات، ولا يقبل createLimiter نصاً غيره.
 *
 * لو اختلف النص بين محددين لصار الفرق كاشفاً: يعرف المهاجم أيّ حدّ أصابه
 * (حدّ البريد يعني أن البريد مستهدَف، حدّ المفتاح يعني أن المسار يقبل مفاتيح).
 * ولا مدة فيه: الوقت المتبقي يصل منفصلاً (رأس Retry-After و details.retry_after_seconds)
 * فتعدّه الواجهة تنازلياً — ومدة ثابتة في النص كانت ستناقض العدّاد.
 */
const BLOCK_MESSAGE = 'محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.';

/**
 * مظروف الخطأ نفسه المستخدم في كل المنصة، برمز `rate_limited` ونص الحجب الواحد.
 * `retry_after_seconds` يُحسب من وقت تصفير النافذة، فإن غاب فمن طول النافذة —
 * والرقم نفسه في رأس `Retry-After`، يكتبه هذا المعالج لا الحزمة، فلا يختلف الاثنان.
 * لا شيء غيرهما: لا محاولات متبقية ولا أي أثر لوجود الحساب.
 */
function buildHandler(windowMs) {
  return (req, res) => {
    const resetTime = req.rateLimit && req.rateLimit.resetTime;
    const remainingMs = resetTime ? resetTime.getTime() - Date.now() : windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: {
        code: 'rate_limited',
        message: BLOCK_MESSAGE,
        details: { retry_after_seconds: retryAfterSeconds }
      }
    });
  };
}

/**
 * appliesTo: يقصر المحدد على طلبات بعينها؛ ما عداها لا يُعدّ أصلاً.
 * requestWasSuccessful: يعرّف «المحاولة الناجحة» التي تُستردّ مع skipSuccessfulRequests.
 * keyGenerator: يبدّل مفتاح العدّ؛ إن غاب فالمفتاح عنوان IP كما تفعل الحزمة افتراضاً.
 */
function createLimiter({
  windowMs,
  limit,
  skipSuccessfulRequests = false,
  appliesTo = null,
  requestWasSuccessful = null,
  keyGenerator = null
}) {
  return rateLimit({
    windowMs,
    limit,
    // رؤوس RateLimit-* مطفأة عمداً: كانت تُرسل مع كل ردّ — قبل الحجب — المحاولات المتبقية
    // وحدّ كل محدد (RateLimit-Remaining: 4 بعد أول محاولة دخول فاشلة). رأس Retry-After
    // يكتبه buildHandler عند الحجب وحده.
    standardHeaders: false,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: (req, res) => skipInTestEnv() || (appliesTo ? !appliesTo(req, res) : false),
    ...(requestWasSuccessful ? { requestWasSuccessful } : {}),
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: buildHandler(windowMs)
  });
}

/**
 * الدخول — حدّ المصدر: ١٠ محاولات في ١٥ دقيقة لكل عنوان IP.
 * يوقف الهجوم الواسع من مصدر واحد على حسابات كثيرة.
 * skipSuccessfulRequests يعاقب المحاولات الفاشلة وحدها — من يدخل ويخرج مراراً لا يُحبس،
 * ومن يجرّب كلمات المرور يُوقَف.
 */
const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true
});

/**
 * مفتاح ثابت لطلبات الدخول المشوّهة — بلا بريد أو ببريد غير نصي.
 * تذهب كلها إلى دلو واحد: هي طلبات لا تصلح أصلاً ولا يضير حصرها معاً،
 * والمهم ألا يرمي مولّد المفتاح استثناءً فيسقط المسار كله.
 */
const MALFORMED_LOGIN_KEY = '__no_email__';

function loginEmailKey(req) {
  const email = req && req.body ? req.body.email : null;
  if (typeof email !== 'string') return MALFORMED_LOGIN_KEY;
  return email.trim().toLowerCase() || MALFORMED_LOGIN_KEY;
}

/**
 * الدخول — حدّ الحساب: ٥ محاولات فاشلة في ١٥ دقيقة لكل بريد إلكتروني.
 *
 * يعمل **مع** حدّ الـ IP فوقه لا بدلاً منه. ذاك يوقف الهجوم الواسع من مصدر واحد،
 * وهذا يوقف الهجوم الموزّع على حساب واحد: مهاجم بمئة عنوان يجرّب ألف كلمة مرور
 * على حساب مالك شركة بعينه لا يلمس حدّ الـ IP أبداً، لأن العدّاد هناك يتبع مصدر
 * الهجوم لا هدفه. المفتاح هنا هو الهدف.
 *
 * البريد يُشذَّب ويُحوَّل إلى حروف صغيرة قبل العدّ، وإلا أفلت المهاجم بتغيير حالة الأحرف
 * فحصل على خمس محاولات جديدة مع كل صيغة. هذا هو التطبيع نفسه الذي يفعله مسار الدخول
 * قبل البحث في `users`، فالمفتاح والحساب شيء واحد.
 *
 * IPv6: مولّد المفتاح هذا لا يقرأ `req.ip` إطلاقاً، فلا محل لمسألة تجزئة عناوين IPv6
 * التي تفرضها express-rate-limit (ومعها المساعد `ipKeyGenerator`) على المولّدات
 * المبنية على العنوان — فحص `keyGeneratorIpFallback` في النسخة ٨ لا يُثار هنا.
 *
 * المخزن في ذاكرة العملية كبقية المحددات: يكفي ما دام الخادم نسخة واحدة على Render.
 * يوم تتعدّد النسخ يصير هذا غير كافٍ — لكل نسخة عدّادها، فيصير الحد الفعلي
 * خمساً مضروبة في عدد النسخ، ويجب حينها نقل المخزن إلى Redis مشترك.
 */
const loginEmailLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: loginEmailKey
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
  skipSuccessfulRequests: true,
  appliesTo: (req) => Boolean(req.headers['x-api-key']),
  requestWasSuccessful: (req, res) => res.statusCode !== 401
});

/**
 * نسيت كلمة المرور — حدّان كالدخول: بالمصدر ثم بالبريد المُستهدَف.
 *
 * نص الحجب BLOCK_MESSAGE في الاثنين كبقية المحددات:
 * لو انفردت رسالة البريد لعرف المهاجم أنه بلغ حدّ بريد بعينه. والحدّ بالبريد يعدّ كل طلب
 * سواء وُجد الحساب أو لا — العدّ قبل المسار ولا يعرف عن الحساب شيئاً — فلا يكشف وجوده.
 *
 * كل طلب يُعدّ (لا skipSuccessfulRequests): الرد ٢٠٠ دائماً، فلا «فاشل» يُميَّز.
 * ١٠ لكل عنوان في ١٥ دقيقة توقف من يمسح قوائم بريد، و٥ لكل بريد في الساعة توقف إغراق
 * صندوق ضحية برسائل إعادة التعيين — وتبقى لصاحبه الحقيقي محاولات تكفيه.
 */
const forgotPasswordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

const forgotPasswordEmailLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: loginEmailKey
});

/**
 * إعادة التعيين بالرمز — حدّ بالمصدر: ١٠ محاولات فاشلة في ١٥ دقيقة.
 *
 * لا حدّ بالبريد هنا: الطلب لا يحمل بريداً، والهدف يُعرف من الرمز وحده. وحدٌّ بالرمز لا يحمي
 * شيئاً — من يخمّن يغيّر الرمز مع كل محاولة فلا يتكرّر مفتاح أبداً، والرمز ٣٢ بايتاً لا يُخمَّن أصلاً.
 * الحماية الفعلية هنا: كلفة bcrypt لكل محاولة، فيُحدّ المصدر لئلا يشغل المعالج.
 */
const resetPasswordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true
});

/** سقف عام لكل ما تحت /api: ١٢٠ طلباً في الدقيقة. لا يشمل /health. */
const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 120,
});

module.exports = {
  loginLimiter,
  loginEmailLimiter,
  accountCreationLimiter,
  agentKeyLimiter,
  forgotPasswordLimiter,
  forgotPasswordEmailLimiter,
  resetPasswordLimiter,
  apiLimiter,
  setLimitsEnabledForTests
};
