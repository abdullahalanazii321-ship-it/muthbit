'use strict';

/**
 * محرك السقوف والصلاحيات — قلب المنصة.
 *
 * القاعدة الحاكمة: الافتراض هو المنع.
 * موظف بلا سقف مضبوط لا يشتري، وفئة غير مصرّح بها لا تمر،
 * وكل طلب — مهما صغر — يحتاج اعتماداً قبل أن يتحول إلى أمر شراء.
 * تجاوز السقف لا يوقف الطلب، بل يرفعه لصاحب صلاحية أعلى.
 */

const SPENT_STATUSES = ['approved', 'ordered', 'delivered', 'closed'];

const REASON = {
  NO_LIMITS: 'no_limits_configured',
  LIMITS_INACTIVE: 'limits_inactive',
  CATEGORY_NOT_ALLOWED: 'category_not_allowed',
  OVER_REQUEST_CEILING: 'over_request_ceiling',
  OVER_MONTHLY_CEILING: 'over_monthly_ceiling',
  NO_APPROVER: 'no_approver_available',
  WITHIN_POLICY: 'within_policy'
};

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function monthlySpend(trx, companyId, buyerUserId) {
  const row = await trx('requests')
    .where({ company_id: companyId, created_by_user_id: buyerUserId })
    .whereIn('status', SPENT_STATUSES)
    .where('created_at', '>=', monthStart())
    .sum({ total: 'amount' })
    .first();
  return Number(row && row.total ? row.total : 0);
}

/**
 * اختيار المعتمِد.
 * ضمن السقف: المعتمِد المعيّن للمشتري.
 * فوق السقف: يُرفع للمدير المالي، فإن لم يوجد فمالك الشركة.
 */
async function resolveApprover(trx, { companyId, buyerUserId, assignedApproverId, escalate }) {
  if (!escalate && assignedApproverId) {
    const assigned = await trx('users')
      .where({ id: assignedApproverId, company_id: companyId, status: 'active' })
      .first();
    if (assigned && assigned.id !== buyerUserId) return assigned;
  }

  const escalation = await trx('users')
    .where({ company_id: companyId, status: 'active' })
    .whereIn('role', ['finance_manager', 'company_owner'])
    .whereNot({ id: buyerUserId })
    .orderByRaw("CASE role WHEN 'finance_manager' THEN 1 WHEN 'company_owner' THEN 2 ELSE 3 END")
    .first();

  return escalation || null;
}

/**
 * تقييم طلب مقابل سياسة الشركة.
 * لا يكتب شيئاً — يعيد قراراً فقط، والمسارات هي من تقرر ماذا تفعل به.
 */
async function evaluate(trx, { companyId, buyerUserId, amount, categoryId }) {
  const reasons = [];
  const value = Number(amount || 0);

  const limits = await trx('buyer_limits')
    .where({ company_id: companyId, user_id: buyerUserId })
    .first();

  if (!limits) {
    return {
      allowed: false,
      overCeiling: false,
      requiresApproval: true,
      approverUserId: null,
      perRequestCeiling: null,
      monthlyCeiling: null,
      monthlySpent: null,
      reasons: [{ code: REASON.NO_LIMITS, message: 'لم يُضبط سقف إنفاق لهذا المشتري. المدير المالي أو المالك يضبطه أولاً.' }]
    };
  }

  if (!limits.active) {
    return {
      allowed: false,
      overCeiling: false,
      requiresApproval: true,
      approverUserId: null,
      perRequestCeiling: Number(limits.per_request_ceiling),
      monthlyCeiling: limits.monthly_ceiling ? Number(limits.monthly_ceiling) : null,
      monthlySpent: null,
      reasons: [{ code: REASON.LIMITS_INACTIVE, message: 'صلاحية الشراء لهذا المستخدم موقوفة.' }]
    };
  }

  const allowedCategories = limits.allowed_category_ids || [];
  const categoryAllowed = allowedCategories.length === 0 || (categoryId && allowedCategories.includes(categoryId));
  if (!categoryAllowed) {
    reasons.push({ code: REASON.CATEGORY_NOT_ALLOWED, message: 'الفئة المطلوبة خارج الفئات المصرّح بها لهذا المشتري.' });
  }

  const perRequestCeiling = Number(limits.per_request_ceiling);
  const overCeiling = value > perRequestCeiling;
  if (overCeiling) {
    reasons.push({
      code: REASON.OVER_REQUEST_CEILING,
      message: `المبلغ ${value.toLocaleString('en-US')} يتجاوز سقف الطلب الواحد ${perRequestCeiling.toLocaleString('en-US')} — يُرفع لصاحب صلاحية أعلى.`
    });
  }

  const monthlyCeiling = limits.monthly_ceiling ? Number(limits.monthly_ceiling) : null;
  const spent = await monthlySpend(trx, companyId, buyerUserId);
  const monthlyExceeded = monthlyCeiling !== null && spent + value > monthlyCeiling;
  if (monthlyExceeded) {
    reasons.push({
      code: REASON.OVER_MONTHLY_CEILING,
      message: `إجمالي الشهر ${(spent + value).toLocaleString('en-US')} يتجاوز السقف الشهري ${monthlyCeiling.toLocaleString('en-US')}.`
    });
  }

  const approver = await resolveApprover(trx, {
    companyId,
    buyerUserId,
    assignedApproverId: limits.approver_user_id,
    escalate: overCeiling
  });

  if (!approver) {
    reasons.push({ code: REASON.NO_APPROVER, message: 'لا يوجد معتمِد مؤهل في الشركة. عيّن مديراً مالياً أو مالكاً نشطاً.' });
  }

  // الحجب الصلب: الفئة، والسقف الشهري، وغياب المعتمِد. تجاوز سقف الطلب الواحد ليس حجباً بل تصعيداً.
  const allowed = categoryAllowed && !monthlyExceeded && Boolean(approver);

  if (allowed && reasons.length === 0) {
    reasons.push({ code: REASON.WITHIN_POLICY, message: 'مطابق للسياسة وضمن السقف.' });
  }

  return {
    allowed,
    overCeiling,
    requiresApproval: true,
    approverUserId: approver ? approver.id : null,
    approverRole: approver ? approver.role : null,
    perRequestCeiling,
    monthlyCeiling,
    monthlySpent: spent,
    categoryAllowed,
    reasons
  };
}

module.exports = { evaluate, monthlySpend, resolveApprover, REASON, SPENT_STATUSES };
