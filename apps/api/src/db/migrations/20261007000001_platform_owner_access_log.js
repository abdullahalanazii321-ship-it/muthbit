'use strict';

/**
 * مالك المنصة وسجل الوصول الداخلي.
 *
 * ١) users.is_platform_owner — مستوى واحد فوق مسؤول المنصة لا دور جديد: المالك يبقى platform_admin بكل ما له،
 *    ويضيف إليه قراءة سجل الوصول ومنحها، وإنشاء مسؤولي المنصة وإيقافهم.
 *    مالك واحد (فهرس فريد على العلم)، ولا يضبطه مسار: مشغّل يرفض تغيير العلم إلا من هجرة تفتح له
 *    muthbit.owner_change في معاملتها. فنقل الملكية أو مالك ثانٍ يحتاج هجرة — قرار لا زر.
 *    هذه الهجرة تجعل مسؤول المنصة الحالي مالكاً إن كان واحداً، وتتوقف إن كانوا أكثر، وتمرّ بلا مالك إن لم يوجد
 *    (قاعدة فارغة: npm run reset يهاجر قبل البذر، والبذور تضع العلم على حسابها).
 *
 * ٢) users.can_read_access_log — صلاحية قراءة سجل الوصول لمسؤول منصة يمنحها المالك ويسحبها من مساره وحده.
 *
 * ٣) platform_access_log — سجل الوصول الداخلي، منفصل تماماً عن audit_log ولا تراه الشركات:
 *    كل اطلاع من لوحة المنصة على بيانات شركة أو مورد، ومعه التوثيق، وقراءة السجل نفسه، والمنح والسحب.
 *    لا يُعدَّل ولا يُحذف ولا يُفرَّغ — مشغّلات قاعدة بيانات لا شرط في الشيفرة، ولا من مالك المنصة.
 *
 * ٤) TRUNCATE على audit_log: مشغّل الصف القائم لا يعمل عند TRUNCATE، فكان السجل يُفرَّغ بأمر واحد.
 *    يُسدّ هنا بمشغّل جملة بدالة خاصة به — لا بدالة هجرة البداية، فيبقى تراجعها يحذف دالتها كما كان.
 */

const { assertLocalDatabase } = require('../assertLocalDatabase');

exports.up = async function up(knex) {
  // ── المستوى والصلاحية ──
  await knex.schema.alterTable('users', (t) => {
    t.boolean('is_platform_owner').notNullable().defaultTo(false);
    t.boolean('can_read_access_log').notNullable().defaultTo(false);
  });
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_platform_flags_scope CHECK (
      (is_platform_owner = false OR role = 'platform_admin')
      AND (can_read_access_log = false OR role = 'platform_admin')
    )
  `);
  // مالك واحد: فهرس فريد على ثابت، مقصور على صف العلم — صفّان بالعلم يصطدمان على القيمة نفسها.
  await knex.raw('CREATE UNIQUE INDEX users_single_platform_owner ON users ((true)) WHERE is_platform_owner');

  await knex.raw(`
    CREATE OR REPLACE FUNCTION users_platform_owner_guard() RETURNS trigger AS $$
    BEGIN
      IF NEW.is_platform_owner IS DISTINCT FROM OLD.is_platform_owner
         AND current_setting('muthbit.owner_change', true) IS DISTINCT FROM 'allowed' THEN
        RAISE EXCEPTION 'is_platform_owner changes only through a migration';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await knex.raw(`
    CREATE TRIGGER users_platform_owner_guard
    BEFORE UPDATE OF is_platform_owner ON users
    FOR EACH ROW EXECUTE FUNCTION users_platform_owner_guard()
  `);

  const { rows } = await knex.raw("SELECT id FROM users WHERE role = 'platform_admin'");
  if (rows.length > 1) {
    throw new Error(`يوجد ${rows.length} حساب مسؤول منصة — حدّد أيها مالك المنصة قبل تشغيل هذه الهجرة.`);
  }
  if (rows.length === 1) {
    // يُفتح المفتاح لهذه المعاملة وحدها (is_local = true) — المعاملة التي يلفّ بها knex الهجرة.
    await knex.raw("SELECT set_config('muthbit.owner_change', 'allowed', true)");
    await knex('users').where({ id: rows[0].id }).update({ is_platform_owner: true });
    await knex.raw("SELECT set_config('muthbit.owner_change', '', true)");
  }

  // ── سجل الوصول الداخلي ──
  await knex.schema.createTable('platform_access_log', (t) => {
    t.bigIncrements('id').primary();
    // RESTRICT لا SET NULL: SET NULL تعديلٌ على صف السجل، والسجل لا يُعدَّل.
    t.uuid('actor_user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.string('actor_role', 40).notNullable();
    t.string('action', 60).notNullable();
    t.string('method', 10).notNullable();
    t.string('route', 120).notNullable(); // نمط المسار (/api/requests/:id) لا العنوان الكامل
    t.uuid('company_id');
    t.uuid('supplier_id');
    t.uuid('target_user_id'); // للمنح والسحب وإنشاء مسؤول وإيقافه
    t.string('entity_type', 40);
    t.string('entity_id', 60);
    t.jsonb('payload'); // مرشّحات وأعداد — لا رمز انضمام ولا كلمة مرور ولا سر
    t.string('ip', 60);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['created_at']);
    t.index(['company_id']);
    t.index(['actor_user_id']);
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION platform_access_log_is_append_only() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'platform_access_log is append-only: % is not permitted', TG_OP;
    END;
    $$ LANGUAGE plpgsql
  `);
  await knex.raw(`
    CREATE TRIGGER platform_access_log_no_update_delete
    BEFORE UPDATE OR DELETE ON platform_access_log
    FOR EACH ROW EXECUTE FUNCTION platform_access_log_is_append_only()
  `);
  await knex.raw(`
    CREATE TRIGGER platform_access_log_no_truncate
    BEFORE TRUNCATE ON platform_access_log
    FOR EACH STATEMENT EXECUTE FUNCTION platform_access_log_is_append_only()
  `);

  // ── سدّ TRUNCATE على سجل تدقيق الشركات ──
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_log_no_truncate() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
    END;
    $$ LANGUAGE plpgsql
  `);
  await knex.raw(`
    CREATE TRIGGER audit_log_no_truncate
    BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_no_truncate()
  `);
};

exports.down = async function down(knex) {
  // التراجع لقاعدة التطوير وحدها — على الإنتاج لا يعمل بحال.
  assertLocalDatabase('التراجع عن هجرة مالك المنصة وسجل الوصول');

  // سجل الوصول يُسقط كاملاً بجدوله (ومشغّلاته معه) — بلا تعطيل مشغّل ولا حذف صفوف.
  await knex.schema.dropTable('platform_access_log');
  await knex.raw('DROP FUNCTION IF EXISTS platform_access_log_is_append_only()');

  // مشغّل TRUNCATE على audit_log لا يُمسّ هنا: يسقط مع الجدول في تراجع هجرة البداية،
  // ودالته تبقى (CREATE OR REPLACE يعيدها في الصعود التالي) — فلا شيء في أي تراجع يعطّل حارس السجل.

  await knex.raw('DROP TRIGGER IF EXISTS users_platform_owner_guard ON users');
  await knex.raw('DROP FUNCTION IF EXISTS users_platform_owner_guard()');
  await knex.raw('DROP INDEX IF EXISTS users_single_platform_owner');
  await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_flags_scope');
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('can_read_access_log');
    t.dropColumn('is_platform_owner');
  });
};
