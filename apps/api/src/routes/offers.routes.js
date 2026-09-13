'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const audit = require('../utils/audit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireReason } = require('../utils/reason');
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
        // الحالة صريحة في الرد: البوابة لا تعرض «تقديم عرض جديد» إلا على طلب sourcing تراه بعينها.
        'requests.status',
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

// العرض مكتمل إذا كان الضمان ومدة التسليم كلاهما أكبر من صفر.
const isComplete = (offer) => offer.warranty_months > 0 && offer.lead_days > 0;
const INCOMPLETE_MESSAGE = 'العرض ناقص (يلزم ضمان ومدة تسليم) ولن يُعرض على المشتري حتى يكتمل.';

/**
 * تقديم عرض. العرض الناقص يُقبل ويُحفظ، لكنه لا يصل إلى المشتري إطلاقاً.
 *
 * صف واحد لكل مورد على كل طلب (قيد فريد في الجدول)، فالعرض بعد السحب لا يُدرج صفاً ثانياً
 * بل يُحيي الصف نفسه بالقيم الجديدة. ويُقيَّد ذلك حدثاً مستقلاً يحمل السعر السابق،
 * لأن الصف بعد التحديث لا يحفظه — والسجل الملحق وحده يحفظ تاريخ السعر.
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = offerSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('بيانات العرض غير صحيحة.', parsed.error.flatten());
    const supplier = await verifiedSupplier(req);

    const { offer, resubmitted } = await db.transaction(async (trx) => {
      const request = await trx('requests').where({ id: parsed.data.request_id }).first();
      if (!request) throw notFound('الطلب غير موجود.');
      if (request.status !== 'sourcing') throw conflict('الطلب لم يعد يستقبل عروضاً.', { status: request.status });

      const approved = await trx('supplier_categories')
        .where({ supplier_id: supplier.id, category_id: request.category_id, approved: true })
        .first();
      if (!approved) throw forbidden('الطلب خارج فئاتك المعتمدة.');

      // forUpdate: طلبان متزامنان على عرض مسحوب لا يُحييانه معاً — الثاني ينتظر فيجده مُقدَّماً فيُرفض.
      const existing = await trx('offers')
        .where({ request_id: request.id, supplier_id: supplier.id })
        .forUpdate()
        .first();
      // المسحوب وحده يُعاد تقديمه. المُقدَّم والمختار والمرفوض وأي حالة لا نعرفها: رفض — الافتراض هو المنع.
      if (existing && existing.status !== 'withdrawn') {
        throw conflict('قدّمت عرضاً لهذا الطلب مسبقاً. اسحبه أولاً لتقديم غيره.');
      }

      const terms = {
        submitted_by_user_id: req.user.id,
        price: parsed.data.price,
        warranty_months: parsed.data.warranty_months,
        lead_days: parsed.data.lead_days,
        specs: parsed.data.specs || null,
        status: 'submitted'
      };

      if (existing) {
        const [revived] = await trx('offers')
          .where({ id: existing.id })
          .update({ ...terms, updated_at: trx.fn.now() })
          .returning('*');

        await audit.record(trx, {
          actor: req.user,
          // شركة الطلب لا شركة الفاعل — كما في التقديم الأول.
          companyId: request.company_id,
          entityType: 'offer',
          entityId: revived.id,
          action: 'offer.resubmitted',
          payload: {
            request_reference: request.reference,
            // من الصف قبل التحديث: هذا وحده ما يُبقي السعر السابق محفوظاً والصف واحد.
            previous_price: Number(existing.price),
            price: Number(revived.price),
            warranty_months: revived.warranty_months,
            lead_days: revived.lead_days,
            complete: isComplete(revived)
          },
          ip: req.ip
        });

        return { offer: revived, resubmitted: true };
      }

      const [created] = await trx('offers')
        .insert({ request_id: request.id, supplier_id: supplier.id, ...terms })
        .returning('*');

      await audit.record(trx, {
        actor: req.user,
        // شركة الطلب لا شركة الفاعل: المورد بلا شركة، فبدونها لا يرى المشتري الحدث في سجله.
        companyId: request.company_id,
        entityType: 'offer',
        entityId: created.id,
        action: 'offer.submitted',
        payload: {
          request_reference: request.reference,
          price: Number(created.price),
          warranty_months: created.warranty_months,
          lead_days: created.lead_days,
          complete: isComplete(created)
        },
        ip: req.ip
      });

      return { offer: created, resubmitted: false };
    });

    const complete = isComplete(offer);
    const doneMessage = resubmitted ? 'أُعيد تقديم العرض بالسعر الجديد.' : 'قُدّم العرض وهو مكتمل ويُعرض على المشتري.';
    // الإحياء 200 لا 201: المورد لم يُنشئ صفاً جديداً.
    return res.status(resubmitted ? 200 : 201).json({
      offer,
      complete,
      message: complete ? doneMessage : INCOMPLETE_MESSAGE
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
        // updated_at: إعادة التقديم تُحيي الصف القديم فيبقى created_at تاريخ العرض الأول،
        // والبوابة تعرض بجانب السعر الجديد تاريخاً لا يسبقه.
        'offers.updated_at',
        'requests.reference', 'requests.item', 'requests.quantity', 'requests.status as request_status'
      )
      .where('offers.supplier_id', req.user.supplierId)
      // الترتيب بالتاريخ المعروض نفسه، فلا يظهر عمود «التاريخ» مبعثراً.
      .orderBy('offers.updated_at', 'desc')
      .limit(200);
    return res.json({ offers });
  } catch (err) {
    return next(err);
  }
});

/**
 * سحب العرض — فعل يسلب: الشركة قد تكون بنت قرارها على هذا العرض،
 * فيشترط سبباً مكتوباً كبقية ما يسلب في المنصة.
 * والسبب يصل إلى سجل الشركة المشترية وتقرؤه — والمورد يُخبَر بذلك في الشاشة قبل أن يكتب.
 */
router.post('/:id/withdraw', async (req, res, next) => {
  try {
    if (!req.user.supplierId) throw forbidden();
    const reason = requireReason(req.body && req.body.reason, 'سحب العرض يحتاج سبباً مكتوباً.');
    const offer = await db('offers').where({ id: req.params.id, supplier_id: req.user.supplierId }).first();
    if (!offer) throw notFound('العرض غير موجود.');
    if (offer.status === 'selected') throw conflict('لا يمكن سحب عرض اختاره المشتري.');

    await db.transaction(async (trx) => {
      await trx('offers').where({ id: offer.id }).update({ status: 'withdrawn', updated_at: trx.fn.now() });
      // شركة الطلب لا شركة الفاعل — كما في تقديم العرض.
      const request = await trx('requests').select('company_id').where({ id: offer.request_id }).first();
      await audit.record(trx, {
        actor: req.user,
        companyId: request && request.company_id,
        entityType: 'offer',
        entityId: offer.id,
        action: 'offer.withdrawn',
        payload: { reason },
        ip: req.ip
      });
    });

    return res.json({ message: 'سُحب العرض.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
