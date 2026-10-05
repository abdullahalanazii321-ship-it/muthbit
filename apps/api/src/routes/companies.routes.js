'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/knex');
const env = require('../config/env');
const audit = require('../utils/audit');
const { requireAuth, requireRole, scopeToCompany, resolvePlatformCompany } = require('../middleware/auth');
const { requireReason } = require('../utils/reason');
const { passwordSchema, passwordErrorMessage } = require('../utils/password');
const { badRequest, notFound, forbidden, conflict } = require('../utils/errors');
const { JOIN_STATUSES, generateJoinCode } = require('../utils/joinCode');

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
      source: z.enum(['manual', 'wathq']).optional(),
      reason: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest('حالة التوثيق غير صحيحة.');

    // الإيقاف وحده يشترط السبب: التوثيق يمنح، والإيقاف يسلب من كل موظف في الشركة.
    const reason = parsed.data.status === 'suspended'
      ? requireReason(parsed.data.reason, 'الإيقاف يحتاج سبباً مكتوباً.')
      : null;

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
      // أياً كانت حالته: بانتظار التفعيل (شركة جديدة) أو موقوفاً (شركة أُوقفت ثم عادت).
      //
      // والمالك وحده لا غير. هذا مقصود: المنصة تعيد للشركة بابها، ثم المالك هو من يقرر
      // من يعود من فريقه ومن لا يعود. الموظف الذي أوقفه مديره قبل إيقاف الشركة
      // لا يعود بقرار من المنصة — فلا «تُصلَح» هذه السطور بتوسيع النطاق.
      if (parsed.data.status === 'active') {
        await trx('users')
          .where({ company_id: company.id, role: 'company_owner' })
          .whereIn('status', ['pending', 'suspended'])
          .update({ status: 'active', updated_at: trx.fn.now() });
      }
      if (parsed.data.status === 'suspended') {
        // طالبو الانضمام (join_pending · join_rejected) ليسوا من الفريق بعد ولا يدخلون أصلاً — فلا يمسّهم الإيقاف،
        // وإلا ضاع طلبٌ لم يُبتّ فيه وصار صاحبه «موقوفاً» بلا دور.
        await trx('users')
          .where({ company_id: company.id })
          .whereNotIn('status', JOIN_STATUSES)
          .update({ status: 'suspended', updated_at: trx.fn.now() });
      }

      await audit.record(trx, {
        actor: req.user,
        entityType: 'company',
        entityId: company.id,
        action: `company.${parsed.data.status}`,
        payload: { from: company.status, to: parsed.data.status, source: parsed.data.source || 'manual', reason },
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
      // طالبو الانضمام والمرفوضون ليسوا من الفريق: مكانهم مسار طلبات الانضمام وحده.
      db('users')
        .select('id', 'email', 'full_name', 'role', 'status', 'created_at')
        .where({ company_id: req.params.id })
        .whereNotIn('status', JOIN_STATUSES),
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
  password: passwordSchema,
  role: z.enum(MANAGEABLE_ROLES)
});

/** إنشاء مستخدم داخل الشركة — المالك والمدير المالي فقط. */
router.post('/:id/users', requireRole('company_owner', 'finance_manager'), async (req, res, next) => {
  try {
    if (req.params.id !== req.user.companyId) throw forbidden();
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = passwordErrorMessage(parsed.error) || 'بيانات المستخدم غير صحيحة.';
      throw badRequest(message, parsed.error.flatten());
    }

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

    // طالب الانضمام لا يُعامَل مشترياً: بلا دور فلا سقف — يُضبط سقفه عند اعتماده لا قبله.
    const buyer = await db('users')
      .where({ id: req.params.userId, company_id: req.user.companyId })
      .whereNotIn('status', JOIN_STATUSES)
      .first();
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
    const reason = requireReason(req.body && req.body.reason, 'الإيقاف يحتاج سبباً مكتوباً.');
    // طالب الانضمام ليس من الفريق: لا يُوقف ولا يُفعَّل — يُعتمد أو يُرفض من مسار طلبات الانضمام.
    const target = await db('users')
      .where({ id: req.params.userId, company_id: req.user.companyId })
      .whereNotIn('status', JOIN_STATUSES)
      .first();
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
        payload: { reason },
        ip: req.ip
      });
    });

    return res.json({ message: 'أُوقف الحساب وأُلغيت طلباته المفتوحة.' });
  } catch (err) {
    return next(err);
  }
});

/**
 * إعادة تفعيل حساب موقوف — نقيض الإيقاف في الدخول وحده.
 *
 * لا يُعاد هنا شيء سوى حالة الحساب: لا السقف المعطَّل، ولا مفاتيح الوكلاء الملغاة،
 * ولا الطلبات التي أُلغيت عند الإيقاف. الإلغاء وقع ولا يُستأنف — إعادة التفعيل
 * تعيد الدخول لا تمحو ما مضى. من أراد سقفاً فليضبطه من جديد، ومن أراد طلباً فليفتحه من جديد.
 */
