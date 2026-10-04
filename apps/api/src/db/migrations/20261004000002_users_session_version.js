'use strict';

/**
 * إصدار الجلسة: رقم يحمله كل رمز دخول (sv)، ويُزاد عند تغيير كلمة المرور.
 * requireAuth يقرأ المستخدم من القاعدة مع كل طلب أصلاً، فيرفض الرمز الذي لا يطابق رقمُه رقمَ صاحبه.
 * فمن كان داخلاً بالكلمة القديمة — صاحبها أو من سرقها — يخرج لحظة تغييرها لا بعد ١٢ ساعة.
 *
 * رقم لا وقت: المقارنة مطابقة تامة، فلا تتعلّق بساعة الخادم ولا بدقّة iat (ثانية واحدة).
 * والافتراضي 0، والرمز الصادر قبل هذه الهجرة بلا sv يُعدّ 0 — فلا يُخرج النشرُ أحداً.
 * وإضافة عمود بافتراضي ثابت في PostgreSQL 11+ لا تعيد كتابة الجدول.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.integer('session_version').notNullable().defaultTo(0);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('session_version');
  });
};
