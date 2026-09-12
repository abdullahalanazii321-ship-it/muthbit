'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const db = require('./db/knex');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { loginLimiter, registerLimiter, apiLimiter } = require('./middleware/rateLimit');

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

  app.get('/health', async (req, res) => {
    try {
      await db.raw('select 1');
      res.json({ status: 'ok', service: 'muthbit-api', env: env.env });
    } catch (e) {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  // الحدود تُركَّب بعد /health وقبل مسارات /api: أدوات المراقبة تنادي /health كل دقيقة،
  // وحظره يعني إنذاراً كاذباً بأن المنصة سقطت.
  app.use('/api', apiLimiter);
  // المسارات العامة الثلاثة التي لا تحميها مصادقة تحمل حدّاً أضيق فوق الحد العام.
  app.post('/api/auth/login', loginLimiter);
  // نسخة واحدة من registerLimiter على مساري الإنشاء معاً — عدّاد واحد مشترك،
  // فالحد على «إنشاء حساب جديد» من هذا العنوان أياً كان نوعه، ولا يُضاعَف بالتنقل بين المسارين.
  app.post('/api/auth/register-company', registerLimiter);
  app.post('/api/suppliers/register', registerLimiter);

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
