'use strict';
require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`متغير البيئة ${name} مطلوب ولم يُضبط. راجع .env.example`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

// في الإنتاج لا يُسمح بمفتاح افتراضي — الخادم يرفض الإقلاع بدل أن يعمل بمفتاح معروف.
const jwtSecret = isProduction
  ? required('JWT_SECRET')
  : process.env.JWT_SECRET || 'muthbit-dev-secret-not-for-production';

module.exports = {
  isProduction,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL', 'postgres://muthbit:muthbit_dev@127.0.0.1:5432/muthbit_dev'),
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '12h'
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  wathq: {
    apiKey: process.env.WATHQ_API_KEY || null,
    baseUrl: process.env.WATHQ_BASE_URL || 'https://api.wathq.sa'
  },
  sentryDsn: process.env.SENTRY_DSN || null,
  // عنوان الواجهة الذي يُبنى منه رابط إعادة التعيين في البريد. إن غاب فهو عنوان CORS نفسه —
  // وهما عنوان واحد في التطوير وفي Render اليوم.
  appUrl: (process.env.APP_URL || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/+$/, ''),
  // اختيار السائق في utils/mail.js وحده؛ هنا القيم الخام كما ضُبطت.
  mail: {
    driver: process.env.MAIL_DRIVER || null,
    resendApiKey: process.env.RESEND_API_KEY || null,
    from: process.env.MAIL_FROM || null
  }
};
