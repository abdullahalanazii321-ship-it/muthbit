'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const audit = require('../utils/audit');
const policy = require('../services/policy');
const { nextReference } = require('../utils/reference');
const { requireAuth, requireRole, scopeToCompany, assertOwnership, resolvePlatformCompany } = require('../middleware/auth');
const { badRequest, notFound, forbidden, conflict, policyBlocked } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

const BUYER_ROLES = ['procurement_buyer', 'procurement_manager', 'company_owner', 'finance_manager', 'ai_agent'];

/** العرض يُعتبر مكتملاً فقط بسعر وضمان ومدة تسليم — والناقص لا يُعرض على المشتري إطلاقاً. */
const COMPLETE_OFFER = (q) => q.where('offers.warranty_months', '>', 0).where('offers.lead_days', '>', 0);

const createSchema = z.object({
  item: z.string().min(2).max(300),
  quantity: z.number().int().positive(),
  category_id: z.string().uuid().optional(),
  specs: z.string().max(4000).optional(),
  needed_by: z.string().optional()
});

/** إنشاء طلب شراء. */
router.post('/', requireRole(BUYER_ROLES), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('بيانات الطلب غير صحيحة.', parsed.error.flatten());

    // فحص مبكر: من لا سقف له لا يفتح طلباً أصلاً، بدل أن يكتشف ذلك بعد جمع العروض.
    const precheck = await policy.evaluate(db, {
      companyId: req.user.companyId,
      buyerUserId: req.user.id,
      amount: 0,
      categoryId: parsed.data.category_id || null
    });
    if (!precheck.allowed) {
      // المحاولة الممنوعة تُقيَّد قبل رمي الخطأ. لا طلب أُنشئ بعد، فالكيان فارغ،
      // و null لا trx: لا معاملة هنا أصلاً.
      await audit.record(null, {
        actor: req.user,
        entityType: 'request',
        entityId: null,
        action: 'request.policy_blocked',
        payload: {
          item: parsed.data.item,
          quantity: parsed.data.quantity,
          category_id: parsed.data.category_id || null,
          reasons: precheck.reasons
        },
        ip: req.ip
      });
      throw policyBlocked('السياسة تمنع فتح هذا الطلب.', { reasons: precheck.reasons });
    }

    const created = await db.transaction(async (trx) => {
      const reference = await nextReference(trx, 'requests', 'reference', 'PR');
      const [row] = await trx('requests')
        .insert({
          reference,
          company_id: req.user.companyId,
          created_by_user_id: req.user.id,
          category_id: parsed.data.category_id || null,
          item: parsed.data.item,
          quantity: parsed.data.quantity,
          specs: parsed.data.specs || null,
          needed_by: parsed.data.needed_by || null,
          status: 'sourcing',
          requires_approval: true,
          policy_snapshot: JSON.stringify(precheck)
        })
        .returning('*');

      await audit.record(trx, {
        actor: req.user,
        entityType: 'request',
        entityId: row.id,
        action: 'request.created',
        payload: { reference, item: row.item, quantity: row.quantity },
        ip: req.ip
      });
      return row;
    });

    return res.status(201).json({ request: created, policy: precheck });
  } catch (err) {
    return next(err);
  }
});

/** قائمة الطلبات — مقيّدة بنطاق الشركة دائماً. */
router.get('/', async (req, res, next) => {
  try {
    // مسؤول المنصة يسمّي الشركة صراحةً (?company_id=)؛ ولغيره يُتجاهل المعامل ويبقى النطاق من الجلسة.
    const platformCompanyId = req.user.role === 'platform_admin'
      ? await resolvePlatformCompany(req.query.company_id, 'مسؤول المنصة يقرأ طلبات شركة محددة — حدّد الشركة.')
      : null;

    let query = db('requests').select(
      'id', 'reference', 'item', 'quantity', 'amount', 'status',
      'over_ceiling', 'requires_approval', 'approver_user_id', 'created_by_user_id', 'created_at'
    );
    query = scopeToCompany(query, req.user, 'company_id', platformCompanyId);

    // موظف المشتريات يرى طلباته هو فقط؛ المدير والمالك يريان طلبات الشركة كلها.
    if (['procurement_buyer', 'ai_agent'].includes(req.user.role)) {
      query = query.where({ created_by_user_id: req.user.id });
    }
    if (req.query.status) query = query.where({ status: String(req.query.status) });

    const requests = await query.orderBy('created_at', 'desc').limit(200);
    await audit.recordPlatformView(req, {
      companyId: platformCompanyId,
      action: 'platform.viewed_requests',
      entityType: 'company',
      entityId: platformCompanyId,
      payload: { filters: { status: req.query.status ? String(req.query.status) : null }, count: requests.length }
    });
    return res.json({ requests });
  } catch (err) {
    return next(err);
  }
});

