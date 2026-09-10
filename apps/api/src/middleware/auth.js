'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const env = require('../config/env');
const db = require('../db/knex');
const { unauthorized, forbidden, badRequest, notFound } = require('../utils/errors');

const COMPANY_ROLES = ['company_owner', 'finance_manager', 'procurement_manager', 'procurement_buyer', 'ai_agent'];
const SUPPLIER_ROLES = ['supplier_admin'];

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      company_id: user.company_id || null,
      supplier_id: user.supplier_id || null
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

/**
 * التحقق من الهوية.
 * fail-closed: أي غموض — رأس مفقود، توقيع غير صالح، مستخدم غير نشط،
 * أو دور لا يطابق نطاقه المخزّن — يُرفض. لا يوجد مسار افتراضي يسمح بالمرور.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const apiKey = req.headers['x-api-key'];

    let user = null;

    if (apiKey) {
      user = await authenticateAgent(String(apiKey));
    } else {
      if (!header.startsWith('Bearer ')) throw unauthorized();
      let payload;
      try {
        payload = jwt.verify(header.slice(7), env.jwt.secret);
      } catch (e) {
        throw unauthorized('انتهت الجلسة أو أن الرمز غير صالح.');
      }
      user = await db('users').where({ id: payload.sub }).first();
    }

    if (!user) throw unauthorized();
    if (user.status !== 'active') throw forbidden('الحساب غير مفعّل أو موقوف.');

    // النطاق يُقرأ من قاعدة البيانات لا من الرمز، حتى لا يُستفاد من رمز قديم بعد نقل المستخدم.
    if (COMPANY_ROLES.includes(user.role) && !user.company_id) throw forbidden('حساب بلا شركة مرتبطة.');
    if (SUPPLIER_ROLES.includes(user.role) && !user.supplier_id) throw forbidden('حساب بلا مورد مرتبط.');

    if (user.company_id) {
      const company = await db('companies').where({ id: user.company_id }).first();
      if (!company || company.status !== 'active') throw forbidden('حساب الشركة غير مفعّل أو موقوف.');
    }
    if (user.supplier_id) {
      const supplier = await db('suppliers').where({ id: user.supplier_id }).first();
      if (!supplier) throw forbidden('حساب المورد غير موجود.');
      if (supplier.verification_status === 'suspended') throw forbidden('حساب المورد موقوف.');
      req.supplier = supplier;
    }

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      fullName: user.full_name,
      companyId: user.company_id || null,
      supplierId: user.supplier_id || null
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

async function authenticateAgent(rawKey) {
  const prefix = rawKey.slice(0, 12);
  const agents = await db('agents').where({ api_key_prefix: prefix, active: true });
  for (const agent of agents) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await bcrypt.compare(rawKey, agent.api_key_hash);
    if (ok) {
      const user = await db('users').where({ id: agent.user_id }).first();
      if (user) user.agent_id = agent.id;
      return user;
    }
  }
  throw unauthorized('مفتاح الوكيل غير صالح أو ملغى.');
}

/**
 * السماح بأدوار محددة فقط — قائمة سماح صريحة، لا استثناءات ولا فروع else مفتوحة.
 */
function requireRole(...allowed) {
  const list = allowed.flat();
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!list.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

/**
 * قيد الاستعلام بنطاق المستخدم.
 * كل استعلام يمر من هنا يخرج مقيّداً بالشركة أو بالمورد.
 * لا يُستثنى إلا مدير المنصة صراحةً — وأي دور غير معروف يُرفض بدل أن يمر.
 */
function scopeToCompany(query, user, column = 'company_id', platformCompanyId = null) {
  // مسؤول المنصة لا يقرأ كل الشركات دفعة واحدة: يمرّر المسار الشركة التي سمّاها صراحةً
  // (resolvePlatformCompany)، وإلا رُفض. وتقييد اطلاعه في سجل تلك الشركة على المسار (audit.recordPlatformView).
  if (user.role === 'platform_admin') {
    if (!platformCompanyId) throw forbidden();
    return query.where(column, platformCompanyId);
  }
  if (COMPANY_ROLES.includes(user.role)) {
    if (!user.companyId) throw forbidden();
    return query.where(column, user.companyId);
  }
  throw forbidden();
}

function scopeToSupplier(query, user, column = 'supplier_id') {
  if (user.role === 'platform_admin') return query;
  if (SUPPLIER_ROLES.includes(user.role)) {
    if (!user.supplierId) throw forbidden();
    return query.where(column, user.supplierId);
  }
  throw forbidden();
}

/** التأكد من أن صفاً مقروءاً يخص فعلاً نطاق المستخدم قبل تسليمه. */
function assertOwnership(row, user, { companyColumn = 'company_id', supplierColumn = 'supplier_id' } = {}) {
  if (!row) throw forbidden();
  if (user.role === 'platform_admin') return row;
  if (COMPANY_ROLES.includes(user.role)) {
    if (row[companyColumn] && row[companyColumn] === user.companyId) return row;
    throw forbidden();
  }
  if (SUPPLIER_ROLES.includes(user.role)) {
    if (row[supplierColumn] && row[supplierColumn] === user.supplierId) return row;
    throw forbidden();
  }
  throw forbidden();
}

const companyIdSchema = z.string().uuid();

/**
 * الشركة التي يطّلع عليها مسؤول المنصة: يجب أن يسمّيها بمعرّف صالح لشركة موجودة.
 * أي غموض يُرفض — لا قراءة لكل الشركات دفعة واحدة، ولا قيد اطلاع في سجل شركة لا وجود لها.
 */
async function resolvePlatformCompany(companyId, missingMessageAr) {
  if (!companyIdSchema.safeParse(companyId).success) throw badRequest(missingMessageAr);
  const company = await db('companies').select('id').where({ id: companyId }).first();
  if (!company) throw notFound('الشركة غير موجودة.');
  return company.id;
}

module.exports = {
  COMPANY_ROLES,
  SUPPLIER_ROLES,
  signToken,
  requireAuth,
  requireRole,
  scopeToCompany,
  scopeToSupplier,
  assertOwnership,
  resolvePlatformCompany
};
