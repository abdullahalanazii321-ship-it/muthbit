'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/knex');
const env = require('../config/env');
const audit = require('../utils/audit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireReason } = require('../utils/reason');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');

const router = express.Router();

const registerSchema = z.object({
  supplier: z.object({
    name: z.string().min(2).max(200),
    cr_number: z.string().regex(/^\d{10}$/, 'السجل التجاري يجب أن يكون 10 أرقام.'),
    vat_number: z.string().max(20).optional(),
    city: z.string().max(80).optional(),
    category_slugs: z.array(z.string()).min(1, 'اختر فئة واحدة على الأقل.')
  }),
  admin: z.object({
    full_name: z.string().min(2).max(160),
    email: z.string().email(),
    phone: z.string().max(30).optional(),
    password: z.string().min(8)
  })
});

/**
 * تسجيل مورد أو وكيل تجاري.
 * يدخل بحالة pending: لا يرى طلباً ولا يقدّم عرضاً حتى يكتمل توثيقه.
 * هذا ما يجعل كلمة «موثّق» في المنصة صحيحة بدل أن تكون شارة تُمنح بالتسجيل.
 */
router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('بيانات تسجيل المورد غير مكتملة.', parsed.error.flatten());
    const { supplier, admin } = parsed.data;

    const email = admin.email.toLowerCase().trim();
    if (await db('users').where({ email }).first()) throw conflict('البريد الإلكتروني مسجّل مسبقاً.');

    const categories = await db('categories').whereIn('slug', supplier.category_slugs);
    if (categories.length !== supplier.category_slugs.length) throw badRequest('توجد فئة غير معروفة ضمن الفئات المرسلة.');

    const result = await db.transaction(async (trx) => {
      const [createdSupplier] = await trx('suppliers')
        .insert({
          name: supplier.name,
          cr_number: supplier.cr_number,
          vat_number: supplier.vat_number || null,
          city: supplier.city || null,
          verification_status: 'pending'
        })
        .returning('*');

      await trx('supplier_categories').insert(
        categories.map((c) => ({ supplier_id: createdSupplier.id, category_id: c.id, approved: false }))
      );

      const [createdAdmin] = await trx('users')
        .insert({
          email,
          password_hash: await bcrypt.hash(admin.password, env.bcryptRounds),
          full_name: admin.full_name,
          phone: admin.phone || null,
          role: 'supplier_admin',
          status: 'pending',
          supplier_id: createdSupplier.id
        })
        .returning('*');

      await audit.record(trx, {
        actor: { id: createdAdmin.id, role: 'supplier_admin', supplierId: createdSupplier.id },
        entityType: 'supplier',
        entityId: createdSupplier.id,
        action: 'supplier.registered',
        payload: { cr_number: supplier.cr_number, categories: supplier.category_slugs },
        ip: req.ip
      });

      return { supplier: createdSupplier, admin: createdAdmin };
    });

    return res.status(201).json({
      message: 'تم استلام طلب التسجيل. لا يمكن تقديم عروض قبل اكتمال التوثيق.',
      supplier: { id: result.supplier.id, name: result.supplier.name, verification_status: result.supplier.verification_status }
    });
  } catch (err) {
    return next(err);
  }
});

router.use(requireAuth);

