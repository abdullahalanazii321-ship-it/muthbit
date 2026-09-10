'use strict';

/**
 * المخطط الأساسي لمنصة مثبت.
 *
 * المبدأ الحاكم: لا يوجد صف يخص جهة إلا وهو مرتبط صراحةً بها.
 * كل جدول يخص الشركة يحمل company_id، وكل جدول يخص المورد يحمل supplier_id،
 * وطبقة العزل في التطبيق تشترط وجود هذا القيد قبل أي استعلام.
 */

const ROLES = [
  'platform_admin',    // فريق المنصة
  'company_owner',     // مالك الشركة
  'finance_manager',   // المدير المالي
  'procurement_manager', // مدير المشتريات
  'procurement_buyer', // موظف المشتريات
  'ai_agent',          // وكيل ذكي يشتري بالواجهة البرمجية
  'supplier_admin'     // مسؤول لدى المورد
];

const COMPANY_STATUS = ['pending', 'active', 'suspended'];
const USER_STATUS = ['pending', 'active', 'suspended'];
const SUPPLIER_STATUS = ['pending', 'verified', 'rejected', 'suspended'];
const REQUEST_STATUS = [
  'draft',            // مسوّدة
  'sourcing',         // بانتظار العروض
  'pending_approval', // بانتظار الاعتماد
  'approved',         // معتمد
  'rejected',         // مرفوض
  'ordered',          // صدر أمر الشراء
  'delivered',        // سُلّم
  'closed',           // مقفل
  'cancelled'         // ملغى
];
const OFFER_STATUS = ['submitted', 'withdrawn', 'selected', 'rejected'];
const PO_STATUS = ['issued', 'acknowledged', 'delivered', 'disputed', 'cancelled'];

exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  // ---------- الشركات ----------
  await knex.schema.createTable('companies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 200).notNullable();
    t.string('cr_number', 20).notNullable().unique();       // السجل التجاري
    t.string('vat_number', 20);                              // الرقم الضريبي
    t.string('city', 80);
    t.enu('status', COMPANY_STATUS, { useNative: false }).notNullable().defaultTo('pending');
    t.string('verification_source', 40);                     // manual | wathq
    t.timestamp('verified_at');
    t.timestamps(true, true);
    t.index(['status']);
  });

  // ---------- الموردون والوكلاء التجاريون ----------
  await knex.schema.createTable('suppliers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 200).notNullable();
    t.string('cr_number', 20).notNullable().unique();
    t.string('vat_number', 20);
    t.string('city', 80);
    t.enu('verification_status', SUPPLIER_STATUS, { useNative: false }).notNullable().defaultTo('pending');
    t.string('verification_source', 40);                     // manual | wathq
    t.timestamp('verified_at');
    t.text('rejection_reason');
    t.decimal('rating', 3, 2);                               // 0.00 - 5.00
    t.integer('rating_count').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['verification_status']);
  });

  // ---------- الفئات ----------
  await knex.schema.createTable('categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('slug', 60).notNullable().unique();
    t.string('name_ar', 120).notNullable();
    t.string('name_en', 120).notNullable();
    t.timestamps(true, true);
  });

  // الفئات المسموح للمورد بالعرض فيها — مورد بلا فئة معتمدة لا يظهر له طلب
  await knex.schema.createTable('supplier_categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('supplier_id').notNullable().references('id').inTable('suppliers').onDelete('CASCADE');
    t.uuid('category_id').notNullable().references('id').inTable('categories').onDelete('CASCADE');
    t.boolean('approved').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.unique(['supplier_id', 'category_id']);
  });

  // ---------- المستخدمون ----------
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 190).notNullable().unique();
    t.string('password_hash', 120);                          // فارغ للوكيل الذكي — يدخل بمفتاح لا بكلمة مرور
    t.string('full_name', 160).notNullable();
    t.string('phone', 30);
    t.enu('role', ROLES, { useNative: false }).notNullable();
    t.enu('status', USER_STATUS, { useNative: false }).notNullable().defaultTo('pending');
    t.uuid('company_id').references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('supplier_id').references('id').inTable('suppliers').onDelete('CASCADE');
    t.timestamp('last_login_at');
    t.timestamps(true, true);
    t.index(['company_id']);
    t.index(['supplier_id']);
  });

  // المستخدم إما تابع لشركة أو لمورد أو لفريق المنصة — لا يجمع بينهما أبداً
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_scope_exclusive CHECK (
      (role = 'platform_admin' AND company_id IS NULL AND supplier_id IS NULL)
      OR (role = 'supplier_admin' AND supplier_id IS NOT NULL AND company_id IS NULL)
      OR (role IN ('company_owner','finance_manager','procurement_manager','procurement_buyer','ai_agent')
          AND company_id IS NOT NULL AND supplier_id IS NULL)
    )
  `);

  // ---------- سقوف الإنفاق والصلاحيات ----------
  await knex.schema.createTable('buyer_limits', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.decimal('per_request_ceiling', 14, 2).notNullable().defaultTo(0);
    t.decimal('monthly_ceiling', 14, 2);                     // اختياري
    t.specificType('allowed_category_ids', 'uuid[]');        // فارغ = كل الفئات
    t.uuid('approver_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.boolean('active').notNullable().defaultTo(true);
    t.uuid('set_by_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.unique(['user_id']);
    t.index(['company_id']);
  });

  await knex.raw('ALTER TABLE buyer_limits ADD CONSTRAINT buyer_limits_ceiling_positive CHECK (per_request_ceiling >= 0)');

  // ---------- الوكلاء الأذكياء ----------
  await knex.schema.createTable('agents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE'); // هوية الوكيل كمستخدم بدور ai_agent
    t.string('name', 120).notNullable();
    t.string('api_key_hash', 120).notNullable();
    t.string('api_key_prefix', 12).notNullable();            // للعرض في الواجهة فقط
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('revoked_at');
    t.uuid('created_by_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['company_id']);
    t.index(['api_key_prefix']);
  });

  // ---------- طلبات الشراء ----------
  await knex.schema.createTable('requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('reference', 30).notNullable().unique();        // PO-2026-0413
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('created_by_user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('category_id').references('id').inTable('categories').onDelete('SET NULL');
    t.string('item', 300).notNullable();
    t.integer('quantity').notNullable().defaultTo(1);
    t.text('specs');
    t.date('needed_by');
    t.decimal('amount', 14, 2);                              // قيمة العرض المختار
    t.uuid('selected_offer_id');                             // مفتاح خارجي يُضاف بعد إنشاء جدول العروض
    t.enu('status', REQUEST_STATUS, { useNative: false }).notNullable().defaultTo('draft');
    t.boolean('requires_approval').notNullable().defaultTo(false);
    t.boolean('over_ceiling').notNullable().defaultTo(false);
    t.uuid('approver_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.jsonb('policy_snapshot');                              // نتيجة تقييم السياسة لحظة الإنشاء
    t.timestamps(true, true);
    t.index(['company_id', 'status']);
    t.index(['created_by_user_id']);
  });

  await knex.raw('ALTER TABLE requests ADD CONSTRAINT requests_quantity_positive CHECK (quantity > 0)');

  // ---------- العروض ----------
  await knex.schema.createTable('offers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('request_id').notNullable().references('id').inTable('requests').onDelete('CASCADE');
    t.uuid('supplier_id').notNullable().references('id').inTable('suppliers').onDelete('CASCADE');
    t.uuid('submitted_by_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.decimal('price', 14, 2).notNullable();
    t.integer('warranty_months').notNullable().defaultTo(0);
    t.integer('lead_days').notNullable().defaultTo(0);
    t.text('specs');
    t.enu('status', OFFER_STATUS, { useNative: false }).notNullable().defaultTo('submitted');
    t.timestamps(true, true);
    t.unique(['request_id', 'supplier_id']);                 // عرض واحد لكل مورد لكل طلب
    t.index(['supplier_id']);
  });

  await knex.raw(`
    ALTER TABLE offers ADD CONSTRAINT offers_price_positive CHECK (price > 0);
    ALTER TABLE offers ADD CONSTRAINT offers_warranty_nonneg CHECK (warranty_months >= 0);
    ALTER TABLE offers ADD CONSTRAINT offers_lead_nonneg CHECK (lead_days >= 0);
  `);

  await knex.raw(`
    ALTER TABLE requests
      ADD CONSTRAINT requests_selected_offer_fk
      FOREIGN KEY (selected_offer_id) REFERENCES offers(id) ON DELETE SET NULL
  `);

  // ---------- الاعتمادات ----------
  await knex.schema.createTable('approvals', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('request_id').notNullable().references('id').inTable('requests').onDelete('CASCADE');
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('approver_user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.integer('level').notNullable().defaultTo(1);
    t.enu('decision', ['approved', 'rejected'], { useNative: false }).notNullable();
    t.text('reason');
    t.decimal('amount_at_decision', 14, 2);
    t.timestamp('decided_at').notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.index(['request_id']);
  });

  // ---------- أوامر الشراء ----------
  await knex.schema.createTable('purchase_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('po_number', 30).notNullable().unique();
    t.uuid('request_id').notNullable().references('id').inTable('requests').onDelete('RESTRICT');
    t.uuid('offer_id').notNullable().references('id').inTable('offers').onDelete('RESTRICT');
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('RESTRICT');
    t.uuid('supplier_id').notNullable().references('id').inTable('suppliers').onDelete('RESTRICT');
    t.decimal('amount', 14, 2).notNullable();
    t.integer('warranty_months').notNullable().defaultTo(0);
    t.integer('lead_days').notNullable().defaultTo(0);
    t.enu('status', PO_STATUS, { useNative: false }).notNullable().defaultTo('issued');
    t.timestamp('issued_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('delivered_at');
    t.timestamps(true, true);
    t.unique(['request_id']);                                // أمر شراء واحد لكل طلب
    t.index(['company_id']);
    t.index(['supplier_id']);
  });

  // ---------- سجل التدقيق ----------
  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id').primary();
    t.uuid('actor_user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('actor_role', 40);
    t.uuid('company_id');
    t.uuid('supplier_id');
    t.string('entity_type', 40).notNullable();
    t.string('entity_id', 60);
    t.string('action', 60).notNullable();
    t.jsonb('payload');
    t.string('ip', 60);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['entity_type', 'entity_id']);
    t.index(['company_id']);
    t.index(['created_at']);
  });

  // السجل للقراءة فقط: أي تعديل أو حذف يُرفض على مستوى قاعدة البيانات، لا التطبيق وحده.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`
    CREATE TRIGGER audit_log_no_update_delete
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS audit_log_no_update_delete ON audit_log');
  await knex.raw('DROP FUNCTION IF EXISTS audit_log_is_append_only()');
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('purchase_orders');
  await knex.schema.dropTableIfExists('approvals');
  await knex.raw('ALTER TABLE IF EXISTS requests DROP CONSTRAINT IF EXISTS requests_selected_offer_fk');
  await knex.schema.dropTableIfExists('offers');
  await knex.schema.dropTableIfExists('requests');
  await knex.schema.dropTableIfExists('agents');
  await knex.schema.dropTableIfExists('buyer_limits');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('supplier_categories');
  await knex.schema.dropTableIfExists('categories');
  await knex.schema.dropTableIfExists('suppliers');
  await knex.schema.dropTableIfExists('companies');
};
