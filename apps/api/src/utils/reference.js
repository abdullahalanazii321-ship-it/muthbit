'use strict';

/**
 * توليد مرجع طلب أو أمر شراء بصيغة PR-2026-000413 / PO-2026-000413.
 * الترقيم تسلسلي داخل السنة، ويُحسب داخل نفس المعاملة لتفادي التكرار.
 */
async function nextReference(trx, table, column, prefix) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const row = await trx(table)
    .whereILike(column, like)
    .count({ n: '*' })
    .first();
  const seq = Number(row && row.n ? row.n : 0) + 1;
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

module.exports = { nextReference };
