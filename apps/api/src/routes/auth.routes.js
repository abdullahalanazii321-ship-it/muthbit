'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/knex');
const env = require('../config/env');
const audit = require('../utils/audit');
const { signToken, requireAuth } = require('../middleware/auth');
const { badRequest, unauthorized, conflict } = require('../utils/errors');
const { passwordSchema, passwordErrorMessage } = require('../utils/password');
const passwordReset = require('../services/passwordReset');
const { INVALID_JOIN_CODE_MESSAGE, normalizeJoinCode } = require('../utils/joinCode');

const router = express.Router();

const registerSchema = z.object({
  company: z.object({
    name: z.string().min(2).max(200),
    cr_number: z.string().regex(/^\d{10}$/, 'السجل التجاري يجب أن يكون 10 أرقام.'),
    vat_number: z.string().max(20).optional(),
    city: z.string().max(80).optional()
  }),
  owner: z.object({
    full_name: z.string().min(2).max(160),
    email: z.string().email(),
    phone: z.string().max(30).optional(),
    password: passwordSchema
  })
});

/**
 * تسجيل شركة جديدة.
 * الحساب يُنشأ بحالة pending — التوثيق خطوة منفصلة يقوم بها فريق المنصة
 * (أو التحقق الآلي من واثق لاحقاً)، ولا يستطيع أحد الشراء قبلها.
 */
router.post('/register-company', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      // رسالة كلمة المرور تسبق العامة: هي وحدها التي تقول للمستخدم ما ينقص.
      const message = passwordErrorMessage(parsed.error) || 'بيانات التسجيل غير مكتملة أو غير صحيحة.';
      throw badRequest(message, parsed.error.flatten());
    }
    const { company, owner } = parsed.data;

    const email = owner.email.toLowerCase().trim();
    const existing = await db('users').where({ email }).first();
    if (existing) throw conflict('البريد الإلكتروني مسجّل مسبقاً.');

    const result = await db.transaction(async (trx) => {
      const [createdCompany] = await trx('companies')
        .insert({
          name: company.name,
          cr_number: company.cr_number,
          vat_number: company.vat_number || null,
          city: company.city || null,
          status: 'pending'
        })
        .returning('*');

      const passwordHash = await bcrypt.hash(owner.password, env.bcryptRounds);
      const [createdOwner] = await trx('users')
        .insert({
          email,
          password_hash: passwordHash,
          full_name: owner.full_name,
          phone: owner.phone || null,
          role: 'company_owner',
          status: 'pending',
          company_id: createdCompany.id
        })
        .returning('*');

      await audit.record(trx, {
        actor: { id: createdOwner.id, role: 'company_owner', companyId: createdCompany.id },
        entityType: 'company',
        entityId: createdCompany.id,
        action: 'company.registered',
        payload: { cr_number: company.cr_number, name: company.name },
        ip: req.ip
      });

      return { company: createdCompany, owner: createdOwner };
    });

    return res.status(201).json({
      message: 'تم استلام طلب التسجيل. الحساب بانتظار التوثيق قبل تفعيله.',
      company: { id: result.company.id, name: result.company.name, status: result.company.status },
      user: { id: result.owner.id, email: result.owner.email, status: result.owner.status }
    });
  } catch (err) {
    return next(err);
  }
});

const joinSchema = z.object({
  join_code: z.string().max(40),
  full_name: z.string().min(2).max(160),
  email: z.string().email(),
  password: passwordSchema
});

const EMAIL_TAKEN_MESSAGE = 'البريد الإلكتروني مسجّل مسبقاً.';

/**
 * انضمام موظف إلى شركة برمزها — عام بلا رمز جلسة، ومحدَّد المعدل بعدّاد إنشاء الحسابات نفسه (app.js).
 *
 * الحساب يُنشأ بحالة join_pending بلا دور ولا سقف، فلا يدخل حتى يعتمده المالك (companies.routes.js).
 * الرمز الخاطئ ورمز شركة غير مفعّلة رسالة واحدة لا تكشف عن الشركة شيئاً، والرد لا يحمل من الشركة إلا اسمها.
 * كلمة المرور بسياسة utils/password.js نفسها بلا تخفيف.
 *
 * ومن رُفض طلبه يسجّل من جديد بالبريد نفسه ورمز صالح: يعود صفّه إلى join_pending بالشركة التي رمزها معه،
 * وتُفرَّغ حقول القرار السابق — فلا يُقفل خطأٌ في الرفض بريدَ الموظف إلى الأبد.
 * وتتغيّر كلمة مروره إلى الجديدة، فيُزاد session_version في المعاملة نفسها كما في كل مسار يغيّرها.
 */