router.post('/:id/users/:userId/activate', requireRole('company_owner', 'finance_manager'), async (req, res, next) => {
  try {
    if (req.params.id !== req.user.companyId) throw forbidden();
    // طالب الانضمام ليس من الفريق: لا يُوقف ولا يُفعَّل — يُعتمد أو يُرفض من مسار طلبات الانضمام.
    const target = await db('users')
      .where({ id: req.params.userId, company_id: req.user.companyId })
      .whereNotIn('status', JOIN_STATUSES)
      .first();
    if (!target) throw notFound('المستخدم غير موجود في هذه الشركة.');
    // نفس قيد الإيقاف: حساب المالك لا يُمَسّ إلا بيد مالك. التحقق قبل الحالة،
    // فمن لا يملك الإجراء لا يُعلَّم بحالة الحساب.
    if (target.role === 'company_owner' && req.user.role !== 'company_owner') {
      throw forbidden('إعادة تفعيل مالك الشركة لا تتم إلا بواسطة مالك.');
    }
    if (target.status === 'active') throw conflict('الحساب نشط بالفعل.');

    await db.transaction(async (trx) => {
      await trx('users').where({ id: target.id }).update({ status: 'active', updated_at: trx.fn.now() });

      await audit.record(trx, {
        actor: req.user,
        entityType: 'user',
        entityId: target.id,
        action: 'user.activated',
        payload: { from: target.status, role: target.role },
        ip: req.ip
      });
    });

    return res.json({ message: 'أُعيد تفعيل الحساب. لا يعود سقفه المعطَّل ولا طلباته الملغاة.' });
  } catch (err) {
    return next(err);
  }
});

/* ───────────── انضمام الموظفين برمز الشركة — للمالك وحده ─────────────
 * الموظف يسجّل بنفسه بالرمز (POST /api/auth/join-company) فيُنشأ بحالة join_pending بلا دور ولا سقف.
 * المالك وحده يقرأ الرمز ويبدّله ويعتمد أو يرفض: المدير المالي يضبط السقوف ويوقف، لكنه لا يُدخل أحداً إلى الشركة.
 * الشركة في المسار يجب أن تكون شركة المالك، والطلب يجب أن يكون في شركته — يُتحقق هنا لا في الواجهة.
 */

const ownerOfCompany = (req) => {
  if (req.params.id !== req.user.companyId) throw forbidden();
};

/** رمز الانضمام الحالي. */
router.get('/:id/join-code', requireRole('company_owner'), async (req, res, next) => {
  try {
    ownerOfCompany(req);
    const company = await db('companies').select('join_code', 'join_code_updated_at').where({ id: req.user.companyId }).first();
    if (!company) throw notFound('الشركة غير موجودة.');
    return res.json({ join_code: company.join_code, join_code_updated_at: company.join_code_updated_at });
  } catch (err) {
    return next(err);
  }
});

/**
 * رمز جديد: القديم يبطل في اللحظة نفسها (الصف واحد والرمز عمود فيه).
 * السجل يقول إن الرمز بُدّل ولا يكتب الرمز — لا القديم ولا الجديد.
 * التصادم مع رمز شركة أخرى احتمال واحد في تريليون؛ القيد الفريد يرفضه فنولّد غيره.
 */
router.post('/:id/join-code/rotate', requireRole('company_owner'), async (req, res, next) => {
  try {
    ownerOfCompany(req);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const joinCode = generateJoinCode();
      try {
        // eslint-disable-next-line no-await-in-loop
        const row = await db.transaction(async (trx) => {
          const [updated] = await trx('companies')
            .where({ id: req.user.companyId })
            .update({ join_code: joinCode, join_code_updated_at: trx.fn.now(), updated_at: trx.fn.now() })
            .returning(['join_code', 'join_code_updated_at']);
          if (!updated) throw notFound('الشركة غير موجودة.');
          await audit.record(trx, {
            actor: req.user,
            entityType: 'company',
            entityId: req.user.companyId,
            action: 'company.join_code_rotated',
            ip: req.ip
          });
          return updated;
        });
        return res.json({ join_code: row.join_code, join_code_updated_at: row.join_code_updated_at });
      } catch (err) {
        if (!(err && err.code === '23505')) throw err;
      }
    }
    throw new Error('تعذّر توليد رمز انضمام فريد بعد خمس محاولات.');
  } catch (err) {
    return next(err);
  }
});

/** طلبات الانضمام المعلّقة في شركة المالك: الاسم والبريد ووقت الطلب لا غير. */
router.get('/:id/join-requests', requireRole('company_owner'), async (req, res, next) => {
  try {
    ownerOfCompany(req);
    const requests = await db('users')
      .select('id', 'full_name', 'email', 'join_requested_at')
      .where({ company_id: req.user.companyId, status: 'join_pending' })
      .orderBy('join_requested_at', 'asc');
    return res.json({ requests });
  } catch (err) {
    return next(err);
  }
});