/** تفاصيل طلب مع عروضه واعتماداته وأمر الشراء. */
router.get('/:id', async (req, res, next) => {
  try {
    const request = await db('requests').where({ id: req.params.id }).first();
    assertOwnership(request, req.user);
    if (['procurement_buyer', 'ai_agent'].includes(req.user.role) && request.created_by_user_id !== req.user.id) {
      throw forbidden();
    }

    const offersQuery = db('offers')
      .join('suppliers', 'suppliers.id', 'offers.supplier_id')
      .select(
        'offers.id', 'offers.price', 'offers.warranty_months', 'offers.lead_days',
        'offers.specs', 'offers.status', 'offers.created_at',
        'suppliers.id as supplier_id', 'suppliers.name as supplier_name', 'suppliers.rating as supplier_rating'
      )
      .where('offers.request_id', request.id)
      .whereNot('offers.status', 'withdrawn');

    const offers = await COMPLETE_OFFER(offersQuery).orderBy('offers.price', 'asc');
    const withheld = await db('offers')
      .where({ request_id: request.id })
      .whereNot('status', 'withdrawn')
      .where((b) => b.where('warranty_months', 0).orWhere('lead_days', 0))
      .count({ n: '*' })
      .first();

    const approvals = await db('approvals')
      .join('users', 'users.id', 'approvals.approver_user_id')
      .select('approvals.id', 'approvals.decision', 'approvals.reason', 'approvals.level',
        'approvals.amount_at_decision', 'approvals.decided_at', 'users.full_name as approver_name', 'users.role as approver_role')
      .where('approvals.request_id', request.id)
      .orderBy('approvals.decided_at', 'asc');

    const purchaseOrder = await db('purchase_orders').where({ request_id: request.id }).first();

    // الشركة معروفة من الصف نفسه، فلا معامل — لكن اطلاع المنصة يُقيَّد في سجلها.
    await audit.recordPlatformView(req, {
      companyId: request.company_id,
      action: 'platform.viewed_request',
      entityType: 'request',
      entityId: request.id,
      payload: { reference: request.reference }
    });

    return res.json({
      request,
      offers,
      withheld_offers_count: Number(withheld && withheld.n ? withheld.n : 0),
      approvals,
      purchase_order: purchaseOrder || null
    });
  } catch (err) {
    return next(err);
  }
});