router.post('/join-company', async (req, res, next) => {
  try {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = passwordErrorMessage(parsed.error) || 'بيانات الانضمام غير مكتملة أو غير صحيحة.';
      throw badRequest(message, parsed.error.flatten());
    }

    const company = await db('companies')
      .select('id', 'name')
      .where({ join_code: normalizeJoinCode(parsed.data.join_code), status: 'active' })
      .first();
    if (!company) throw badRequest(INVALID_JOIN_CODE_MESSAGE);

    const email = parsed.data.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(parsed.data.password, env.bcryptRounds);

    await db.transaction(async (trx) => {
      const existing = await trx('users').where({ email }).forUpdate().first();
      if (existing && existing.status !== 'join_rejected') throw conflict(EMAIL_TAKEN_MESSAGE);

      let user;
      if (existing) {
        [user] = await trx('users')
          .where({ id: existing.id })
          .update({
            password_hash: passwordHash,
            full_name: parsed.data.full_name,
            company_id: company.id,
            status: 'join_pending',
            join_requested_at: trx.fn.now(),
            join_decided_at: null,
            join_decided_by: null,
            join_rejection_reason: null,
            session_version: trx.raw('session_version + 1'),
            updated_at: trx.fn.now()
          })
          .returning(['id', 'company_id']);
      } else {
        [user] = await trx('users')
          .insert({
            email,
            password_hash: passwordHash,
            full_name: parsed.data.full_name,
            role: null,
            status: 'join_pending',
            company_id: company.id,
            join_requested_at: trx.fn.now()
          })
          .returning(['id', 'company_id']);
      }

      // الفاعل هو الطالب نفسه بلا دور. الرمز لا يُكتب في السجل أبداً.
      await audit.record(trx, {
        actor: { id: user.id, role: null, companyId: company.id },
        entityType: 'user',
        entityId: user.id,
        action: 'user.join_requested',
        payload: existing
          ? { reapplied: true, previous_company_id: existing.company_id, previous_rejection_reason: existing.join_rejection_reason }
          : null,
        ip: req.ip
      });
    }).catch((err) => {
      // طلبان متزامنان بالبريد نفسه: القيد الفريد يرفض الثاني — بالرسالة نفسها لا برسالة القيد العامة.
      if (err && err.code === '23505') throw conflict(EMAIL_TAKEN_MESSAGE);
      throw err;
    });

    return res.status(201).json({
      message: 'تم استلام طلب انضمامك. حسابك بانتظار اعتماد الشركة.',
      company: { name: company.name }
    });
  } catch (err) {
    return next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('البريد الإلكتروني وكلمة المرور مطلوبان.');

    const email = parsed.data.email.toLowerCase().trim();
    const user = await db('users').where({ email }).first();

    // رسالة واحدة لكل حالات الفشل: لا نكشف إن كان البريد مسجّلاً أصلاً.
    const generic = unauthorized('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    if (!user || !user.password_hash) throw generic;

    const ok = await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!ok) throw generic;

    // بعد التحقق من كلمة المرور لا قبله: من لا يعرفها لا يعرف أن للبريد طلب انضمام.
    if (user.status === 'join_pending') throw unauthorized('حسابك بانتظار اعتماد الشركة.');
    if (user.status === 'join_rejected') throw unauthorized('لم يُعتمد طلب انضمامك.');
    if (user.status !== 'active') {
      throw unauthorized('الحساب بانتظار التوثيق أو موقوف. راجع فريق المنصة.');
    }

    await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });
    await audit.record(null, {
      actor: { id: user.id, role: user.role, companyId: user.company_id, supplierId: user.supplier_id },
      entityType: 'user',
      entityId: user.id,
      action: 'user.login',
      ip: req.ip
    });

    return res.json({
      token: signToken(user),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        company_id: user.company_id,
        supplier_id: user.supplier_id
      }
    });
  } catch (err) {
    return next(err);
  }
});

const forgotSchema = z.object({ email: z.string().email() });

/**
 * نسيت كلمة المرور — عام بلا رمز.
 * الرد واحد بالحرف ويخرج قبل أي بحث في القاعدة: لا يختلف ولا يختلف زمنه بين بريد مسجّل
 * وغير مسجّل، موقوف أو فعّال. وإلا صار هذا المسار فهرساً لعملاء المنصة.
 * البحث والرمز والإرسال بعد الرد (services/passwordReset.js).
 * والبريد المشوّه وحده يُرفض بـ 400: صيغته لا تكشف شيئاً عن وجود حساب.
 */
router.post('/forgot-password', (req, res, next) => {
  try {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('البريد الإلكتروني غير صحيح.');
    const email = parsed.data.email.toLowerCase().trim();

    res.json({ message: passwordReset.FORGOT_MESSAGE });
    passwordReset.issueInBackground(email);
    return undefined;
  } catch (err) {
    return next(err);
  }
});

const resetSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordSchema
});

/**
 * إعادة التعيين بالرمز — عام بلا رمز جلسة.
 * كلمة المرور الجديدة بسياسة utils/password.js نفسها. والرمز الغائب والمنتهي والمستعمل
 * رسالة واحدة لا تفرّق بينها.
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = passwordErrorMessage(parsed.error) || passwordReset.INVALID_TOKEN_MESSAGE;
      throw badRequest(message);
    }
    await passwordReset.resetPassword({ token: parsed.data.token, password: parsed.data.password, ip: req.ip });
    return res.json({ message: passwordReset.RESET_SUCCESS_MESSAGE });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const payload = { user: req.user };
    if (req.user.companyId) {
      payload.company = await db('companies')
        .select('id', 'name', 'cr_number', 'city', 'status')
        .where({ id: req.user.companyId })
        .first();
      payload.limits = await db('buyer_limits').where({ user_id: req.user.id }).first();
    }
    if (req.user.supplierId) {
      payload.supplier = await db('suppliers')
        .select('id', 'name', 'cr_number', 'verification_status', 'rating')
        .where({ id: req.user.supplierId })
        .first();
    }
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
