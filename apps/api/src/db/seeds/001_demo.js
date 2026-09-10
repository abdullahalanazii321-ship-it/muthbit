'use strict';
const bcrypt = require('bcryptjs');

/**
 * بيانات تجريبية للتطوير والعرض.
 * كل الحسابات بكلمة مرور واحدة: Test@1234
 * النمط: admin@[الدور]-demo.sa
 *
 * الشركتان مختلفتان عمداً حتى يمكن إثبات العزل: لا ترى إحداهما طلبات الأخرى.
 */

const PASSWORD = 'Test@1234';

const CATEGORIES = [
  { slug: 'it', name_ar: 'تقنية المعلومات', name_en: 'Information technology' },
  { slug: 'office', name_ar: 'تجهيزات مكتبية', name_en: 'Office supplies' },
  { slug: 'electrical', name_ar: 'معدات كهربائية', name_en: 'Electrical equipment' },
  { slug: 'medical', name_ar: 'مستلزمات طبية', name_en: 'Medical supplies' },
  { slug: 'safety', name_ar: 'أدوات السلامة', name_en: 'Safety equipment' },
  { slug: 'maintenance', name_ar: 'الصيانة والتشغيل', name_en: 'Maintenance and operations' }
];

exports.seed = async function seed(knex) {
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
    status: 'active'
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
    'حسابات تجريبية (كلمة المرور للجميع: Test@1234)',
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