/** اختيار عرض — هنا يُقيَّم الطلب مقابل السقف والسياسة. */
router.post('/:id/select-offer', requireRole(BUYER_ROLES), async (req, res, next) => {
  try {
    const schema = z.object({ offer_id: z.string().uuid() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest('معرّف العرض مطلوب.');

    const result = await db.transaction(async (trx) => {
      const request = await trx('requests').where({ id: req.params.id }).forUpdate().first();
      assertOwnership(request, req.user);
      if (!['sourcing', 'draft', 'rejected'].includes(request.status)) {
        throw conflict('لا يمكن اختيار عرض لطلب في هذه الحالة.', { status: request.status });
      }
      if (['procurement_buyer', 'ai_agent'].includes(req.user.role) && request.created_by_user_id !== req.user.id) {
        throw forbidden();
      }

      const offer = await trx('offers').where({ id: parsed.data.offer_id, request_id: request.id }).first();
      if (!offer) throw notFound('العرض غير موجود لهذا الطلب.');
      if (offer.status === 'withdrawn') throw conflict('العرض مسحوب.');
      if (!(offer.warranty_months > 0 && offer.lead_days > 0)) {
        throw badRequest('العرض ناقص (بلا ضمان أو مدة تسليم) ولا يصلح للاختيار.');
      }

      const supplier = await trx('suppliers').where({ id: offer.supplier_id }).first();
      if (!supplier || supplier.verification_status !== 'verified') {
        throw policyBlocked('لا يمكن اختيار عرض من مورد غير موثّق.');
      }

      const decision = await policy.evaluate(trx, {
        companyId: request.company_id,
        buyerUserId: request.created_by_user_id,
        amount: Number(offer.price),
        categoryId: request.category_id
      });

      if (!decision.allowed) {
        // خارج المعاملة (null لا trx): رمي الخطأ بعده يتراجع بالمعاملة، والقيد يجب أن يبقى.
        await audit.record(null, {
          actor: req.user,
          entityType: 'request',
          entityId: request.id,
          action: 'request.policy_blocked',
          payload: { offer_id: offer.id, amount: Number(offer.price), reasons: decision.reasons },
          ip: req.ip
        });
        throw policyBlocked('السياسة تمنع اعتماد هذا العرض.', { reasons: decision.reasons });
      }

      const [updated] = await trx('requests')
        .where({ id: request.id })
        .update({
          selected_offer_id: offer.id,
          amount: offer.price,
          status: 'pending_approval',
          over_ceiling: decision.overCeiling,
          requires_approval: true,
          approver_user_id: decision.approverUserId,
          policy_snapshot: JSON.stringify(decision),
          updated_at: trx.fn.now()
        })
        .returning('*');

      await trx('offers').where({ id: offer.id }).update({ status: 'selected', updated_at: trx.fn.now() });

      await audit.record(trx, {
        actor: req.user,
        entityType: 'request',
        entityId: request.id,
        action: 'request.offer_selected',
        payload: {
          offer_id: offer.id,
          supplier_id: offer.supplier_id,
          amount: Number(offer.price),
          over_ceiling: decision.overCeiling,
          approver_user_id: decision.approverUserId
        },
        ip: req.ip
      });

      return { request: updated, policy: decision };
    });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

/** الاعتماد أو الرفض — المعتمِد المحدد وحده، ولا أحد يعتمد طلباً أنشأه بنفسه. */
router.post('/:id/decision', requireRole('company_owner', 'finance_manager', 'procurement_manager'), async (req, res, next) => {
  try {
    const schema = z.object({
      decision: z.enum(['approved', 'rejected']),
      reason: z.string().max(1000).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest('القرار غير صحيح.');
    if (parsed.data.decision === 'rejected' && !parsed.data.reason) {
      throw badRequest('الرفض يحتاج سبباً مكتوباً.');
    }

    const result = await db.transaction(async (trx) => {
      const request = await trx('requests').where({ id: req.params.id }).forUpdate().first();
      assertOwnership(request, req.user);
      if (request.status !== 'pending_approval') {
        throw conflict('الطلب ليس بانتظار الاعتماد.', { status: request.status });
      }
      if (request.created_by_user_id === req.user.id) {
        throw forbidden('لا يمكن اعتماد طلب أنشأته بنفسك.');
      }
      if (request.approver_user_id && request.approver_user_id !== req.user.id) {
        throw forbidden('هذا الطلب موجّه لمعتمِد آخر.');
      }

      const [approval] = await trx('approvals')
        .insert({
          request_id: request.id,
          company_id: request.company_id,
          approver_user_id: req.user.id,
          level: request.over_ceiling ? 2 : 1,
          decision: parsed.data.decision,
          reason: parsed.data.reason || null,
          amount_at_decision: request.amount
        })
        .returning('*');

      const [updated] = await trx('requests')
        .where({ id: request.id })
        .update({
          status: parsed.data.decision === 'approved' ? 'approved' : 'rejected',
          updated_at: trx.fn.now()
        })
        .returning('*');

      if (parsed.data.decision === 'rejected' && request.selected_offer_id) {
        await trx('offers').where({ id: request.selected_offer_id }).update({ status: 'submitted', updated_at: trx.fn.now() });
      }

      await audit.record(trx, {
        actor: req.user,
        entityType: 'request',
        entityId: request.id,
        action: `request.${parsed.data.decision}`,
        payload: { amount: Number(request.amount), over_ceiling: request.over_ceiling, reason: parsed.data.reason || null },
        ip: req.ip
      });

      return { request: updated, approval };
    });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

/** إصدار أمر الشراء بشروط العرض المعتمد نفسها — لا تعديل صامت. */
router.post('/:id/purchase-order', requireRole('company_owner', 'finance_manager', 'procurement_manager'), async (req, res, next) => {
  try {
    const result = await db.transaction(async (trx) => {
      const request = await trx('requests').where({ id: req.params.id }).forUpdate().first();
      assertOwnership(request, req.user);
      if (request.status !== 'approved') throw conflict('لا يصدر أمر شراء إلا لطلب معتمد.', { status: request.status });
      if (!request.selected_offer_id) throw conflict('لا يوجد عرض مختار لهذا الطلب.');

      const existing = await trx('purchase_orders').where({ request_id: request.id }).first();
      if (existing) throw conflict('صدر أمر شراء لهذا الطلب مسبقاً.', { po_number: existing.po_number });

      const offer = await trx('offers').where({ id: request.selected_offer_id }).first();
      const supplier = await trx('suppliers').where({ id: offer.supplier_id }).first();
      if (!supplier || supplier.verification_status !== 'verified') {
        throw policyBlocked('تغيّرت حالة توثيق المورد. لا يصدر أمر شراء لمورد غير موثّق.');
      }

      const poNumber = await nextReference(trx, 'purchase_orders', 'po_number', 'PO');
      const [po] = await trx('purchase_orders')
        .insert({
          po_number: poNumber,
          request_id: request.id,
          offer_id: offer.id,
          company_id: request.company_id,
          supplier_id: offer.supplier_id,
          amount: offer.price,
          warranty_months: offer.warranty_months,
          lead_days: offer.lead_days,
          status: 'issued'
        })
        .returning('*');

      const [updated] = await trx('requests')
        .where({ id: request.id })
        .update({ status: 'ordered', updated_at: trx.fn.now() })
        .returning('*');

      await audit.record(trx, {
        actor: req.user,
        entityType: 'purchase_order',
        entityId: po.id,
        action: 'purchase_order.issued',
        payload: {
          po_number: poNumber,
          request_reference: request.reference,
          supplier_id: offer.supplier_id,
          amount: Number(offer.price),
          warranty_months: offer.warranty_months,
          lead_days: offer.lead_days
        },
        ip: req.ip
      });

      return { purchase_order: po, request: updated };
    });

    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
