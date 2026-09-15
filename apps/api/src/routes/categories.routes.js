'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const audit = require('../utils/audit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { badRequest, notFound, conflict } = require('../utils/errors');

const router = express.Router();

/**
 * قائمة الفئات — عامة بلا مصادقة، وهي وحدها في هذا الملف.
 * صفحة التسجيل يفتحها زائر بلا رمز، وتسجيل المورد يشترط category_slugs من هذه القائمة.
 * بيانات مرجعية لا تخص شركة ولا مورداً، فلا يكشف فتحها شيئاً.
 * الحد العام apiLimiter يغطيها من app.js (مركّب على /api كله) فلا يُكرَّر هنا.
 */
router.get('/', async (req, res, next) => {
  try {
    const categories = await db('categories').select('id', 'slug', 'name_ar', 'name_en').orderBy('name_ar', 'asc');
    return res.json({ categories });
  } catch (err) {
    return next(err);
  }
});

// كل مسار يُضاف تحت هذا السطر خلف المصادقة — العام هو القائمة أعلاه وحدها.
router.use(requireAuth);

const NAME_AR_LENGTH = 'الاسم العربي من 2 إلى 120 محرف.';
const NAME_EN_LENGTH = 'الاسم الإنجليزي من 2 إلى 120 محرف.';
// منسوخة حرفياً في لوحة المنصة (PlatformPage.jsx)، فتظهر تحت الحقل قبل الإرسال بالنص نفسه.
const NO_LATIN = 'الاسم الإنجليزي يجب أن يحتوي حروفاً لاتينية.';
const CATEGORY_EXISTS = 'هذه الفئة موجودة مسبقاً.';
const NAME_AR_EXISTS = 'توجد فئة بهذا الاسم العربي مسبقاً.';
const NOT_FOUND = 'الفئة غير موجودة.';
const INCOMPLETE = 'بيانات الفئة غير مكتملة.';
// طول عمود slug في الجدول.
const SLUG_MAX = 60;

// الاسمان وحدهما. لا slug في المخطط: ما لا يعرفه zod يسقط من الجسم، فلا يصل المعرّف من العميل أبداً.
const namesSchema = z.object({
  name_ar: z.string().trim().min(2, NAME_AR_LENGTH).max(120, NAME_AR_LENGTH),
  name_en: z.string().trim().min(2, NAME_EN_LENGTH).max(120, NAME_EN_LENGTH)
});
const idSchema = z.string().uuid();

/**
 * المعرّف من الاسم الإنجليزي: حروف صغيرة، والمسافات شرطات، ولا يبقى إلا a-z و 0-9 والشرطة،
 * والشرطات المتكررة تُطوى. ثم تُحذف الشرطة من الطرفين، ويُقصّ إلى طول العمود.
 * نسخته في PlatformPage.jsx تعرضه للمسؤول وهو يكتب — أي تغيير هنا يُنسخ هناك.
 */
function slugFromNameEn(nameEn) {
  return nameEn
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

/**
 * الاسم العربي بعد التشذيب محجوز لفئة واحدة. التكرار العربي أخطر من تكرار المعرّف:
 * فئتان مختلفتان بالمعرّف متطابقتان بالاسم تشتّتان الموردين على فئتين تبدوان واحدة.
 */
async function nameArTaken(nameAr, exceptId = null) {
  const query = db('categories').whereRaw('btrim(name_ar) = ?', [nameAr]);
  if (exceptId) query.whereNot('id', exceptId);
  return Boolean(await query.first('id'));
}

/**
 * الفئات كما يراها مسؤول المنصة، ومع كل منها عدد الموردين المعتمدين فيها.
 * يُعدّ المورد إن كان ارتباطه بالفئة معتمداً وهو موثّق اليوم — أي من يرى طلباتها فعلاً.
 * منفصل عن القائمة العامة أعلاه: العدد معلومة عن السوق لا تُكشف لزائر ولا لشركة ولا لمورد.
 */
router.get('/overview', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const approvedSuppliers = db('supplier_categories')
      .join('suppliers', 'suppliers.id', 'supplier_categories.supplier_id')
      .whereRaw('supplier_categories.category_id = categories.id')
      .where('supplier_categories.approved', true)
      .where('suppliers.verification_status', 'verified')
      .select(db.raw('count(*)::int'));

    const categories = await db('categories')
      .select(
        'categories.id',
        'categories.slug',
        'categories.name_ar',
        'categories.name_en',
        approvedSuppliers.as('approved_suppliers_count')
      )
      .orderBy('categories.name_ar', 'asc');

    return res.json({ categories });
  } catch (err) {
    return next(err);
  }
});

