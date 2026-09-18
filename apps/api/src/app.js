'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const db = require('./db/knex');
const pkg = require('../package.json');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const {
  loginLimiter,
  loginEmailLimiter,
  accountCreationLimiter,
  agentKeyLimiter,
  apiLimiter
} = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth.routes');
const companiesRoutes = require('./routes/companies.routes');
const suppliersRoutes = require('./routes/suppliers.routes');
const requestsRoutes = require('./routes/requests.routes');
const offersRoutes = require('./routes/offers.routes');
const auditRoutes = require('./routes/audit.routes');
const categoriesRoutes = require('./routes/categories.routes');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (env.env !== 'test') app.use(morgan('tiny'));

  // مسار عام يقرؤه أي أحد: لا اسم مضيف قاعدة بيانات ولا عدد اتصالات ولا أي
  // تفصيل عن البنية التحتية. ما هنا يكفي المراقب ولا يفيد المهاجم.
  app.get('/health', async (req, res) => {
    const base = {
      service: 'muthbit-api',
      env: env.env,
      version: pkg.version,
      uptime_seconds: Math.round(process.uptime())
    };
    try {
      await db.raw('select 1');
      res.json({ status: 'ok', ...base });
    } catch (e) {
      res.status(503).json({ status: 'degraded', ...base });
    }
  });

  // الحدود تُركَّب بعد /health وقبل مسارات /api: أدوات المراقبة تنادي /health كل دقيقة،
  // وحظره يعني إنذاراً كاذباً بأن المنصة سقطت.
  app.use('/api', apiLimiter);
  // مفتاح الوكيل يُجرَّب على أي مسار، فحدّه يُركَّب على /api كله ولا يَعُدّ
  // إلا ما حمل الرأس X-API-Key فعلاً.
  app.use('/api', agentKeyLimiter);
  // المسارات العامة الثلاثة التي لا تحميها مصادقة تحمل حدّاً أضيق فوق الحد العام.
  // الدخول يحمل حدّين معاً: الأول بمصدر الطلب (IP) والثاني بالحساب المُستهدَف (البريد).
  // الترتيب مقصود — حدّ المصدر أولاً: الطلب الذي يحجبه لا يصل الثاني فلا يستهلك
  // من رصيد بريد الضحية شيئاً، فلا يُقفل حساب بريء بفيضان من عنوان محجوب أصلاً.
  // يعملان على `req.body` فوجب أن يبقيا بعد `express.json()` أعلاه.
  app.post('/api/auth/login', loginLimiter, loginEmailLimiter);
  // نسخة واحدة من accountCreationLimiter على مساري الإنشاء معاً — عدّاد واحد مشترك،
  // فالحد على «إنشاء حساب جديد» من هذا العنوان أياً كان نوعه، ولا يُضاعَف بالتنقل بين المسارين.
  app.post('/api/auth/register-company', accountCreationLimiter);
  app.post('/api/suppliers/register', accountCreationLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/companies', companiesRoutes);
  app.use('/api/suppliers', suppliersRoutes);
  app.use('/api/requests', requestsRoutes);
  app.use('/api/offers', offersRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/categories', categoriesRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
