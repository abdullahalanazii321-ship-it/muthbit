'use strict';

/**
 * الفئة التي يكتبها المورد بنفسه حين لا يجد فئته في القائمة.
 *
 * اقتراح لا فئة: نص يقرؤه مسؤول المنصة وقت التوثيق ويقرّر. لا يُنشأ منه صف في categories
 * ولا يُربط به المورد في supplier_categories — وإلا صارت «مقاولات» و«مقاولات عامة» فئتين،
 * وانكسرت مطابقة الطلبات بالموردين التي تقوم على الفئات المعتمدة وحدها.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('suppliers', (t) => {
    t.string('suggested_category', 100);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('suppliers', (t) => {
    t.dropColumn('suggested_category');
  });
};
