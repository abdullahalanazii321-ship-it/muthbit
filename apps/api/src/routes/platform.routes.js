'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/knex');
const env = require('../config/env');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recordAccess } = require('../utils/accessLog');
const { requireReason } = require('../utils/reason');
const { passwordSchema, passwordErrorMessage } = require('../utils/password');
const { badRequest, forbidden, notFound, conflict } = require('../utils/errors');

/**
 * مالك المنصة: سجل الوصول الداخلي، ومن يقرؤه، ومسؤولو المنصة.
 *
 * المالك مسؤول منصة بعلم is_platform_owner (هجرة platform_owner_access_log) — مالك واحد، ولا مسار هنا
 * ولا في غيره يرفع أحداً إليه: العلم يتغيّر بهجرة وحدها، ويمنع غيرها مشغّل في القاعدة.
 * ومثله صلاحية قراءة السجل: لا يمنحها إلا المالك، ولا يمنحها أحد لنفسه.
 */
const router = express.Router();
router.use(requireAuth);
router.use(requireRole('platform_admin'));

const ownerOnly = (req, res, next) => (req.user.isPlatformOwner ? next() : next(forbidden()));
const accessLogReader = (req, res, next) =>
  req.user.isPlatformOwner || req.user.canReadAccessLog ? next() : next(forbidden());

const ACCESS_LOG_MAX = 500;
const uuid = z.string().uuid();

/**
 * سجل الوصول الداخلي — للمالك ولمن منحه القراءة. والقراءة نفسها تُقيَّد فيه (بعد القراءة، قبل الرد):
 * فمن مُنح الصلاحية يعرف المالك متى فتح السجل. إن فشل القيد فشل الرد — لا قراءة بلا أثر.
 */
router.get('/access-log', accessLogReader, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, ACCESS_LOG_MAX);
    const companyId = req.query.company_id ? String(req.query.company_id) : null;
    const actorId = req.query.actor_user_id ? String(req.query.actor_user_id) : null;
    if (companyId && !uuid.safeParse(companyId).success) throw badRequest('معرّف الشركة غير صحيح.');
    if (actorId && !uuid.safeParse(actorId).success) throw badRequest('معرّف المستخدم غير صحيح.');

    const query = db('platform_access_log as l')
      .leftJoin('users as actor', 'actor.id', 'l.actor_user_id')
      .leftJoin('users as target', 'target.id', 'l.target_user_id')
      .leftJoin('companies as c', 'c.id', 'l.company_id')
      .leftJoin('suppliers as s', 's.id', 'l.supplier_id')
      .select(
        'l.id', 'l.created_at', 'l.action', 'l.method', 'l.route', 'l.entity_type', 'l.entity_id', 'l.payload',
        'l.actor_user_id', 'actor.full_name as actor_name', 'l.actor_role',
        'l.company_id', 'c.name as company_name',
        'l.supplier_id', 's.name as supplier_name',
        'l.target_user_id', 'target.full_name as target_name'
      )
      .orderBy('l.id', 'desc')
      .limit(limit);
    if (companyId) query.where('l.company_id', companyId);
    if (actorId) query.where('l.actor_user_id', actorId);
    const entries = await query;

    await recordAccess(req, {
      action: 'viewed.access_log',
      payload: { filters: { company_id: companyId, actor_user_id: actorId, limit }, count: entries.length }
    });
    return res.json({ entries });
  } catch (err) {
    return next(err);
  }
});

/** مسؤولو المنصة — للمالك. لا بيانات شركة هنا، فلا يُقيَّد. */
router.get('/admins', ownerOnly, async (req, res, next) => {
  try {
    const admins = await db('users')
      .select('id', 'full_name', 'email', 'status', 'is_platform_owner', 'can_read_access_log', 'created_at')
      .where({ role: 'platform_admin' })
      .orderBy('created_at', 'asc');
    return res.json({ admins });
  } catch (err) {
    return next(err);
  }
});

const createAdminSchema = z.object({
  full_name: z.string().min(2).max(160),
  email: z.string().email(),
  password: passwordSchema
});

/**
 * إنشاء مسؤول منصة — للمالك وحده. بالاسم والبريد وكلمة مرور بسياسة المنصة نفسها، كالإضافة المباشرة في الشركة.
 * لا يُنشأ مالكاً ولا قارئاً للسجل: العلمان على قيمتهما الافتراضية، وما زاد في الجسم يسقط.
 */
router.post('/admins', ownerOnly, async (req, res, next) => {
  try {
    const parsed = createAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest(passwordErrorMessage(parsed.error) || 'بيانات المسؤول غير صحيحة.', parsed.error.flatten());
    }
    const email = parsed.data.email.toLowerCase().trim();
    if (await db('users').where({ email }).first()) throw conflict('البريد الإلكتروني مسجّل مسبقاً.');
    const passwordHash = await bcrypt.hash(parsed.data.password, env.bcryptRounds);

    const created = await db.transaction(async (trx) => {
      const [row] = await trx('users')
        .insert({ email, password_hash: passwordHash, full_name: parsed.data.full_name, role: 'platform_admin', status: 'active' })
        .returning(['id', 'email', 'full_name', 'role', 'status']);
      await recordAccess(req, { action: 'created.platform_admin', targetUserId: row.id, entityType: 'user', entityId: row.id }, trx);
      return row;
    }).catch((err) => {
      if (err && err.code === '23505') throw conflict('البريد الإلكتروني مسجّل مسبقاً.');
      throw err;
    });

    return res.status(201).json({ admin: created });
  } catch (err) {
    return next(err);
  }
});

