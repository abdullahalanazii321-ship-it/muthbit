'use strict';
const express = require('express');
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');

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

module.exports = router;
