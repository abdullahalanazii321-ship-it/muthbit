'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db/knex');
const env = require('../config/env');
const audit = require('../utils/audit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireReason } = require('../utils/reason');
const { passwordSchema, passwordErrorMessage } = require('../utils/password');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');

const router = express.Router();

// الرسالتان منسوختان حرفياً في نموذج التسجيل (RegisterPage.jsx)، فلا يرى المورد صيغتين للقاعدة نفسها.
const SUGGESTED_CATEGORY_LENGTH = 'الفئة المقترحة من 2 إلى 100 محرف.';
const NO_CATEGORY = 'اختر فئة واحدة على الأقل، أو اكتب فئتك إن لم تجدها.';

const registerSchema = z.object({
  supplier: z.object({
    name: z.string().min(2).max(200),
    cr_number: z.string().regex(/^\d{10}$/, 'السجل التجاري يجب أن يكون 10 أرقام.'),
    vat_number: z.string().max(20).optional(),
    city: z.string().max(80).optional(),
    // بلا حدّ أدنى هنا: الشرط «فئة أو اقتراح» يُفحص بعد التحقق، لأنه يجمع حقلين.
    category_slugs: z.array(z.string()).default([]),
    // اقتراح لا فئة: يُخزَّن نصاً في suppliers ولا يُنشأ منه صف في categories ولا في supplier_categories.
    // التشذيب قبل الحدّ، فما كان مسافات فقط يصير فارغاً ويُرفض.
    suggested_category: z
      .string()
      .trim()
      .min(2, SUGGESTED_CATEGORY_LENGTH)
      .max(100, SUGGESTED_CATEGORY_LENGTH)
      .optional()
  }),
  admin: z.object({
    full_name: z.string().min(2).max(160),
    email: z.string().email(),
    phone: z.string().max(30).optional(),
    password: passwordSchema
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
    if (!parsed.success) {
      const message = passwordErrorMessage(parsed.error) || 'بيانات تسجيل المورد غير مكتملة.';
      throw badRequest(message, parsed.error.flatten());
    }
    const { supplier, admin } = parsed.data;
    const suggestedCategory = supplier.suggested_category || null;
    // المورد الذي لا يجد فئته يكتبها، فلا يُغلق التسجيل في وجهه. ويجوز الجمع بين الاثنين.
    if (supplier.category_slugs.length === 0 && !suggestedCategory) throw badRequest(NO_CATEGORY);

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
          suggested_category: suggestedCategory,
          verification_status: 'pending'
        })
        .returning('*');

      // الربط بالفئات المختارة من القائمة وحدها — والاقتراح لا يُربط به شيء.
      // ومورد لم يختر إلا «أخرى» لا صف له هنا حتى يقرّر مسؤول المنصة.
      if (categories.length) {
        await trx('supplier_categories').insert(
          categories.map((c) => ({ supplier_id: createdSupplier.id, category_id: c.id, approved: false }))
        );
      }

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
        payload: {
          cr_number: supplier.cr_number,
          categories: supplier.category_slugs,
          suggested_category: suggestedCategory
        },
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

    // الفئات المختارة عند التوثيق قد تكون خارج ما سجّله المورد: فئة أضافها مسؤول المنصة من اقتراحه.
    // تُفحص كلها قبل المعاملة، فلا يُربط المورد بفئة لا وجود لها.
    const approveIds = [...new Set(parsed.data.approve_category_ids || [])];
    let addedCategoryIds = [];
    if (parsed.data.status === 'verified' && approveIds.length) {
      const known = await db('categories').whereIn('id', approveIds).pluck('id');
      if (known.length !== approveIds.length) throw badRequest('توجد فئة غير معروفة ضمن الفئات المختارة.');
      const linked = await db('supplier_categories')
        .where({ supplier_id: supplier.id })
        .whereIn('category_id', approveIds)
        .pluck('category_id');
      addedCategoryIds = approveIds.filter((id) => !linked.includes(id));
    }

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

        if (approveIds.length) {
          // المسجَّلة تُعتمد، وغير المسجَّلة تُنشأ معتمدة — وهذا وحده ما يربط المورد بفئة أُضيفت من اقتراحه.
          // وما سجّله ولم يُختر يبقى غير معتمد كما كان.
          await trx('supplier_categories')
            .insert(approveIds.map((categoryId) => ({ supplier_id: supplier.id, category_id: categoryId, approved: true })))
            .onConflict(['supplier_id', 'category_id'])
            .merge({ approved: true, updated_at: trx.fn.now() });
        } else {
          await trx('supplier_categories')
            .where({ supplier_id: supplier.id })
            .update({ approved: true, updated_at: trx.fn.now() });
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
        payload: {
          from: supplier.verification_status,
          to: parsed.data.status,
          reason,
          // الفئات التي لم يسجّلها المورد وربطه بها التوثيق — تُقيَّد لأنها قرار المسؤول لا اختيار المورد.
          ...(addedCategoryIds.length ? { added_category_ids: addedCategoryIds } : {})
        },
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
 *
 * ومعها suggested_category: ما كتبه المورد حين لم يجد فئته. نص يُقرأ عند قرار التوثيق،
 * لا فئة تُعتمد — فلا يدخل في categories أعلاه. وهذا المسار للمنصة وحدها، فلا تراه شركة.
 */
router.get('/:id/categories', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const supplier = await db('suppliers').select('id', 'suggested_category').where({ id: req.params.id }).first();
    if (!supplier) throw notFound('المورد غير موجود.');

    const categories = await db('supplier_categories')
      .join('categories', 'categories.id', 'supplier_categories.category_id')
      .where('supplier_categories.supplier_id', supplier.id)
      .select('categories.id', 'categories.slug', 'categories.name_ar', 'categories.name_en', 'supplier_categories.approved')
      .orderBy('categories.name_ar', 'asc');

    return res.json({ categories, suggested_category: supplier.suggested_category });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
