'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const audit = require('../utils/audit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { badRequest, notFound, conflict, forbidden, policyBlocked } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('supplier_admin', 'platform_admin'));

async function verifiedSupplier(req) {
  const supplier = await db('suppliers').where({ id: req.user.supplierId }).first();
  if (!supplier) throw forbidden();
  if (supplier.verification_status !== 'verified') {
    throw policyBlocked('حسابك قيد التوثيق. لا يمكن تقديم عروض قبل اكتماله.');
  }
  return supplier;
}

/**
 * الطلبات المفتوحة أمام هذا المورد.
 *
 * قيدان معاً: الطلب في مرحلة جمع العروض، والفئة ضمن فئاته المعتمدة.
 * ولا تُكشف هوية الشركة الطالبة — يرى المورد الحاجة لا المشتري،
 * حتى لا يختلف السعر باختلاف اسم الشركة.
 */
router.get('/open-requests', async (req, res, next) => {
  try {
    const supplier = await verifiedSupplier(req);

    const categories = await db('supplier_categories')
      .where({ supplier_id: supplier.id, approved: true })
      .pluck('category_id');

    if (!categories.length) return res.json({ requests: [], note: 'لا توجد فئات معتمدة لحسابك بعد.' });

    const requests = await db('requests')
      .leftJoin('offers', function join() {
        this.on('offers.request_id', '=', 'requests.id').andOn('offers.supplier_id', '=', db.raw('?', [supplier.id]));
      })
      .select(
        'requests.id', 'requests.reference', 'requests.item', 'requests.quantity',
        'requests.specs', 'requests.needed_by', 'requests.category_id', 'requests.created_at',
        'offers.id as my_offer_id', 'offers.price as my_offer_price', 'offers.status as my_offer_status'
      )
      .where('requests.status', 'sourcing')
      .whereIn('requests.category_id', categories)
      .orderBy('requests.created_at', 'desc')
      .limit(100);

    return res.json({ requests });
  } catch (err) {
    return next(err);
  }
});

const offerSchema = z.object({
  request_id: z.string().uuid(),
  price: z.number().positive(),
  warranty_months: z.number().int().nonnegative(),
  lead_days: z.number().int().nonnegative(),
  specs: z.string().max(4000).optional()
});

/** تقديم عرض. العرض الناقص يُقبل ويُحفظ، لكنه لا يصل إلى المشتري إطلاقاً. */
router.post('/', async (req, res, next) => {
  try {
    const parsed = offerSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('بيانات العرض غير صحيحة.', parsed.error.flatten());
    const supplier = await verifiedSupplier(req);

    const created = await db.transaction(async (trx) => {
      const request = await trx('requests').where({ id: parsed.data.request_id }).first();
      if (!request) throw notFound('الطلب غير موجود.');
      if (request.status !== 'sourcing') throw conflict('الطلب لم يعد يستقبل عروضاً.', { status: request.status });

      const approved = await trx('supplier_categories')
        .where({ supplier_id: supplier.id, category_id: request.category_id, approved: true })
        .first();
      if (!approved) throw forbidden('الطلب خارج فئاتك المعتمدة.');

      const duplicate = await trx('offers').where({ request_id: request.id, supplier_id: supplier.id }).first();
      if (duplicate) throw conflict('قدّمت عرضاً لهذا الطلب مسبقاً. اسحبه أولاً لتقديم غيره.');

      const [offer] = await trx('offers')
        .insert({
          request_id: request.id,
          supplier_id: supplier.id,
          submitted_by_user_id: req.user.id,
          price: parsed.data.price,
          warranty_months: parsed.data.warranty_months,
          lead_days: parsed.data.lead_days,
          specs: parsed.data.specs || null,
          status: 'submitted'
        })
        .returning('*');

      await audit.record(trx, {
        actor: req.user,
        entityType: 'offer',
        entityId: offer.id,
        action: 'offer.submitted',
        payload: {
          request_reference: request.reference,
          price: Number(offer.price),
          warranty_months: offer.warranty_months,
          lead_days: offer.lead_days,
          complete: offer.warranty_months > 0 && offer.lead_days > 0
        },
        ip: req.ip
      });

      return offer;
    });

    const complete = created.warranty_months > 0 && created.lead_days > 0;
    return res.status(201).json({
      offer: created,
      complete,
      message: complete
        ? 'قُدّم العرض وهو مكتمل ويُعرض على المشتري.'
        : 'العرض ناقص (يلزم ضمان ومدة تسليم) ولن يُعرض على المشتري حتى يكتمل.'
    });
  } catch (err) {
    return next(err);
  }
});

/** عروض هذا المورد وحده. */
router.get('/mine', async (req, res, next) => {
  try {
    if (!req.user.supplierId) throw forbidden();
    const offers = await db('offers')
      .join('requests', 'requests.id', 'offers.request_id')
      .select(
        'offers.id', 'offers.price', 'offers.warranty_months', 'offers.lead_days', 'offers.status', 'offers.created_at',
        'requests.reference', 'requests.item', 'requests.quantity', 'requests.status as request_status'
      )
      .where('offers.supplier_id', req.user.supplierId)
      .orderBy('offers.created_at', 'desc')
      .limit(200);
    return res.json({ offers });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/withdraw', async (req, res, next) => {
  try {
    if (!req.user.supplierId) throw forbidden();
    const offer = await db('offers').where({ id: req.params.id, supplier_id: req.user.supplierId }).first();
    if (!offer) throw notFound('العرض غير موجود.');
    if (offer.status === 'selected') throw conflict('لا يمكن سحب عرض اختاره المشتري.');

    await db.transaction(async (trx) => {
      await trx('offers').where({ id: offer.id }).update({ status: 'withdrawn', updated_at: trx.fn.now() });
      await audit.record(trx, {
        actor: req.user,
        entityType: 'offer',
        entityId: offer.id,
        action: 'offer.withdrawn',
        ip: req.ip
      });
    });

    return res.json({ message: 'سُحب العرض.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