/**
 * الطلب المعلّق في شركة المالك نفسها، مقفلاً حتى نهاية المعاملة: قراران متزامنان لا ينجحان معاً.
 * غيره — في شركة أخرى، أو بُتّ فيه، أو ليس طلباً أصلاً — «غير موجود»: لا يُعلَم بوجود حساب في شركة أخرى.
 */
async function pendingJoinRequest(trx, req) {
  const user = await trx('users')
    .where({ id: req.params.userId, company_id: req.user.companyId, status: 'join_pending' })
    .forUpdate()
    .first();
  if (!user) throw notFound('طلب الانضمام غير موجود أو بُتّ فيه.');
  return user;
}

// الدوران الوحيدان عبر الرمز العام. لا مالك ولا مسؤول منصة، ولا مدير مالي: من يدخل برمز عام
// لا يُرفع إلى دور مالي بخطوة واحدة — المالك ينشئ المدير المالي من مسار الإضافة المباشرة.
const JOIN_ASSIGNABLE_ROLES = ['procurement_buyer', 'procurement_manager'];

const missing = (value) => value === undefined || value === null || value === '';

/**
 * اعتماد طلب انضمام: الدور والسقف إلزاميان، ويصير الحساب فعّالاً بهما في معاملة واحدة.
 * السقف هو per_request_ceiling؛ والسقف الشهري والفئات والمعتمِد تبقى فارغة يكملها المالك من مسار الحدود.
 */
router.post('/:id/join-requests/:userId/approve', requireRole('company_owner'), async (req, res, next) => {
  try {
    ownerOfCompany(req);
    const body = req.body || {};
    if (missing(body.role)) throw badRequest('حدّد الدور عند اعتماد طلب الانضمام.');
    if (!JOIN_ASSIGNABLE_ROLES.includes(body.role)) {
      throw badRequest('الدور المحدد لا يُسند عبر طلب الانضمام. المتاح: موظف المشتريات أو مدير المشتريات.');
    }
    if (missing(body.per_request_ceiling)) throw badRequest('حدّد سقف الطلب الواحد عند اعتماد طلب الانضمام.');
    const ceiling = z.number().nonnegative().safeParse(body.per_request_ceiling);
    if (!ceiling.success) throw badRequest('سقف الطلب الواحد يجب أن يكون رقماً لا يقل عن صفر.');

    const result = await db.transaction(async (trx) => {
      const user = await pendingJoinRequest(trx, req);
      const [approved] = await trx('users')
        .where({ id: user.id })
        .update({
          role: body.role,
          status: 'active',
          join_decided_at: trx.fn.now(),
          join_decided_by: req.user.id,
          join_rejection_reason: null,
          updated_at: trx.fn.now()
        })
        .returning(['id', 'email', 'full_name', 'role', 'status']);
      const [limits] = await trx('buyer_limits')
        .insert({
          company_id: req.user.companyId,
          user_id: user.id,
          per_request_ceiling: ceiling.data,
          set_by_user_id: req.user.id
        })
        .returning(['per_request_ceiling', 'monthly_ceiling']);

      await audit.record(trx, {
        actor: req.user,
        entityType: 'user',
        entityId: user.id,
        action: 'user.join_approved',
        payload: { role: body.role, per_request_ceiling: ceiling.data, requested_at: user.join_requested_at },
        ip: req.ip
      });
      return { user: approved, limits };
    });

    return res.json({ message: 'اعتُمد طلب الانضمام وصار الحساب فعّالاً.', ...result });
  } catch (err) {
    return next(err);
  }
});

/** رفض طلب انضمام — السبب إلزامي بقاعدة الرفض نفسها في المنصة كلها (utils/reason.js) ونصها. */
router.post('/:id/join-requests/:userId/reject', requireRole('company_owner'), async (req, res, next) => {
  try {
    ownerOfCompany(req);
    const reason = requireReason(req.body && req.body.reason, 'الرفض يحتاج سبباً مكتوباً.');

    await db.transaction(async (trx) => {
      const user = await pendingJoinRequest(trx, req);
      await trx('users')
        .where({ id: user.id })
        .update({
          status: 'join_rejected',
          join_decided_at: trx.fn.now(),
          join_decided_by: req.user.id,
          join_rejection_reason: reason,
          updated_at: trx.fn.now()
        });
      await audit.record(trx, {
        actor: req.user,
        entityType: 'user',
        entityId: user.id,
        action: 'user.join_rejected',
        payload: { reason, requested_at: user.join_requested_at },
        ip: req.ip
      });
    });

    return res.json({ message: 'رُفض طلب الانضمام.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