/**
 * فئة جديدة — لمسؤول المنصة وحده. الفئات مرجع المطابقة بين الطلبات والموردين،
 * فلا تُنشأ من اقتراح مورد مباشرة: المسؤول يقرأ الاقتراح ويقرّر، وهذا المسار قراره.
 * والحدث يُقيَّد بلا company_id: مسؤول المنصة لا شركة له، فلا تراه شركة.
 */
router.post('/', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const parsed = namesSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(INCOMPLETE, parsed.error.flatten());
    const { name_ar: nameAr, name_en: nameEn } = parsed.data;

    const slug = slugFromNameEn(nameEn);
    if (!slug) throw badRequest(NO_LATIN);
    if (await db('categories').where({ slug }).first('id')) throw conflict(CATEGORY_EXISTS);
    if (await nameArTaken(nameAr)) throw conflict(NAME_AR_EXISTS);

    const category = await db.transaction(async (trx) => {
      const [row] = await trx('categories')
        .insert({ slug, name_ar: nameAr, name_en: nameEn })
        .returning(['id', 'slug', 'name_ar', 'name_en']);

      await audit.record(trx, {
        actor: req.user,
        entityType: 'category',
        entityId: row.id,
        action: 'category.created',
        payload: { slug: row.slug, name_ar: row.name_ar, name_en: row.name_en },
        ip: req.ip
      });

      return row;
    });

    return res.status(201).json({ category });
  } catch (err) {
    // طلبان متزامنان بالمعرّف نفسه: القيد الفريد يمنع الثاني، وبرسالة المكرر نفسها لا الرسالة العامة.
    if (err && err.code === '23505') return next(conflict(CATEGORY_EXISTS));
    return next(err);
  }
});

/**
 * إعادة تسمية فئة — لمسؤول المنصة وحده. الاسمان وحدهما يتغيّران.
 *
 * المعرّف (slug) لا يتغيّر أبداً، لا هنا ولا في أي مسار: هو الرابط الثابت بين الموردين والطلبات،
 * يرسله تسجيل المورد في category_slugs ويُبنى عليه ما هو قائم. تغييره يكسر ذلك كله بسكوت.
 * لذلك لا يعرفه المخطط أعلاه، ولو أُرسل في الجسم سقط، ولا يُكتب في update أدناه.
 */
router.patch('/:id', requireRole('platform_admin'), async (req, res, next) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) throw notFound(NOT_FOUND);
    const parsed = namesSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(INCOMPLETE, parsed.error.flatten());
    const { name_ar: nameAr, name_en: nameEn } = parsed.data;

    const current = await db('categories').where({ id: req.params.id }).first();
    if (!current) throw notFound(NOT_FOUND);
    if (await nameArTaken(nameAr, current.id)) throw conflict(NAME_AR_EXISTS);

    const category = await db.transaction(async (trx) => {
      const [row] = await trx('categories')
        .where({ id: current.id })
        .update({ name_ar: nameAr, name_en: nameEn, updated_at: trx.fn.now() })
        .returning(['id', 'slug', 'name_ar', 'name_en']);

      await audit.record(trx, {
        actor: req.user,
        entityType: 'category',
        entityId: current.id,
        action: 'category.renamed',
        payload: {
          slug: current.slug,
          before: { name_ar: current.name_ar, name_en: current.name_en },
          after: { name_ar: row.name_ar, name_en: row.name_en }
        },
        ip: req.ip
      });

      return row;
    });

    return res.json({ category });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
