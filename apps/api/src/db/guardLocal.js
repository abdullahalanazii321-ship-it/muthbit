'use strict';
/**
 * حارس يُستدعى من سطر الأوامر قبل `npm run reset`.
 * ينجح صامتاً على قاعدة محلية، ويخرج بـ 1 على غيرها فتتوقف السلسلة كلها
 * قبل أن يصل `migrate:rollback --all` إلى الجداول.
 */
const { assertLocalDatabase } = require('./assertLocalDatabase');

const operation = process.argv[2] || 'إعادة تهيئة القاعدة';

try {
  const { host, database, reason } = assertLocalDatabase(operation);
  // السبب يُقال كما هو: حارس يخطئ في تعليل سماحه لا يُوثق به حين يمنع.
  const why = reason === 'local' ? `مضيف محلي (${host})` : `اسم قاعدة تطوير («${database}» على ${host})`;
  // eslint-disable-next-line no-console
  console.log(`الحارس: ${why} — يُسمح بـ«${operation}».`);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err.message);
  process.exit(1);
}
