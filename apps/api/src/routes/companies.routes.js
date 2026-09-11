'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/knex');
const env = require('../config/env');
const audit = require('../utils/audit');
const { requireAuth, requireRole, scopeToCompany, resolvePlatformCompany } = require('../middleware/auth');
const { badRequest, notFound, forbidden, conflict } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

const MANAGEABLE_ROLES = ['finance_manager', 'procurement_manager', 'procurement_buyer', 'ai_agent'];

const COMPANY_STATUSES = ['pending', 'active', 'suspended'];

/**
 * قائمة الشركات — فريق المنصة وحده.
 * مسار منصة لا مسار شركة: لا يُفتح لدور آخر، ولا يُقيَّد في سجل تدقيق
 * لأنه لا يخص شركة بعينها فلا سجل يُكتب فيه.
 * الأحدث تسجيلاً أولاً — فهو ما ينتظر التوثيق.
 */
router.get('/', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const query = db('companies').select(
      'id', 'name', 'cr_number', 'city', 'status', 'verification_source', 'verified_at', 'created_at'
    );
    if (req.query.status) {
      const status = String(req.query.status);
      if (!COMPANY_STATUSES.includes(status)) throw badRequest('حالة الشركة غير صحيحة.');
      query.where({ status });
    }
    const companies = await query.orderBy('created_at', 'desc');
    return res.json({ companies });
  } catch (err) {
    return next(err);
  }
});

/** توثيق شركة وتفعيلها — فريق المنصة فقط. */
router.patch('/:id/verification', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['active', 'suspended', 'pending']),
      source: z.enum(['manual', 'wathq']).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest('حالة التوثيق غير صحيحة.');

    const company = await db('companies').where({ id: req.params.id }).first();
    if (!company) throw notFound('الشركة غير موجودة.');

    const updated = await db.transaction(async (trx) => {
      const [row] = await trx('companies')
        .where({ id: company.id })
        .update({
          status: parsed.data.status,
          verification_source: parsed.data.source || 'manual',
          verified_at: parsed.data.status === 'active' ? trx.fn.now() : null,
          updated_at: trx.fn.now()
        })
        .returning('*');

      // تفعيل الشركة يفعّل مالكها معه — لا معنى لشركة نشطة بلا من يدخل إليها.
      if (parsed.data.status === 'active') {
        await trx('users')
          .where({ company_id: company.id, role: 'company_owner', status: 'pending' })
          .update({ status: 'active', updated_at: trx.fn.now() });
      }
      if (parsed.data.status === 'suspended') {
        await trx('users').where({ company_id: company.id }).update({ status: 'suspended', updated_at: trx.fn.now() });
      }

      await audit.record(trx, {
        actor: req.user,
        entityType: 'company',
        entityId: company.id,
        action: `company.${parsed.data.status}`,
        payload: { from: company.status, to: parsed.data.status, source: parsed.data.source || 'manual' },
        ip: req.ip
      });

      return row;
    });

    return res.json({ company: updated });
  } catch (err) {
    return next(err);
  }
});

/** مستخدمو الشركة — مقيّد بنطاق الشركة دائماً. */
router.get('/:id/users', requireRole('company_owner', 'finance_manager', 'procurement_manager', 'platform_admin'), async (req, res, next) => {
  try {
    if (req.user.role !== 'platform_admin' && req.params.id !== req.user.companyId) throw forbidden();
    // الشركة في المسار نفسه؛ ولمسؤول المنصة يُتحقق أنها صالحة وموجودة قبل القراءة وتقييد الاطلاع.
    const platformCompanyId = req.user.role === 'platform_admin'
      ? await resolvePlatformCompany(req.params.id, 'مسؤول المنصة يقرأ مستخدمي شركة محددة — حدّد الشركة.')
      : null;
    const rows = await scopeToCompany(
      db('users').select('id', 'email', 'full_name', 'role', 'status', 'created_at').where({ company_id: req.params.id }),
      req.user,
      'company_id',
      platformCompanyId
    ).orderBy('created_at', 'asc');
    await audit.recordPlatformView(req, {
      companyId: platformCompanyId,
      action: 'platform.viewed_users',
      entityType: 'company',
      entityId: platformCompanyId,
      payload: { count: rows.length }
    });
    return res.json({ users: rows });
  } catch (err) {
    return next(err);
  }
});

const createUserSchema = z.object({
  full_name: z.string().min(2).max(160),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(MANAGEABLE_ROLES)
});

/** إنشاء مستخدم داخل الشركة — المالك والمدير المالي فقط. */
router.post('/:id/users', requireRole('company_owner', 'finance_manager'), async (req, res, next) => {
  try {
    if (req.params.id !== req.user.companyId) throw forbidden();
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('بيانات المستخدم غير صحيحة.', parsed.error.flatten());

    const email = parsed.data.email.toLowerCase().trim();
    if (await db('users').where({ email }).first()) throw conflict('البريد الإلكتروني مسجّل مسبقاً.');

    const created = await db.transaction(async (trx) => {
      const [row] = await trx('users')
        .insert({
          email,
          password_hash: await bcrypt.hash(parsed.data.password, env.bcryptRounds),
          full_name: parsed.data.full_name,
          role: parsed.data.role,
          status: 'active',
          company_id: req.user.companyId
        })
        .returning(['id', 'email', 'full_name', 'role', 'status']);

      await audit.record(trx, {
        actor: req.user,
        entityType: 'user',
        entityId: row.id,
        action: 'user.created',
        payload: { role: parsed.data.role },
        ip: req.ip
      });
      return row;
    });

    return res.status(201).json({ user: created });
  } catch (err) {
    return next(err);
  }
});

