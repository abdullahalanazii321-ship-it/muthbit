'use strict';
const env = require('../config/env');

/**
 * تتبّع الأخطاء غير المتوقعة وحدها.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  قاعدة الخصوصية — اقرأها قبل أن تعدّل هذا الملف
 * ══════════════════════════════════════════════════════════════════════════
 * مثبت منصة مشتريات: أجسام الطلبات تحمل أسعاراً وأسماء موردين ومبالغ شركات،
 * ورؤوسها تحمل رموز الدخول. هذه بيانات عملاء لا تخرج إلى خدمة خارجية أبداً.
 *
 * الطريقة هنا **قائمة سماح لا قائمة منع**: في beforeSend نبني `event.request`
 * من الصفر بما نسمح به وحده (الطريقة والمسار)، فأي حقل تضيفه مكتبة Sentry
 * في نسخة قادمة لا يمر لأنه ببساطة غير مذكور في القائمة.
 *
 * ممنوع منعاً باتاً، ولا تُعده «تحسيناً للتشخيص»:
 *   • جسم الطلب (req.body) — فيه الأسعار والكميات وأسماء الموردين
 *   • أي رأس (headers) — فيه Authorization و X-API-Key والكوكيز
 *   • هوية المستخدم أو بريده أو شركته
 *   • فتات التتبّع (breadcrumbs) — قد تحمل جمل SQL بقيمها وسجلات الطرفية
 *
 * إن احتجت سياقاً أكثر للتشخيص فأضف وسماً غير حسّاس (رمز خطأ، اسم مسار)،
 * لا حقلاً من الطلب.
 * ══════════════════════════════════════════════════════════════════════════
 */

// بلا DSN لا تُحمَّل المكتبة أصلاً: لا تهيئة ولا أدوات رصد ولا أي أثر.
// هذه هي الحالة الطبيعية على جهاز المطوّر وفي CI، ويجب أن يعمل كل شيء كما هو.
let Sentry = null;
let enabled = false;

/** هل التتبّع فعّال؟ يستخدمه الفحص ليتأكد أن غياب DSN لا يعطّل شيئاً. */
function isEnabled() {
  return enabled;
}

// أي مفتاح يطابق هذا يُستبدل بقيمته، أينما وُجد في الحدث.
const SECRET_KEY = /password|token|secret|authorization|cookie|api[_-]?key|dsn/i;

/** مسح تعاودي لأي حقل سرّي تسرّب إلى سياق الحدث. العمق محدود منعاً للدوران. */
function scrubSecrets(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrubSecrets(item, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? '[محذوف]' : scrubSecrets(val, depth + 1);
  }
  return out;
}

/**
 * آخر بوابة قبل مغادرة الحدث الخادم. كل ما لا يُذكر هنا صراحةً لا يخرج.
 */
function beforeSend(event) {
  // الطلب: يُعاد بناؤه من الصفر — الطريقة والمسار فقط.
  // المسار بلا سلسلة الاستعلام (?...) لأنها قد تحمل مرشّحات ومعرّفات.
  if (event.request) {
    const { method, url } = event.request;
    const allowed = {};
    if (method) allowed.method = method;
    if (typeof url === 'string') allowed.url = url.split('?')[0];
    event.request = allowed;
  }

  // لا هوية مستخدم، ولا فتات تتبّع (قد تحمل SQL بقيمه أو سجلات طرفية).
  delete event.user;
  delete event.breadcrumbs;

  if (event.extra) event.extra = scrubSecrets(event.extra);
  if (event.contexts) event.contexts = scrubSecrets(event.contexts);

  return event;
}

/**
 * التهيئة — تُنادى من server.js قبل إنشاء التطبيق.
 * ترجع true إن فُعّل التتبّع فعلاً.
 */
function init() {
  if (enabled) return true;
  if (!env.sentryDsn) return false;

  // eslint-disable-next-line global-require
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.env,
    // لا قياس أداء ولا تسجيل جلسات ولا أي رصد للمستخدمين — الأخطاء وحدها.
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    // لا عناوين IP ولا هويات مستخدمين ولا أي بيانات شخصية افتراضية.
    sendDefaultPii: false,
    initialScope: { tags: { service: 'muthbit-api', node_env: env.env } },
    beforeSend,
    // فتات التتبّع تُحذف في beforeSend أيضاً، وهذا منع ثانٍ عند المصدر.
    beforeBreadcrumb: () => null
  });

  enabled = true;
  return true;
}

/**
 * إرسال خطأ غير متوقع. لا تُنادى إلا من الفرع الأخير في errorHandler —
 * الأخطاء المتوقعة (AppError وانتهاكات القيود) لا تُرسل إطلاقاً لئلا تغرق
 * التتبّع بضجيج يخفي الأعطال الحقيقية.
 */
function captureUnexpected(err, req) {
  if (!enabled || !Sentry) return;
  try {
    Sentry.withScope((scope) => {
      if (req) {
        scope.setTag('http_method', req.method);
        // المسار المسجَّل (/api/requests/:id) لا المسار الفعلي، فلا تتسرّب معرّفات.
        const pattern = req.route && req.route.path ? req.route.path : null;
        if (pattern) scope.setTag('route', String(pattern).slice(0, 200));
      }
      Sentry.captureException(err);
    });
  } catch (e) {
    // فشل التتبّع لا يفشّل ردّ المستخدم أبداً.
  }
}

module.exports = { init, isEnabled, captureUnexpected, beforeSend, scrubSecrets };
