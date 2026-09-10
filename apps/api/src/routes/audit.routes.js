'use strict';
const express = require('express');
const db = require('../db/knex');
const audit = require('../utils/audit');
const { requireAuth, requireRole, resolvePlatformCompany } = require('../middleware/auth');
const { forbidden } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

/**
 * سجل التدقيق — للقراءة فقط، ولا يخرج منه صف خارج نطاق القارئ.
 * لا يوجد مسار كتابة هنا إطلاقاً: القيد يتم داخل المعاملات نفسها.
 */
router.get('/', requireRole('company_owner', 'finance_manager', 'procurement_manager', 'platform_admin'), async (req, res, next) => {
  try {
    // مسؤول المنصة يسمّي الشركة صراحةً (?company_id=)؛ ولغيره يُتجاهل المعامل ويبقى النطاق من الجلسة.
    const platformCompanyId = req.user.role === 'platform_admin'
      ? await resolvePlatformCompany(req.query.company_id, 'مسؤول المنصة يقرأ سجل شركة محددة — حدّد الشركة.')
      : null;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const query = db('audit_log')
      .leftJoin('users', 'users.id', 'audit_log.actor_user_id')
      .select(
        'audit_log.id', 'audit_log.action', 'audit_log.entity_type', 'audit_log.entity_id',
        'audit_log.payload', 'audit_log.created_at', 'audit_log.actor_role',
        'users.full_name as actor_name'
      )
      .orderBy('audit_log.id', 'desc')
      .limit(limit);

    if (req.user.role === 'platform_admin') {
      query.where('audit_log.company_id', platformCompanyId);
    } else {
      if (!req.user.companyId) throw forbidden();
      query.where('audit_log.company_id', req.user.companyId);
    }
    if (req.query.entity_type) query.where('audit_log.entity_type', String(req.query.entity_type));
    if (req.query.entity_id) query.where('audit_log.entity_id', String(req.query.entity_id));

    const events = await query;

    // قراءة سجل شركة تكتب صفاً في ذلك السجل نفسه. هذا مقصود لا خطأ: من يطّلع على سجلك يترك أثره فيه.
    // يُكتب بعد القراءة، فلا يظهر في هذا الرد بل في القراءة التالية. لا «تصلحه».
    await audit.recordPlatformView(req, {
      companyId: platformCompanyId,
      action: 'platform.viewed_audit',
      entityType: 'company',
      entityId: platformCompanyId,
      payload: {
        filters: {
          entity_type: req.query.entity_type ? String(req.query.entity_type) : null,
          entity_id: req.query.entity_id ? String(req.query.entity_id) : null,
          limit
        },
        count: events.length
      }
    });

    return res.json({ events });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
