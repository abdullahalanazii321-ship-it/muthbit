'use strict';
const db = require('../db/knex');

/**
 * قيد حدث في سجل التدقيق.
 * السجل غير قابل للتعديل أو الحذف (يمنعه trigger في قاعدة البيانات)،
 * فالكتابة هنا نهائية ولا تُراجَع لاحقاً.
 *
 * يُمرَّر trx عند الكتابة داخل معاملة، حتى لا يُقيَّد حدث لعملية لم تكتمل.
 * ويُمرَّر null لقيدٍ يجب أن يبقى وإن تراجعت المعاملة (محاولة منعتها السياسة).
 *
 * companyId اختياري: الشركة التي يخصها الحدث إن اختلفت عن شركة الفاعل
 * (المورد بلا شركة، وأحداث عروضه تخص شركة الطلب). إن غاب بقي company_id من الفاعل كما كان.
 */
async function record(trx, { actor, entityType, entityId, action, payload, ip, companyId }) {
  const writer = trx || db;
  await writer('audit_log').insert({
    actor_user_id: actor && actor.id ? actor.id : null,
    actor_role: actor && actor.role ? actor.role : null,
    company_id: companyId || (actor && actor.companyId ? actor.companyId : null),
    supplier_id: actor && actor.supplierId ? actor.supplierId : null,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    action,
    payload: payload ? JSON.stringify(payload) : null,
    ip: ip || null
  });
}

module.exports = { record };
