'use strict';
require('dotenv').config();

/**
 * حارس العمليات الهادمة: البذر وإعادة التهيئة.
 *
 * `npm run seed` يحذف كل صفوف الجداول، و`npm run reset` يُسقط الجداول نفسها
 * ثم يعيد بناءها ويبذرها. وكلاهما يتصل بالقاعدة التي يسمّيها DATABASE_URL —
 * وهي في هذا المشروع قاعدة الإنتاج على Neon. فأمرٌ واحد بالخطأ يمحو
 * الشركات والطلبات وسجل التدقيق بلا رجعة.
 *
 * فالمنع هو الافتراض: لا يُشغَّل أيٌّ منهما إلا على قاعدة على هذا الجهاز.
 * ولا باب خلفيّ ولا متغيّر يتجاوز الحارس — الباب الخلفي يُستعمل في اللحظة
 * التي يُفترض أن يمنع فيها.
 */

// ::1 هو 127.0.0.1 نفسه في IPv6 — استثناؤه يُسقط التشغيل المحلي بلا سبب.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * قاعدة تطوير مستضافة تُعرف باسمها لا بمضيفها: ينتهي بـ _dev أو _test.
 *
 * ولمَ الاسم لا رايةٌ مثل ALLOW_DESTRUCTIVE؟ لأن الراية تُرفع مرة ثم تُنسى
 * مرفوعة، فتُرفع في اللحظة التي يُفترض أن تمنع فيها. أما الاسم فخاصيةٌ في
 * الهدف نفسه: لا يمكن أن تشير بالخطأ إلى الإنتاج ويمرّ — إلا أن تسمّي قاعدة
 * الإنتاج muthbit_dev، وذلك خطأ يُرى بالعين.
 */
const DEV_DATABASE = /_(dev|test)$/;

/** المضيف واسم القاعدة من DATABASE_URL. يعيد null إن لم يكن المتغيّر مضبوطاً. */
function databaseTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      // عناوين IPv6 تأتي بين قوسين معقوفين في URL — تُنزع لتطابق LOCAL_HOSTS.
      host: parsed.hostname.replace(/^\[|\]$/g, ''),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '(بلا اسم)'
    };
  } catch {
    return { host: '(تعذّرت قراءة المضيف من DATABASE_URL)', database: '(غير معروف)' };
  }
}

/** للتوافق مع ما كان: المضيف وحده. */
function databaseHost() {
  const target = databaseTarget();
  return target === null ? null : target.host;
}

/**
 * يرمي خطأً عربياً يسمّي المضيف إن لم تكن القاعدة محلية.
 * @param {string} operation اسم العملية كما يراها المستخدم — يظهر في الرسالة.
 */
function assertLocalDatabase(operation = 'هذه العملية') {
  const target = databaseTarget();

  // DATABASE_URL غير مضبوط: knexfile يعود إلى 127.0.0.1 افتراضاً، فالقاعدة محلية.
  if (target === null) return { host: '127.0.0.1 (الافتراضي)', database: 'muthbit_dev', reason: 'local' };

  const { host, database } = target;
  if (LOCAL_HOSTS.has(host)) return { host, database, reason: 'local' };
  if (DEV_DATABASE.test(database)) return { host, database, reason: 'dev-name' };

  throw new Error(
    [
      '',
      '╔══════════════════════════════════════════════════════════════╗',
      '║  رُفض التشغيل — القاعدة ليست قاعدة تطوير                      ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
      `  ${operation} تحذف بيانات، و DATABASE_URL يشير إلى:`,
      '',
      `      المضيف  : ${host}`,
      `      القاعدة : ${database}`,
      '',
      '  ولا هو مضيف محلي، ولا اسم القاعدة اسمُ قاعدة تطوير.',
      '',
      '  المقبول أحدهما:',
      '    · مضيف محلي — localhost · 127.0.0.1 · ::1',
      '    · أو اسم قاعدة ينتهي بـ _dev أو _test (قاعدة تطوير مستضافة)',
      '',
      '  لا تشغّل هذا على الإنتاج إطلاقاً: يحذف الشركات والطلبات',
      '  وسجل التدقيق بلا رجعة.',
      ''
    ].join('\n')
  );
}

module.exports = { assertLocalDatabase, databaseTarget, databaseHost, LOCAL_HOSTS, DEV_DATABASE };
