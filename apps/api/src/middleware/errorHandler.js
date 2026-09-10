'use strict';
const { AppError } = require('../utils/errors');
const env = require('../config/env');

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'المسار غير موجود.' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.messageAr, details: err.details }
    });
  }

  // انتهاك قيد فريد من قاعدة البيانات — يُترجم لرسالة مفهومة بدل 500
  if (err && err.code === '23505') {
    return res.status(409).json({
      error: { code: 'conflict', message: 'القيمة مسجّلة مسبقاً.', details: err.detail || null }
    });
  }
  if (err && err.code === '23514') {
    return res.status(400).json({
      error: { code: 'constraint_violation', message: 'البيانات تخالف قيداً في قاعدة البيانات.', details: err.constraint || null }
    });
  }

  // eslint-disable-next-line no-console
  console.error('[muthbit] unhandled error:', err);
  return res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'حدث خطأ غير متوقع.',
      details: env.isProduction ? null : String(err && err.message ? err.message : err)
    }
  });
}

module.exports = { notFoundHandler, errorHandler };