/** مسؤول منصة بعينه — غيره «غير موجود». */
async function platformAdmin(trx, userId) {
  if (!uuid.safeParse(userId).success) throw notFound('المسؤول غير موجود.');
  const user = await trx('users').where({ id: userId, role: 'platform_admin' }).forUpdate().first();
  if (!user) throw notFound('المسؤول غير موجود.');
  return user;
}

/**
 * إيقاف مسؤول منصة — للمالك وحده، بسبب مكتوب كبقية ما يسلب في المنصة.
 * لا يوقف المالك نفسه، ولا يُوقَف المالك — لا من هنا ولا من غيره.
 */
router.post('/admins/:userId/suspend', ownerOnly, async (req, res, next) => {
  try {
    const reason = requireReason(req.body && req.body.reason, 'الإيقاف يحتاج سبباً مكتوباً.');
    await db.transaction(async (trx) => {
      const target = await platformAdmin(trx, req.params.userId);
      if (target.id === req.user.id) throw badRequest('لا يمكنك إيقاف حسابك بنفسك.');
      if (target.is_platform_owner) throw forbidden('لا يُوقَف مالك المنصة.');
      if (target.status === 'suspended') throw conflict('الحساب موقوف بالفعل.');
      await trx('users').where({ id: target.id }).update({ status: 'suspended', updated_at: trx.fn.now() });
      await recordAccess(req, { action: 'suspended.platform_admin', targetUserId: target.id, entityType: 'user', entityId: target.id, payload: { reason } }, trx);
    });
    return res.json({ message: 'أُوقف حساب المسؤول.' });
  } catch (err) {
    return next(err);
  }
});

/**
 * إعادة تفعيل مسؤول منصة موقوف — للمالك وحده، وبسبب مكتوب كالإيقاف.
 *
 * في المعاملة نفسها:
 * - يُزاد session_version فيبطل كل رمز صدر قبل الإيقاف (الإيقاف يمنع بالحالة وحدها،
 *   فلولا هذا لعاد كل رمز قديم صالحاً — ومنها رمز ربما سُرق وكان سبب الإيقاف).
 * - تُسحب قراءة سجل الوصول إن كانت ممنوحة: يعود الحساب بلا صلاحية، ويمنحها المالك من جديد إن شاء.
 * ويُقيَّد الاثنان في سجل الوصول: إعادة التفعيل بسببها، والسحب قيداً مستقلاً كأي سحب.
 */
router.post('/admins/:userId/activate', ownerOnly, async (req, res, next) => {
  try {
    const reason = requireReason(req.body && req.body.reason, 'إعادة التفعيل تحتاج سبباً مكتوباً.');
    await db.transaction(async (trx) => {
      const target = await platformAdmin(trx, req.params.userId);
      if (target.is_platform_owner) throw forbidden('مالك المنصة لا يُوقَف ولا يُعاد تفعيله.');
      if (target.status === 'active') throw conflict('الحساب نشط بالفعل.');
      const revokeReader = target.can_read_access_log === true;
      await trx('users')
        .where({ id: target.id })
        .update({
          status: 'active',
          can_read_access_log: false,
          session_version: trx.raw('session_version + 1'),
          updated_at: trx.fn.now()
        });
      await recordAccess(req, { action: 'activated.platform_admin', targetUserId: target.id, entityType: 'user', entityId: target.id, payload: { reason } }, trx);
      if (revokeReader) {
        await recordAccess(req, { action: 'revoked.access_log', targetUserId: target.id, entityType: 'user', entityId: target.id }, trx);
      }
    });
    return res.json({ message: 'أُعيد تفعيل حساب المسؤول.' });
  } catch (err) {
    return next(err);
  }
});

/**
 * منح صلاحية قراءة سجل الوصول أو سحبها — للمالك وحده، ولمسؤول منصة غيره.
 * المالك يقرأ السجل دائماً فلا يُمنح ولا يُسحب منه. وكل منح وسحب يُقيَّد في السجل نفسه.
 */
router.put('/admins/:userId/access-log-reader', ownerOnly, async (req, res, next) => {
  try {
    const allowed = req.body && req.body.allowed;
    if (typeof allowed !== 'boolean') throw badRequest('حدّد المنح أو السحب (allowed: true أو false).');
    const result = await db.transaction(async (trx) => {
      const target = await platformAdmin(trx, req.params.userId);
      if (target.is_platform_owner) throw badRequest('مالك المنصة يقرأ السجل دائماً — لا يُمنح ولا يُسحب منه.');
      if (target.can_read_access_log === allowed) return { changed: false };
      await trx('users').where({ id: target.id }).update({ can_read_access_log: allowed, updated_at: trx.fn.now() });
      await recordAccess(req, { action: allowed ? 'granted.access_log' : 'revoked.access_log', targetUserId: target.id, entityType: 'user', entityId: target.id }, trx);
      return { changed: true };
    });
    return res.json({
      message: allowed ? 'مُنحت صلاحية قراءة سجل الوصول.' : 'سُحبت صلاحية قراءة سجل الوصول.',
      changed: result.changed
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
