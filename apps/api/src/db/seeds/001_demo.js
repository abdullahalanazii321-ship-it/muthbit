'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { passwordMessage } = require('../../utils/password');
const { assertLocalDatabase } = require('../assertLocalDatabase');

/**
 * بيانات تجريبية للتطوير والعرض.
 * النمط: admin@[الدور]-demo.sa
 *
 * الشركتان مختلفتان عمداً حتى يمكن إثبات العزل: لا ترى إحداهما طلبات الأخرى.
 *
 * كلمة المرور لم تعد مكتوبة هنا. كانت ثابتةً في هذا الملف وفي README.md
 * و CLAUDE.md، فصارت معروفةً لكل من يقرأ المستودع — وقد وُجدت هذه الحسابات
 * حيّة في قاعدة الإنتاج بها، وعُطّلت في ٢٠٢٦-١٠-٠٣. فمصدرها الآن أحد اثنين:
 *   · SEED_PASSWORD من البيئة إن ضُبط،
 *   · وإلا كلمة عشوائية تُولَّد عند كل تشغيل وتُطبع في آخره مرة واحدة.
 * وفي الحالين لا تدخل أي كلمة مرور إلى git.
 */

// ٢٤ محرفاً من أربع مجموعات، بلا " ' ` \ | / < > لأنها تتعثّر في الصدفة واللصق.
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '!@#$%^&*()-_=+[]{};:,.?';
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

const pick = (set) => set[crypto.randomInt(set.length)];

/** كلمة عشوائية تحقّق سياسة الخادم — تُقاس بـ passwordMessage نفسها لا بنسخة منها. */
function generatePassword() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
    while (chars.length < 24) chars.push(pick(ALL));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join('');
    if (passwordMessage(candidate) === null) return candidate;
  }
  throw new Error('تعذّر توليد كلمة مرور تحقّق السياسة');
}

// كلمة من البيئة تُقبل كما هي بشرط أن تحقّق السياسة — وإلا فالتوقّف خير من بذرة لا تُدخَل.
const fromEnv = process.env.SEED_PASSWORD;
if (fromEnv) {
  const gap = passwordMessage(fromEnv);
  if (gap) throw new Error(`SEED_PASSWORD لا تحقّق السياسة: ${gap}`);
}
const PASSWORD = fromEnv || generatePassword();
const GENERATED = !fromEnv;

const CATEGORIES = [
  { slug: 'it', name_ar: 'تقنية المعلومات', name_en: 'Information technology' },
  { slug: 'office', name_ar: 'تجهيزات مكتبية', name_en: 'Office supplies' },
  { slug: 'electrical', name_ar: 'معدات كهربائية', name_en: 'Electrical equipment' },
  { slug: 'medical', name_ar: 'مستلزمات طبية', name_en: 'Medical supplies' },
  { slug: 'safety', name_ar: 'أدوات السلامة', name_en: 'Safety equipment' },
  { slug: 'maintenance', name_ar: 'الصيانة والتشغيل', name_en: 'Maintenance and operations' }
];

