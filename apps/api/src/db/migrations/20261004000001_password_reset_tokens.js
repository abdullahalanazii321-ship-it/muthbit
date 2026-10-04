'use strict';

/**
 * رموز إعادة تعيين كلمة المرور.
 *
 * token_hash بصمة SHA-256 للرمز لا الرمز نفسه: الرمز الخام يخرج في البريد وحده ولا يُخزَّن.
 * لو تسرّبت القاعدة فما فيها لا يصلح لإعادة تعيين أي كلمة مرور — البصمة لا تُعكس،
 * والرمز ٣٢ بايتاً عشوائياً فلا يُخمَّن ليُطابَق ببصمته.
 *
 * فهرس token_hash فريد: البحث عند الإعادة به وحده، والفرادة تمنع أن يدلّ رمز على صفّين.
 * وفهرس user_id لحذف رموز المستخدم الأخرى بعد نجاح الإعادة.
 * والحذف متتابع مع المستخدم: فـ del() على users في البذور يكفي ولا يتغيّر ملفها.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('password_reset_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('password_reset_tokens');
};
