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