const limitsSchema = z.object({
  per_request_ceiling: z.number().nonnegative(),
  monthly_ceiling: z.number().positive().nullable().optional(),
  allowed_category_ids: z.array(z.string().uuid()).optional(),
  approver_user_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional()
});

/** ضبط سقف مشتري — المالك والمدير المالي فقط. */
router.put('/:id/buyers/:userId/limits', requireRole('company_owner', 'finance_manager'), async (req, res, next) => {
  try {
    if (req.params.id !== req.user.companyId) throw forbidden();
    const parsed = limitsSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('بيانات السقف غير صحيحة.', parsed.error.flatten());

    const buyer = await db('users').where({ id: req.params.userId, company_id: req.user.companyId }).first();
    if (!buyer) throw notFound('المستخدم غير موجود في هذه الشركة.');

    if (parsed.data.approver_user_id) {
      const approver = await db('users')
        .where({ id: parsed.data.approver_user_id, company_id: req.user.companyId, status: 'active' })
        .first();
      if (!approver) throw badRequest('المعتمِد المحدد غير موجود في الشركة أو غير نشط.');
      if (approver.id === buyer.id) throw badRequest('لا يمكن أن يعتمد المشتري طلباته بنفسه.');
    }

    const payload = {
      company_id: req.user.companyId,
      user_id: buyer.id,
      per_request_ceiling: parsed.data.per_request_ceiling,
      monthly_ceiling: parsed.data.monthly_ceiling ?? null,
      allowed_category_ids: parsed.data.allowed_category_ids && parsed.data.allowed_category_ids.length
        ? parsed.data.allowed_category_ids
        : null,
      approver_user_id: parsed.data.approver_user_id ?? null,
      active: parsed.data.active ?? true,
      set_by_user_id: req.user.id,
      updated_at: db.fn.now()
    };

    const saved = await db.transaction(async (trx) => {
      const [row] = await trx('buyer_limits')
        .insert(payload)
        .onConflict('user_id')
        .merge()
        .returning('*');

      await audit.record(trx, {
        actor: req.user,
        entityType: 'buyer_limits',
        entityId: row.id,
        action: 'limits.set',
        payload: {
          buyer: buyer.id,
          per_request_ceiling: payload.per_request_ceiling,
          monthly_ceiling: payload.monthly_ceiling,
          approver_user_id: payload.approver_user_id
        },
        ip: req.ip
      });
      return row;
    });

    return res.json({ limits: saved });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/buyers/:userId/limits', requireRole('company_owner', 'finance_manager', 'procurement_manager'), async (req, res, next) => {
  try {
    if (req.params.id !== req.user.companyId) throw forbidden();
    const row = await db('buyer_limits').where({ user_id: req.params.userId, company_id: req.user.companyId }).first();
    if (!row) throw notFound('لم يُضبط سقف لهذا المستخدم بعد.');
    return res.json({ limits: row });
  } catch (err) {
    return next(err);
  }
});

/** الإيقاف الفوري: تجميد مستخدم أو وكيل ذكي في لحظة واحدة. */
router.post('/:id/users/:userId/suspend', requireRole('company_owner', 'finance_manager'), async (req, res, next) => {
  try {
    if (req.params.id !== req.user.companyId) throw forbidden();
    const target = await db('users').where({ id: req.params.userId, company_id: req.user.companyId }).first();
    if (!target) throw notFound('المستخدم غير موجود في هذه الشركة.');
    if (target.id === req.user.id) throw badRequest('لا يمكنك إيقاف حسابك بنفسك.');
    // الإيقاف يلغي طلبات صاحبه المفتوحة؛ فلا يُجمَّد المالك إلا بيد مالك.
    if (target.role === 'company_owner' && req.user.role !== 'company_owner') {
      throw forbidden('إيقاف مالك الشركة لا يتم إلا بواسطة مالك.');
    }

    await db.transaction(async (trx) => {
      await trx('users').where({ id: target.id }).update({ status: 'suspended', updated_at: trx.fn.now() });
      await trx('buyer_limits').where({ user_id: target.id }).update({ active: false, updated_at: trx.fn.now() });
      await trx('agents').where({ user_id: target.id }).update({ active: false, revoked_at: trx.fn.now(), updated_at: trx.fn.now() });
      // الطلبات المفتوحة تُلغى قبل أن تتحول إلى التزام
      await trx('requests')
        .where({ created_by_user_id: target.id })
        .whereIn('status', ['draft', 'sourcing', 'pending_approval'])
        .update({ status: 'cancelled', updated_at: trx.fn.now() });

      await audit.record(trx, {
        actor: req.user,
        entityType: 'user',
        entityId: target.id,
        action: 'user.suspended',
        payload: { reason: req.body && req.body.reason ? String(req.body.reason).slice(0, 500) : null },
        ip: req.ip
      });
    });

    return res.json({ message: 'أُوقف الحساب وأُلغيت طلباته المفتوحة.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