exports.seed = async function seed(knex) {
  // أول سطر، قبل أي حذف: لا بذر إلا على قاعدة على هذا الجهاز.
  assertLocalDatabase('البذور');

  await knex('audit_log').del();
  await knex('purchase_orders').del();
  await knex('approvals').del();
  await knex('offers').del();
  await knex('requests').del();
  await knex('agents').del();
  await knex('buyer_limits').del();
  await knex('users').del();
  await knex('supplier_categories').del();
  await knex('suppliers').del();
  await knex('categories').del();
  await knex('companies').del();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const categories = await knex('categories').insert(CATEGORIES).returning('*');
  const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  // ---------- فريق المنصة ----------
  await knex('users').insert({
    email: 'admin@platform-demo.sa',
    password_hash: hash,
    full_name: 'مسؤول منصة مثبت',
    role: 'platform_admin',
    status: 'active',
    // مالك المنصة كما في الإنتاج (هجرة platform_owner_access_log): قاعدة التطوير بشكل الإنتاج لا بحيلة في الفحوص.
    // إدراج لا تعديل — مشغّل العلم يحرس تغييره بعد الإنشاء، والفهرس الفريد يمنع مالكاً ثانياً.
    is_platform_owner: true
  });

  // ---------- الشركة الأولى ----------
  const [alufuq] = await knex('companies')
    .insert({
      name: 'شركة الأفق للمقاولات',
      cr_number: '1010574823',
      city: 'الرياض',
      status: 'active',
      verification_source: 'manual',
      verified_at: knex.fn.now()
    })
    .returning('*');

  const [owner1] = await knex('users').insert({
    email: 'admin@owner-demo.sa', password_hash: hash, full_name: 'عبدالعزيز الحربي',
    role: 'company_owner', status: 'active', company_id: alufuq.id
  }).returning('*');

  const [finance1] = await knex('users').insert({
    email: 'admin@finance-demo.sa', password_hash: hash, full_name: 'سارة القحطاني',
    role: 'finance_manager', status: 'active', company_id: alufuq.id
  }).returning('*');

  const [buyer1] = await knex('users').insert({
    email: 'admin@buyer-demo.sa', password_hash: hash, full_name: 'فهد المطيري',
    role: 'procurement_buyer', status: 'active', company_id: alufuq.id
  }).returning('*');

  await knex('buyer_limits').insert({
    company_id: alufuq.id,
    user_id: buyer1.id,
    per_request_ceiling: 80000,
    monthly_ceiling: 400000,
    allowed_category_ids: null, // كل الفئات
    approver_user_id: finance1.id,
    active: true,
    set_by_user_id: owner1.id
  });

  // ---------- الشركة الثانية (لإثبات العزل) ----------
  const [najd] = await knex('companies')
    .insert({
      name: 'مجموعة نجد الطبية',
      cr_number: '4030918276',
      city: 'جدة',
      status: 'active',
      verification_source: 'manual',
      verified_at: knex.fn.now()
    })
    .returning('*');

  const [owner2] = await knex('users').insert({
    email: 'admin@owner2-demo.sa', password_hash: hash, full_name: 'منيرة العتيبي',
    role: 'company_owner', status: 'active', company_id: najd.id
  }).returning('*');

  const [buyer2] = await knex('users').insert({
    email: 'admin@buyer2-demo.sa', password_hash: hash, full_name: 'نورة الشمري',
    role: 'procurement_buyer', status: 'active', company_id: najd.id
  }).returning('*');

  await knex('buyer_limits').insert({
    company_id: najd.id,
    user_id: buyer2.id,
    per_request_ceiling: 250000,
    monthly_ceiling: null,
    allowed_category_ids: [bySlug.medical.id, bySlug.it.id],
    approver_user_id: owner2.id,
    active: true,
    set_by_user_id: owner2.id
  });

  // ---------- مورد موثّق ----------
  const [albayan] = await knex('suppliers')
    .insert({
      name: 'مؤسسة البيان للتجهيزات',
      cr_number: '1010448902',
      city: 'الرياض',
      verification_status: 'verified',
      verification_source: 'manual',
      verified_at: knex.fn.now(),
      rating: 4.7,
      rating_count: 23
    })
    .returning('*');

  await knex('supplier_categories').insert([
    { supplier_id: albayan.id, category_id: bySlug.it.id, approved: true },
    { supplier_id: albayan.id, category_id: bySlug.office.id, approved: true },
    { supplier_id: albayan.id, category_id: bySlug.safety.id, approved: true }
  ]);

  await knex('users').insert({
    email: 'admin@supplier-demo.sa', password_hash: hash, full_name: 'خالد الدوسري',
    role: 'supplier_admin', status: 'active', supplier_id: albayan.id
  });

  // ---------- مورد قيد التوثيق ----------
  const [sanad] = await knex('suppliers')
    .insert({
      name: 'وكالة سند الطبية',
      cr_number: '4030772165',
      city: 'جدة',
      verification_status: 'pending'
    })
    .returning('*');

  await knex('supplier_categories').insert({ supplier_id: sanad.id, category_id: bySlug.medical.id, approved: false });

  await knex('users').insert({
    email: 'admin@supplier2-demo.sa', password_hash: hash, full_name: 'ريم الزهراني',
    role: 'supplier_admin', status: 'pending', supplier_id: sanad.id
  });

  // eslint-disable-next-line no-console
  console.log([
    '',
    GENERATED
      ? `حسابات تجريبية — كلمة المرور للجميع (وُلّدت الآن، تُطبع مرة واحدة):\n  ${PASSWORD}\n`
      : 'حسابات تجريبية — كلمة المرور للجميع: قيمة SEED_PASSWORD التي ضبطتها.',
    '  admin@platform-demo.sa    مسؤول المنصة',
    '  admin@owner-demo.sa       مالك — شركة الأفق للمقاولات',
    '  admin@finance-demo.sa     مدير مالي — الأفق (المعتمِد)',
    `  admin@buyer-demo.sa       موظف مشتريات — الأفق (سقف ${(80000).toLocaleString('en-US')} ر.س)`,
    '  admin@owner2-demo.sa      مالك — مجموعة نجد الطبية',
    `  admin@buyer2-demo.sa      موظف مشتريات — نجد (سقف ${(250000).toLocaleString('en-US')} ر.س، فئتان فقط)`,
    '  admin@supplier-demo.sa    مورد موثّق — مؤسسة البيان',
    '  admin@supplier2-demo.sa   مورد قيد التوثيق — وكالة سند',
    ''
  ].join('\n'));
};
