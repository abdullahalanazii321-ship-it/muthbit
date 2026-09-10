'use strict';
const express = require('express');
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const categories = await db('categories').select('id', 'slug', 'name_ar', 'name_en').orderBy('name_ar', 'asc');
    return res.json({ categories });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
