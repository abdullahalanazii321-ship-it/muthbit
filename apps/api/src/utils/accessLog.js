'use strict';
const db = require('../db/knex');

/**
 * سجل الوصول الداخلي (platform_access_log) — لمالك المنصة، لا تراه الشركات ولا يظهر في سجل أي شركة.
 *
 * يُكتب فيه كل اطلاع من لوحة المنصة على بيانات شركة أو مورد، والتوثيق، وقراءة السجل نفسه، والمنح والسحب،
 * وإنشاء مسؤولي المنصة وإيقافهم. وحلّ محل قيود platform.viewed_* التي كانت تُكتب في سجل الشركة نفسها.
 *
 * يُنتظر قبل الرد دائماً: إن فشلت الكتابة فشلت القراءة معها — لا اطلاع يمرّ بلا قيد.
 * لا يُكتب فيه رمز انضمام ولا كلمة مرور ولا سر: مرشّحات وأعداد ومعرّفات فقط.
 * والجدول لا يُعدَّل ولا يُحذف ولا يُفرَّغ — مشغّلات في القاعدة (هجرة platform_owner_access_log).
 *
 * route نمط المسار كما عرّفه express (/api/requests/:id)، والسجل بعينه في entity_id.
 */
async function recordAccess(req, { action, companyId = null, supplierId = null, targetUserId = null, entityType = null, entityId = null, payload = null }, trx = null) {
  const writer = trx || db;
  await writer('platform_access_log').insert({
    actor_user_id: req.user.id,
    actor_role: req.user.role,
    action,
    method: req.method,
    route: `${req.baseUrl}${req.route ? req.route.path : ''}`.slice(0, 120),
    company_id: companyId,
    supplier_id: supplierId,
    target_user_id: targetUserId,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    payload: payload ? JSON.stringify(payload) : null,
    ip: req.ip || null
  });
}

/** اطلاع مسؤول المنصة وحده يُقيَّد — قراءة المرء بيانات شركته أو مورده حدث عادي لا يُكتب. */
async function recordPlatformAccess(req, entry, trx = null) {
  if (!req.user || req.user.role !== 'platform_admin') return;
  await recordAccess(req, entry, trx);
}

module.exports = { recordAccess, recordPlatformAccess };
