'use strict';
/**
 * حارس يُستدعى من سطر الأوامر قبل `npm run reset`.
 * ينجح صامتاً على قاعدة محلية، ويخرج بـ 1 على غيرها فتتوقف السلسلة كلها
 * قبل أن يصل `migrate:rollback --all` إلى الجداول.
 */
const { assertLocalDatabase } = require('./assertLocalDatabase');

const operation = process.argv[2] || 'إعادة تهيئة القاعدة';

try {
  const { host } = assertLocalDatabase(operation);
  // eslint-disable-next-line no-console
  console.log(`الحارس: القاعدة محلية (${host}) — يُسمح بـ«${operation}».`);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err.message);
  process.exit(1);
}
