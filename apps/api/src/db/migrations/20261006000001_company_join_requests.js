'use strict';

/**
 * انضمام الموظفين للشركة برمز.
 *
 * لكل شركة رمز انضمام. الموظف يسجّل بنفسه بالرمز فيُنشأ حسابه بحالة join_pending بلا دور ولا سقف،
 * ولا يدخل حتى يعتمده المالك بدور وسقف (فيصير active) أو يرفضه بسبب مكتوب (join_rejected).
 * الرمز لا يمنح صلاحية: كل ما يفعله أن يربط الطلب بالشركة الصحيحة.
 *
 * ١) companies.join_code — ثمانية محارف من أبجدية بلا 0 ولا O ولا 1 ولا I، فريد على كل الشركات.
 *    قيمته الافتراضية دالة mb_join_code() على gen_random_bytes (pgcrypto — مولّد معمّى لا عشوائية عادية):
 *    فتأخذ كل شركة موجودة رمزاً ضمن هذه الهجرة نفسها (PostgreSQL يقيّم الافتراضي المتقلّب لكل صف)،
 *    وكل شركة تُنشأ بعدها — من التسجيل أو البذور أو الفحوص — تأخذ رمزها بلا سطر في أيٍّ منها.
 *    الأبجدية ٣٢ محرفاً بالضبط، و٢٥٦ يقبل القسمة على ٣٢: فالبايت % ٣٢ منتظم بلا انحياز لمحرف.
 *
 * ٢) users: حالتان جديدتان join_pending و join_rejected في قائمة قيد الحالة نفسها لا في عمود بجوارها.
 *    والدور يصير قابلاً للفراغ — لكن الفراغ مسموح لهاتين الحالتين وحدهما ومع شركة محددة،
 *    وهما لا تكونان إلا بلا دور. والقيد مكتوب بـ CASE لا بـ OR: قيد CHECK يمرّ إن كان ناتجه NULL،
 *    وصيغة OR القديمة مع دور فارغ تعطي NULL فيمرّ مستخدم بلا دور وبحالة active.
 *    والمستخدم في join_pending بلا سقف: لا صف له في buyer_limits، ولا قيمة افتراضية لدور أو سقف.
 */

const { assertLocalDatabase } = require('../assertLocalDatabase');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_STATUSES = ['join_pending', 'join_rejected'];
const OLD_USER_STATUS = ['pending', 'active', 'suspended'];
const COMPANY_ROLES = ['company_owner', 'finance_manager', 'procurement_manager', 'procurement_buyer', 'ai_agent'];

const list = (values) => values.map((v) => `'${v}'`).join(', ');

// القيد كما أنشأته هجرة البداية حرفياً — يعود إليه down.
const OLD_SCOPE = `(
  (role = 'platform_admin' AND company_id IS NULL AND supplier_id IS NULL)
  OR (role = 'supplier_admin' AND supplier_id IS NOT NULL AND company_id IS NULL)
  OR (role IN (${list(COMPANY_ROLES)}) AND company_id IS NOT NULL AND supplier_id IS NULL)
)`;

exports.up = async function up(knex) {
  if (ALPHABET.length !== 32 || new Set(ALPHABET).size !== 32) throw new Error('أبجدية الرمز يجب أن تكون ٣٢ محرفاً مختلفاً.');

  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await knex.raw(`
    CREATE OR REPLACE FUNCTION mb_join_code() RETURNS text AS $$
    DECLARE
      alphabet constant text := '${ALPHABET}';
      bytes bytea := gen_random_bytes(8);
      code text := '';
    BEGIN
      FOR i IN 0..7 LOOP
        code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
      END LOOP;
      RETURN code;
    END;
    $$ LANGUAGE plpgsql VOLATILE
  `);

  await knex.schema.alterTable('companies', (t) => {
    t.string('join_code', 8).notNullable().defaultTo(knex.raw('mb_join_code()'));
    t.timestamp('join_code_updated_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('ALTER TABLE companies ADD CONSTRAINT companies_join_code_unique UNIQUE (join_code)');

  await knex.schema.alterTable('users', (t) => {
    t.timestamp('join_requested_at');
    t.timestamp('join_decided_at');
    t.uuid('join_decided_by').references('id').inTable('users').onDelete('SET NULL');
    t.text('join_rejection_reason');
  });

  await knex.raw('ALTER TABLE users DROP CONSTRAINT users_status_check');
  await knex.raw(`ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN (${list([...OLD_USER_STATUS, ...JOIN_STATUSES])}))`);

  await knex.raw('ALTER TABLE users ALTER COLUMN role DROP NOT NULL');
  await knex.raw('ALTER TABLE users DROP CONSTRAINT users_scope_exclusive');
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_scope_exclusive CHECK (
      CASE
        WHEN role IS NULL THEN
          status IN (${list(JOIN_STATUSES)}) AND company_id IS NOT NULL AND supplier_id IS NULL
        ELSE
          status NOT IN (${list(JOIN_STATUSES)}) AND ${OLD_SCOPE}
      END
    )
  `);
};

exports.down = async function down(knex) {
  // التراجع لقاعدة التطوير وحدها: npm run reset يتراجع عن كل الهجرات فيمرّ من هنا كل مرة.
  // على الإنتاج لا يعمل بحال — الحارس نفسه الذي يحرس البذور و reset، بلا باب خلفي.
  assertLocalDatabase('التراجع عن هجرة انضمام الموظفين');

  // طالبو الانضمام بلا دور، والمخطط القديم يشترط الدور. لا حذف ولا مساس بسجل التدقيق في أي اتجاه:
  // يُحوَّلون إلى موقوفين بدور المشتري (procurement_buyer) — موقوف لا يدخل، وقيودهم في السجل باقية كما هي.
  // قبل إسقاط القيد الجديد: الصف المحوَّل (دور + suspended + شركة) يطابقه، ويطابق القديم بعده.
  await knex('users')
    .whereIn('status', JOIN_STATUSES)
    .update({ role: 'procurement_buyer', status: 'suspended', updated_at: knex.fn.now() });

  await knex.raw('ALTER TABLE users DROP CONSTRAINT users_scope_exclusive');
  await knex.raw(`ALTER TABLE users ADD CONSTRAINT users_scope_exclusive CHECK ${OLD_SCOPE}`);
  await knex.raw('ALTER TABLE users ALTER COLUMN role SET NOT NULL');
  await knex.raw('ALTER TABLE users DROP CONSTRAINT users_status_check');
  await knex.raw(`ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN (${list(OLD_USER_STATUS)}))`);

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('join_rejection_reason');
    t.dropColumn('join_decided_by');
    t.dropColumn('join_decided_at');
    t.dropColumn('join_requested_at');
  });

  await knex.raw('ALTER TABLE companies DROP CONSTRAINT companies_join_code_unique');
  await knex.schema.alterTable('companies', (t) => {
    t.dropColumn('join_code_updated_at');
    t.dropColumn('join_code');
  });
  await knex.raw('DROP FUNCTION IF EXISTS mb_join_code()');
};