/** توثيق مورد — فريق المنصة فقط. */
router.patch('/:id/verification', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['verified', 'rejected', 'suspended', 'pending']),
      source: z.enum(['manual', 'wathq']).optional(),
      // الحدّ يفرضه requireReason برسالته العربية، فلا يسبقه هنا حدّ برسالة أخرى.
      reason: z.string().optional(),
      approve_category_ids: z.array(z.string().uuid()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw badRequest('حالة التوثيق غير صحيحة.');

    // الرفض والإيقاف يسلبان — فيشترطان السبب. والتوثيق يمنح فلا يشترطه.
    const reason =
      parsed.data.status === 'rejected'
        ? requireReason(parsed.data.reason, 'الرفض يحتاج سبباً مكتوباً.')
        : parsed.data.status === 'suspended'
          ? requireReason(parsed.data.reason, 'الإيقاف يحتاج سبباً مكتوباً.')
          : null;

    const supplier = await db('suppliers').where({ id: req.params.id }).first();
    if (!supplier) throw notFound('المورد غير موجود.');

    const updated = await db.transaction(async (trx) => {
      const [row] = await trx('suppliers')
        .where({ id: supplier.id })
        .update({
          verification_status: parsed.data.status,
          verification_source: parsed.data.source || 'manual',
          verified_at: parsed.data.status === 'verified' ? trx.fn.now() : null,
          rejection_reason: parsed.data.status === 'rejected' ? reason : null,
          updated_at: trx.fn.now()
        })
        .returning('*');

      if (parsed.data.status === 'verified') {
        await trx('users')
          .where({ supplier_id: supplier.id, status: 'pending' })
          .update({ status: 'active', updated_at: trx.fn.now() });

        const approveQuery = trx('supplier_categories').where({ supplier_id: supplier.id });
        if (parsed.data.approve_category_ids && parsed.data.approve_category_ids.length) {
          await approveQuery.whereIn('category_id', parsed.data.approve_category_ids).update({ approved: true, updated_at: trx.fn.now() });
        } else {
          await approveQuery.update({ approved: true, updated_at: trx.fn.now() });
        }
      }

      if (parsed.data.status === 'suspended' || parsed.data.status === 'rejected') {
        await trx('users').where({ supplier_id: supplier.id }).update({ status: 'suspended', updated_at: trx.fn.now() });
        await trx('offers')
          .where({ supplier_id: supplier.id, status: 'submitted' })
          .update({ status: 'withdrawn', updated_at: trx.fn.now() });
      }

      await audit.record(trx, {
        actor: req.user,
        entityType: 'supplier',
        entityId: supplier.id,
        action: `supplier.${parsed.data.status}`,
        payload: { from: supplier.verification_status, to: parsed.data.status, reason },
        ip: req.ip
      });

      return row;
    });

    return res.json({ supplier: updated });
  } catch (err) {
    return next(err);
  }
});

/**
 * قائمة الموردين.
 * الشركات لا ترى إلا الموثّقين — المورد غير الموثّق غير موجود بالنسبة لها.
 */
router.get('/', async (req, res, next) => {
  try {
    const isPlatform = req.user.role === 'platform_admin';
    if (!isPlatform && !req.user.companyId) throw forbidden();

    const query = db('suppliers')
      .select('id', 'name', 'cr_number', 'city', 'verification_status', 'rating', 'rating_count');
    if (!isPlatform) query.where({ verification_status: 'verified' });
    if (req.query.status && isPlatform) query.where({ verification_status: String(req.query.status) });

    const suppliers = await query.orderBy('name', 'asc');
    return res.json({ suppliers });
  } catch (err) {
    return next(err);
  }
});

/**
 * فئات مورد بعينه كما سجّلها هو — لا كل فئات المنصة.
 * من يوثّق المورد يقرر اعتماد فئاته، والاعتماد لا يتجاوز ما سجّله،
 * فلا يُعرض عليه ما لا أثر لاختياره فيه.
 * ولا تُقيَّد هذه القراءة في سجل تدقيق: لا تخص شركة، فلا سجل نكتب فيه — كقاعدة GET /api/suppliers.
 */
router.get('/:id/categories', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const supplier = await db('suppliers').select('id').where({ id: req.params.id }).first();
    if (!supplier) throw notFound('المورد غير موجود.');

    const categories = await db('supplier_categories')
      .join('categories', 'categories.id', 'supplier_categories.category_id')
      .where('supplier_categories.supplier_id', supplier.id)
      .select('categories.id', 'categories.slug', 'categories.name_ar', 'categories.name_en', 'supplier_categories.approved')
      .orderBy('categories.name_ar', 'asc');

    return res.json({ categories });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
