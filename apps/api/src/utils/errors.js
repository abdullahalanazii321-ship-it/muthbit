'use strict';

class AppError extends Error {
  constructor(status, code, messageAr, details) {
    super(messageAr);
    this.status = status;
    this.code = code;
    this.messageAr = messageAr;
    this.details = details || null;
  }
}

const badRequest = (messageAr, details) => new AppError(400, 'bad_request', messageAr, details);
const unauthorized = (messageAr = 'يلزم تسجيل الدخول.') => new AppError(401, 'unauthorized', messageAr);
const forbidden = (messageAr = 'لا تملك صلاحية تنفيذ هذا الإجراء.') => new AppError(403, 'forbidden', messageAr);
const notFound = (messageAr = 'غير موجود.') => new AppError(404, 'not_found', messageAr);
const conflict = (messageAr, details) => new AppError(409, 'conflict', messageAr, details);
const policyBlocked = (messageAr, details) => new AppError(422, 'policy_blocked', messageAr, details);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, policyBlocked };
