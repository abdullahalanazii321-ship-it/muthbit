'use strict';
const env = require('./config/env');
const sentry = require('./utils/sentry');
const createApp = require('./app');
const db = require('./db/knex');

// قبل إنشاء التطبيق. بلا SENTRY_DSN لا شيء يقع هنا إطلاقاً — لا تحذير ولا خطأ.
const trackingOn = sentry.init();

const app = createApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[مثبت] الواجهة البرمجية تعمل على المنفذ ${env.port} — البيئة: ${env.env}`);
  // يُطبع عند التفعيل فقط: غياب التتبّع حالة طبيعية لا تستحق سطراً ولا تحذيراً.
  // eslint-disable-next-line no-console
  if (trackingOn) console.log('[مثبت] تتبّع الأخطاء غير المتوقعة مفعّل.');
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[مثبت] إيقاف الخادم (${signal})…`);
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
