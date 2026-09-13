'use strict';
/**
 * اختبار المسار الكامل لمنصة مثبت.
 * يشغّل السيناريو على قاعدة بيانات حقيقية بعد المهاجرات والبذور، ويتحقق من:
 *   العزل بين الشركات · حجب العروض الناقصة · فرض السقف والتصعيد ·
 *   منع اعتماد المرء لطلبه · منع المورد غير الموثّق · حصانة سجل التدقيق.
 *
 * التشغيل:  npm run reset && npm test   (داخل apps/api)
 */
// يجب أن يسبق كل require: الإعدادات تُقرأ لحظة التحميل، و.env يضبط NODE_ENV=development
// ودوتإنف لا يتجاوز متغيّراً مضبوطاً مسبقاً. بدون هذا السطر تظن الشيفرة أنها في التطوير،
// فتبقى محددات المعدل فعّالة طوال الفحوص وتسقطها عشوائياً حين يطول السيناريو.
// knexfile.test هو knexfile.development نفسه — القاعدة واحدة ولا شيء يتغيّر غير هذا.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/db/knex');
const { setLimitsEnabledForTests } = require('../src/middleware/rateLimit');
const sentry = require('../src/utils/sentry');
const envConfig = require('../src/config/env');

const app = createApp();
const PASSWORD = 'Test@1234';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${JSON.stringify(extra)}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`فشل تسجيل الدخول لـ ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function run() {
  section('١ — المصادقة والحالات');

  const platform = await login('admin@platform-demo.sa');
  const owner = await login('admin@owner-demo.sa');
  const finance = await login('admin@finance-demo.sa');
  const buyer = await login('admin@buyer-demo.sa');
  const buyer2 = await login('admin@buyer2-demo.sa');
  const supplier = await login('admin@supplier-demo.sa');
  check('تسجيل دخول كل الأدوار النشطة', true);

  const pendingLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@supplier2-demo.sa', password: PASSWORD });
  check('المورد قيد التوثيق لا يستطيع الدخول', pendingLogin.status === 401, pendingLogin.body);

  const wrongPass = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@buyer-demo.sa', password: 'wrong-password' });
  check('كلمة مرور خاطئة تُرفض', wrongPass.status === 401);

  const noToken = await request(app).get('/api/requests');
  check('طلب بلا رمز يُرفض', noToken.status === 401);

  const me = await request(app).get('/api/auth/me').set(auth(buyer.token));
  check('سقف المشتري ظاهر في /me', Number(me.body.limits.per_request_ceiling) === 80000, me.body.limits);

  section('٢ — إنشاء طلب ضمن السقف');

  const categories = await request(app).get('/api/categories').set(auth(buyer.token));
  const itCategory = categories.body.categories.find((c) => c.slug === 'it');
  const medicalCategory = categories.body.categories.find((c) => c.slug === 'medical');
  check('الفئات محمّلة', Boolean(itCategory && medicalCategory));

  const created = await request(app)
    .post('/api/requests')
    .set(auth(buyer.token))
    .send({ item: '٢٥ حاسباً محمولاً للفرع الجديد', quantity: 25, category_id: itCategory.id, specs: 'i7 / 16GB / 512GB' });
  check('إنشاء الطلب', created.status === 201, created.body);
  const requestId = created.body.request.id;
  check('الطلب يبدأ في مرحلة جمع العروض', created.body.request.status === 'sourcing');
  check('كل طلب يحتاج اعتماداً', created.body.request.requires_approval === true);

  section('٣ — عروض المورد وحجب الناقص');

  const openRequests = await request(app).get('/api/offers/open-requests').set(auth(supplier.token));
  check('المورد يرى الطلب ضمن فئاته', openRequests.body.requests.some((r) => r.id === requestId));
  check(
    'المورد لا يرى هوية الشركة الطالبة',
    !Object.keys(openRequests.body.requests[0] || {}).some((k) => k.includes('company'))
  );

  const completeOffer = await request(app)
    .post('/api/offers')
    .set(auth(supplier.token))
    .send({ request_id: requestId, price: 62500, warranty_months: 24, lead_days: 7 });
  check('تقديم عرض مكتمل', completeOffer.status === 201 && completeOffer.body.complete === true, completeOffer.body);

  const duplicate = await request(app)
    .post('/api/offers')
    .set(auth(supplier.token))
    .send({ request_id: requestId, price: 61000, warranty_months: 12, lead_days: 5 });
  check('لا يقدّم المورد عرضين لنفس الطلب', duplicate.status === 409);

  // عرض ناقص من مورد آخر — يُحفظ ولا يصل للمشتري
  const [secondSupplier] = await db('suppliers')
    .insert({ name: 'شركة الوصل للمعدات', cr_number: '2050087341', city: 'الدمام', verification_status: 'verified', verified_at: db.fn.now() })
    .returning('*');
  await db('supplier_categories').insert({ supplier_id: secondSupplier.id, category_id: itCategory.id, approved: true });
  await db('offers').insert({
    request_id: requestId, supplier_id: secondSupplier.id, price: 58000, warranty_months: 0, lead_days: 0, status: 'submitted'
  });

  const detail = await request(app).get(`/api/requests/${requestId}`).set(auth(buyer.token));
  check('المشتري يرى العرض المكتمل فقط', detail.body.offers.length === 1, { offers: detail.body.offers.length });
  check('العرض الناقص محجوب ومعدود', detail.body.withheld_offers_count === 1);
  check('العرض الأرخص الناقص لم يُعرض', !detail.body.offers.some((o) => Number(o.price) === 58000));

  section('٤ — العزل بين الشركات');

  const crossRead = await request(app).get(`/api/requests/${requestId}`).set(auth(buyer2.token));
  check('مشتري شركة أخرى لا يقرأ الطلب', crossRead.status === 403, crossRead.body);

  const crossList = await request(app).get('/api/requests').set(auth(buyer2.token));
  check('قائمة الشركة الأخرى لا تحوي الطلب', !crossList.body.requests.some((r) => r.id === requestId));

  const crossDecision = await request(app)
    .post(`/api/requests/${requestId}/decision`)
    .set(auth(buyer2.token))
    .send({ decision: 'approved' });
  check('مشتري شركة أخرى لا يعتمد الطلب', [403, 404].includes(crossDecision.status));

  section('٥ — السقف والاعتماد');

  const selected = await request(app)
    .post(`/api/requests/${requestId}/select-offer`)
    .set(auth(buyer.token))
    .send({ offer_id: completeOffer.body.offer.id });
  check('اختيار العرض', selected.status === 200, selected.body);
  check('المبلغ ضمن السقف', selected.body.request.over_ceiling === false);
  check('الطلب انتقل لانتظار الاعتماد', selected.body.request.status === 'pending_approval');
  check('المعتمِد هو المدير المالي المعيّن', selected.body.request.approver_user_id === finance.user.id);

  const selfApprove = await request(app)
    .post(`/api/requests/${requestId}/decision`)
    .set(auth(buyer.token))
    .send({ decision: 'approved' });
  check('المشتري لا يعتمد طلبه (دور غير مخوّل)', selfApprove.status === 403);

  const wrongApprover = await request(app)
    .post(`/api/requests/${requestId}/decision`)
    .set(auth(owner.token))
    .send({ decision: 'approved' });
  check('معتمِد غير موجّه له الطلب يُرفض', wrongApprover.status === 403, wrongApprover.body);

  const rejectNoReason = await request(app)
    .post(`/api/requests/${requestId}/decision`)
    .set(auth(finance.token))
    .send({ decision: 'rejected' });
  check('الرفض بلا سبب مرفوض', rejectNoReason.status === 400);

  const approved = await request(app)
    .post(`/api/requests/${requestId}/decision`)
    .set(auth(finance.token))
    .send({ decision: 'approved' });
  check('اعتماد المدير المالي', approved.status === 200 && approved.body.request.status === 'approved', approved.body);

  section('٦ — أمر الشراء');

  const po = await request(app).post(`/api/requests/${requestId}/purchase-order`).set(auth(finance.token));
  check('إصدار أمر الشراء', po.status === 201, po.body);
  check('أمر الشراء بنفس شروط العرض', Number(po.body.purchase_order.amount) === 62500 && po.body.purchase_order.warranty_months === 24);
  check('الطلب صار مطلوباً', po.body.request.status === 'ordered');

  const poAgain = await request(app).post(`/api/requests/${requestId}/purchase-order`).set(auth(finance.token));
  check('لا يصدر أمر شراء مرتين', poAgain.status === 409);

  section('٧ — تجاوز السقف والتصعيد');

  const bigRequest = await request(app)
    .post('/api/requests')
    .set(auth(buyer.token))
    .send({ item: 'مولد كهربائي ٦٠ ك.ف.أ', quantity: 1, category_id: itCategory.id });
  const bigId = bigRequest.body.request.id;

  const bigOffer = await request(app)
    .post('/api/offers')
    .set(auth(supplier.token))
    .send({ request_id: bigId, price: 118000, warranty_months: 24, lead_days: 14 });

  const bigSelected = await request(app)
    .post(`/api/requests/${bigId}/select-offer`)
    .set(auth(buyer.token))
    .send({ offer_id: bigOffer.body.offer.id });
  check('المبلغ فوق السقف معلَّم', bigSelected.body.request.over_ceiling === true, bigSelected.body.policy);
  check(
    'سبب التجاوز مذكور صراحةً',
    (bigSelected.body.policy.reasons || []).some((r) => r.code === 'over_request_ceiling')
  );
  check('التصعيد لصاحب صلاحية أعلى', bigSelected.body.request.approver_user_id === finance.user.id);

  section('٨ — حدود الفئات والسقف الشهري');

  const outOfCategory = await request(app)
    .post('/api/requests')
    .set(auth(buyer2.token))
    .send({ item: 'أدوات سلامة', quantity: 10, category_id: (await request(app).get('/api/categories').set(auth(buyer2.token))).body.categories.find((c) => c.slug === 'safety').id });
  check('فئة خارج المصرّح به تُمنع من الأصل', outOfCategory.status === 422, outOfCategory.body);
  check(
    'سبب المنع هو الفئة',
    ((outOfCategory.body.error && outOfCategory.body.error.details && outOfCategory.body.error.details.reasons) || [])
      .some((r) => r.code === 'category_not_allowed')
  );

  const inCategory = await request(app)
    .post('/api/requests')
    .set(auth(buyer2.token))
    .send({ item: 'كراسي فحص', quantity: 40, category_id: medicalCategory.id });
  check('فئة مصرّح بها تمر', inCategory.status === 201, inCategory.body);

  // موظف بلا سقف مضبوط: الافتراض هو المنع لا السماح
  const [noLimitUser] = await db('users')
    .insert({
      email: 'nolimit@owner-demo.sa',
      password_hash: (await db('users').where({ email: 'admin@buyer-demo.sa' }).first()).password_hash,
      full_name: 'موظف بلا سقف',
      role: 'procurement_buyer',
      status: 'active',
      company_id: owner.user.company_id
    })
    .returning('*');
  const noLimitLogin = await login(noLimitUser.email);
  const noLimitRequest = await request(app)
    .post('/api/requests')
    .set(auth(noLimitLogin.token))
    .send({ item: 'أي صنف', quantity: 1, category_id: itCategory.id });
  check('موظف بلا سقف لا يفتح طلباً', noLimitRequest.status === 422, noLimitRequest.body);

  section('٩ — المورد غير الموثّق');

  const [pendingSupplierUser] = await db('users').where({ email: 'admin@supplier2-demo.sa' }).update({ status: 'active' }).returning('*');
  const pendingSupplierLogin = await login(pendingSupplierUser.email);
  const pendingOffer = await request(app)
    .post('/api/offers')
    .set(auth(pendingSupplierLogin.token))
    .send({ request_id: inCategory.body.request.id, price: 1000, warranty_months: 12, lead_days: 3 });
  check('مورد قيد التوثيق لا يقدّم عرضاً', pendingOffer.status === 422, pendingOffer.body);

  section('١٠ — الإيقاف الفوري');

  const suspend = await request(app)
    .post(`/api/companies/${owner.user.company_id}/users/${buyer.user.id}/suspend`)
    .set(auth(owner.token))
    .send({ reason: 'اختبار الإيقاف' });
  check('إيقاف المشتري', suspend.status === 200, suspend.body);

  const afterSuspend = await request(app).get('/api/requests').set(auth(buyer.token));
  check('الرمز القديم لا يعمل بعد الإيقاف', afterSuspend.status === 403);

  const cancelled = await db('requests').where({ id: bigId }).first();
  check('الطلبات المفتوحة أُلغيت مع الإيقاف', cancelled.status === 'cancelled', { status: cancelled.status });

  const orderedStill = await db('requests').where({ id: requestId }).first();
  check('الطلب الذي صدر أمره لم يُمس', orderedStill.status === 'ordered');

  section('١١ — سجل التدقيق');

  const auditRes = await request(app).get('/api/audit').set(auth(finance.token));
  const actions = auditRes.body.events.map((e) => e.action);
  check('السجل يقيّد إنشاء الطلب', actions.includes('request.created'));
  check('السجل يقيّد اختيار العرض', actions.includes('request.offer_selected'));
  check('السجل يقيّد الاعتماد', actions.includes('request.approved'));
  check('السجل يقيّد إصدار أمر الشراء', actions.includes('purchase_order.issued'));

  const supplierAudit = await request(app).get('/api/audit').set(auth(supplier.token));
  check('المورد لا يصل لسجل تدقيق الشركات', supplierAudit.status === 403);

  let updateBlocked = false;
  try {
    await db('audit_log').where({ id: auditRes.body.events[0].id }).update({ action: 'tampered' });
  } catch (e) {
    updateBlocked = /append-only/i.test(String(e.message));
  }
  check('تعديل سجل التدقيق مرفوض من قاعدة البيانات', updateBlocked);

  let deleteBlocked = false;
  try {
    await db('audit_log').where({ id: auditRes.body.events[0].id }).del();
  } catch (e) {
    deleteBlocked = /append-only/i.test(String(e.message));
  }
  check('حذف سجل التدقيق مرفوض من قاعدة البيانات', deleteBlocked);

  section('١٢ — نزاهة السجل والحوكمة');

  // المحاولة التي منعتها السياسة تترك أثراً: قيد الفحص المبكر يُكتب خارج أي معاملة.
  // (محاولة «موظف بلا سقف» في القسم ٨)
  const blockedAudit = await request(app)
    .get('/api/audit?entity_type=request&limit=500')
    .set(auth(owner.token));
  check(
    'محاولة الطلب بلا سقف تُقيَّد في السجل',
    (blockedAudit.body.events || []).some(
      (e) =>
        e.action === 'request.policy_blocked' &&
        e.entity_id === null &&
        e.payload &&
        e.payload.item === 'أي صنف' &&
        (e.payload.reasons || []).some((r) => r.code === 'no_limits_configured')
    ),
    { status: blockedAudit.status }
  );

  // أحداث العروض تُنسب لشركة الطلب، فيراها مالكها رغم أن فاعلها مورد بلا شركة.
  // (العرض المكتمل في القسم ٣)
  const offerAudit = await request(app)
    .get(`/api/audit?entity_id=${completeOffer.body.offer.id}`)
    .set(auth(owner.token));
  check(
    'عرض المورد يظهر لمالك الشركة في السجل',
    (offerAudit.body.events || []).some((e) => e.action === 'offer.submitted'),
    { status: offerAudit.status }
  );

  // لا يُجمَّد المالك إلا بيد مالك. يُفحص أخيراً: لو انكسر المنع يوماً لما مسّ إيقافُ المالك ما قبله.
  const suspendOwner = await request(app)
    .post(`/api/companies/${owner.user.company_id}/users/${owner.user.id}/suspend`)
    .set(auth(finance.token))
    .send({ reason: 'اختبار حماية المالك' });
  check('المدير المالي لا يوقف المالك', suspendOwner.status === 403, suspendOwner.body);

  section('١٣ — اطلاع مسؤول المنصة');

  // أحداث platform.* كما يراها المالك في سجل شركته.
  const platformEventsSeenByOwner = async () => {
    const res = await request(app).get('/api/audit?limit=500').set(auth(owner.token));
    return (res.body.events || []).filter((e) => String(e.action).startsWith('platform.'));
  };

  const platformNoCompany = await request(app).get('/api/requests').set(auth(platform.token));
  check('المنصة لا تقرأ الطلبات دون تسمية الشركة', platformNoCompany.status === 400, platformNoCompany.body);

  const platformList = await request(app)
    .get(`/api/requests?company_id=${owner.user.company_id}`)
    .set(auth(platform.token));
  const afterPlatformList = await platformEventsSeenByOwner();
  check(
    'اطلاع المنصة على طلبات شركة يُقيَّد في سجلها',
    platformList.status === 200 &&
      afterPlatformList.some((e) => e.action === 'platform.viewed_requests' && e.actor_role === 'platform_admin'),
    { status: platformList.status, events: afterPlatformList.map((e) => e.action) }
  );

  const platformOne = await request(app).get(`/api/requests/${requestId}`).set(auth(platform.token));
  const afterPlatformOne = await platformEventsSeenByOwner();
  check(
    'اطلاع المنصة على طلب بعينه يُقيَّد ومعه مرجعه',
    platformOne.status === 200 &&
      afterPlatformOne.some(
        (e) =>
          e.action === 'platform.viewed_request' &&
          e.entity_id === requestId &&
          e.payload &&
          e.payload.reference === created.body.request.reference
      ),
    { status: platformOne.status }
  );

  // أحداث المنصة السابقة موجودة في السجل؛ المطلوب أن قراءة المالك لا تضيف إليها شيئاً.
  const beforeOwnerRead = await platformEventsSeenByOwner();
  const ownerRead = await request(app).get('/api/requests').set(auth(owner.token));
  const afterOwnerRead = await platformEventsSeenByOwner();
  check(
    'قراءة المالك طلبات شركته لا تُقيَّد اطلاعاً',
    ownerRead.status === 200 &&
      afterOwnerRead.length === beforeOwnerRead.length &&
      afterOwnerRead.every((e) => e.actor_role === 'platform_admin'),
    { status: ownerRead.status, before: beforeOwnerRead.length, after: afterOwnerRead.length }
  );

  section('١٤ — قائمة الشركات وتوثيق مورد جديد');

  const companiesList = await request(app).get('/api/companies').set(auth(platform.token));
  check(
    'مسؤول المنصة يقرأ قائمة الشركات',
    companiesList.status === 200 &&
      (companiesList.body.companies || []).some((c) => c.id === owner.user.company_id && c.name === 'شركة الأفق للمقاولات'),
    { status: companiesList.status }
  );

  const companiesForOwner = await request(app).get('/api/companies').set(auth(owner.token));
  check('مالك الشركة لا يقرأ قائمة الشركات', companiesForOwner.status === 403, companiesForOwner.body);

  // مورد جديد يدخل pending ثم يُوثَّق — الطريق الذي كانت الواجهة تعجز عنه.
  const unique = String(Date.now()).slice(-10);
  const freshSupplier = await request(app)
    .post('/api/suppliers/register')
    .send({
      supplier: { name: `مورد فحص التوثيق ${unique}`, cr_number: unique, city: 'الرياض', category_slugs: ['it'] },
      admin: { full_name: 'مسؤول مورد الفحص', email: `verify-${unique}@supplier-test.sa`, password: PASSWORD }
    });
  const freshSupplierId = freshSupplier.body.supplier && freshSupplier.body.supplier.id;

  const verifyFresh = await request(app)
    .patch(`/api/suppliers/${freshSupplierId}/verification`)
    .set(auth(platform.token))
    .send({ status: 'verified', source: 'manual' });
  check(
    'مسؤول المنصة يوثّق مورداً جديداً',
    freshSupplier.status === 201 && verifyFresh.status === 200 && verifyFresh.body.supplier.verification_status === 'verified',
    { register: freshSupplier.status, verify: verifyFresh.status }
  );

  const stillPending = await request(app).get('/api/suppliers?status=pending').set(auth(platform.token));
  check(
    'المورد الموثّق يخرج من قائمة بانتظار التوثيق',
    stillPending.status === 200 && !(stillPending.body.suppliers || []).some((s) => s.id === freshSupplierId),
    { status: stillPending.status }
  );

  section('١٥ — إعادة التفعيل واستعادة الشركة الموقوفة');

  const companyPath = `/api/companies/${owner.user.company_id}`;
  const userStatus = async (userId) => {
    const res = await request(app).get(`${companyPath}/users`).set(auth(owner.token));
    const row = (res.body.users || []).find((u) => u.id === userId);
    return row ? row.status : null;
  };

  // الإيقاف كان بلا نقيض: كل إيقاف في المنصة نهائياً. هذا نقيضه — في الدخول وحده.
  const suspendBuyer = await request(app)
    .post(`${companyPath}/users/${buyer.user.id}/suspend`)
    .set(auth(finance.token))
    .send({ reason: 'اختبار إعادة التفعيل' });
  const activateBuyer = await request(app)
    .post(`${companyPath}/users/${buyer.user.id}/activate`)
    .set(auth(finance.token));
  check(
    'المدير المالي يوقف مشترياً ثم يعيد تفعيله',
    suspendBuyer.status === 200 && activateBuyer.status === 200 && (await userStatus(buyer.user.id)) === 'active',
    { suspend: suspendBuyer.status, activate: activateBuyer.status }
  );

  const activateAgain = await request(app)
    .post(`${companyPath}/users/${buyer.user.id}/activate`)
    .set(auth(finance.token));
  check('إعادة تفعيل حساب نشط ترفض بـ 409', activateAgain.status === 409, activateAgain.body);

  // نفس قيد الإيقاف: المالك لا يُمَسّ إلا بيد مالك — والتحقق قبل الحالة، فالمالك نشط ومع ذلك 403.
  const activateOwner = await request(app)
    .post(`${companyPath}/users/${owner.user.id}/activate`)
    .set(auth(finance.token));
  check('المدير المالي لا يعيد تفعيل المالك', activateOwner.status === 403, activateOwner.body);

  // الشركة الثانية: موظف موقوف قبل إيقاف الشركة، ثم إيقاف الشركة، ثم إعادة توثيقها.
  const owner2 = await login('admin@owner2-demo.sa');
  const company2Path = `/api/companies/${owner2.user.company_id}`;
  await request(app)
    .post(`${company2Path}/users/${buyer2.user.id}/suspend`)
    .set(auth(owner2.token))
    .send({ reason: 'موقوف قبل إيقاف الشركة' });

  const suspendCompany2 = await request(app)
    .patch(`/api/companies/${owner2.user.company_id}/verification`)
    .set(auth(platform.token))
    .send({ status: 'suspended', reason: 'اختبار استعادة الشركة الموقوفة' });
  const owner2Locked = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@owner2-demo.sa', password: PASSWORD });

  const reverifyCompany2 = await request(app)
    .patch(`/api/companies/${owner2.user.company_id}/verification`)
    .set(auth(platform.token))
    .send({ status: 'active', source: 'manual' });
  const owner2Back = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@owner2-demo.sa', password: PASSWORD });
  const buyer2Still = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@buyer2-demo.sa', password: PASSWORD });

  check(
    'إعادة توثيق شركة موقوفة تعيد مالكها وحده',
    suspendCompany2.status === 200 &&
      owner2Locked.status === 401 &&
      reverifyCompany2.status === 200 &&
      owner2Back.status === 200 &&
      buyer2Still.status === 401,
    {
      suspend: suspendCompany2.status,
      lockedLogin: owner2Locked.status,
      reverify: reverifyCompany2.status,
      ownerLogin: owner2Back.status,
      buyerLogin: buyer2Still.status
    }
  );

  // فئات المورد كما سجّلها هو: المورد الجديد سجّل فئة واحدة، والمنصة فيها أكثر.
  const supplierCategories = await request(app)
    .get(`/api/suppliers/${freshSupplierId}/categories`)
    .set(auth(platform.token));
  check(
    'فئات المورد هي ما سجّله هو لا كل فئات المنصة',
    supplierCategories.status === 200 &&
      supplierCategories.body.categories.length === 1 &&
      supplierCategories.body.categories[0].slug === 'it' &&
      categories.body.categories.length > supplierCategories.body.categories.length,
    { status: supplierCategories.status, count: (supplierCategories.body.categories || []).length }
  );

  const supplierCategoriesForOwner = await request(app)
    .get(`/api/suppliers/${freshSupplierId}/categories`)
    .set(auth(owner.token));
  check('مالك الشركة لا يقرأ فئات مورد', supplierCategoriesForOwner.status === 403, supplierCategoriesForOwner.body);

  section('١٦ — السبب المكتوب شرط لكل إيقاف');

  // القيد في الخادم لا في الواجهة: هذه نداءات مباشرة بلا شاشة، وتُرفض كما تُرفض من الشاشة.
  const suspendNoReason = await request(app)
    .post(`${companyPath}/users/${buyer.user.id}/suspend`)
    .set(auth(owner.token))
    .send({});
  check('إيقاف مستخدم بلا سبب يُرفض', suspendNoReason.status === 400, suspendNoReason.body);

  const suspendShortReason = await request(app)
    .post(`${companyPath}/users/${buyer.user.id}/suspend`)
    .set(auth(owner.token))
    .send({ reason: 'ها' });
  check('إيقاف مستخدم بسبب من محرفين يُرفض', suspendShortReason.status === 400, suspendShortReason.body);

  // الفائدة كلها: أن يبقى السبب في سجل لا يُعدَّل.
  const REASON = 'مغادرة الموظف للشركة';
  const suspendWithReason = await request(app)
    .post(`${companyPath}/users/${buyer.user.id}/suspend`)
    .set(auth(owner.token))
    .send({ reason: `  ${REASON}  ` });
  const reasonAudit = await request(app)
    .get(`/api/audit?entity_id=${buyer.user.id}&limit=50`)
    .set(auth(owner.token));
  check(
    'السبب المكتوب يصل إلى سجل التدقيق',
    suspendWithReason.status === 200 &&
      (reasonAudit.body.events || []).some((e) => e.action === 'user.suspended' && e.payload && e.payload.reason === REASON),
    { suspend: suspendWithReason.status, audit: reasonAudit.status }
  );

  const suspendCompanyNoReason = await request(app)
    .patch(`/api/companies/${owner2.user.company_id}/verification`)
    .set(auth(platform.token))
    .send({ status: 'suspended' });
  // والتوثيق يمنح فلا يشترط سبباً — القاعدة للسلب وحده.
  const verifyCompanyNoReason = await request(app)
    .patch(`/api/companies/${owner2.user.company_id}/verification`)
    .set(auth(platform.token))
    .send({ status: 'active', source: 'manual' });
  check(
    'إيقاف شركة بلا سبب يُرفض وتوثيقها بلا سبب يمر',
    suspendCompanyNoReason.status === 400 && verifyCompanyNoReason.status === 200,
    { suspend: suspendCompanyNoReason.status, verify: verifyCompanyNoReason.status }
  );

  const rejectSupplierNoReason = await request(app)
    .patch(`/api/suppliers/${freshSupplierId}/verification`)
    .set(auth(platform.token))
    .send({ status: 'rejected' });
  check('رفض مورد بلا سبب يُرفض', rejectSupplierNoReason.status === 400, rejectSupplierNoReason.body);

  section('١٧ — القاعدة الواحدة: سحب العرض ورفض الطلب');

  // القسم ١٦ أوقف المشتري بسبب صحيح، فيُعاد تفعيله ويُضبط سقفه من جديد —
  // بمساري المنصة نفسيهما، فالإيقاف لا يُستأنف تلقائياً.
  await request(app).post(`${companyPath}/users/${buyer.user.id}/activate`).set(auth(owner.token));
  await request(app)
    .put(`${companyPath}/buyers/${buyer.user.id}/limits`)
    .set(auth(owner.token))
    .send({ per_request_ceiling: 80000, approver_user_id: finance.user.id, active: true });

  // طلبان: أحدهما لسحب عرضه، والآخر ليُرفض. والخادم يرفض عرضاً ثانياً على الطلب نفسه.
  const newRequest = async (item) => {
    const res = await request(app)
      .post('/api/requests')
      .set(auth(buyer.token))
      .send({ item, quantity: 3, category_id: itCategory.id });
    return res.body.request && res.body.request.id;
  };
  const newOffer = async (requestId, price) => {
    const res = await request(app)
      .post('/api/offers')
      .set(auth(supplier.token))
      .send({ request_id: requestId, price, warranty_months: 12, lead_days: 5 });
    return res.body.offer && res.body.offer.id;
  };

  const withdrawRequestId = await newRequest('طابعات ليزر');
  const withdrawOfferId = await newOffer(withdrawRequestId, 9000);

  const withdrawNoReason = await request(app)
    .post(`/api/offers/${withdrawOfferId}/withdraw`)
    .set(auth(supplier.token))
    .send({});
  check('سحب عرض بلا سبب يُرفض', withdrawNoReason.status === 400, withdrawNoReason.body);

  // السبب يصل إلى سجل الشركة المشترية: حدث العرض يُنسب لشركة الطلب لا لفاعله.
  const WITHDRAW_REASON = 'نفدت الكمية من المستودع';
  const withdrawOk = await request(app)
    .post(`/api/offers/${withdrawOfferId}/withdraw`)
    .set(auth(supplier.token))
    .send({ reason: `  ${WITHDRAW_REASON}  ` });
  const buyerCompanyAudit = await request(app)
    .get(`/api/audit?entity_id=${withdrawOfferId}`)
    .set(auth(owner.token));
  check(
    'سبب سحب العرض يصل إلى سجل الشركة المشترية',
    withdrawOk.status === 200 &&
      (buyerCompanyAudit.body.events || []).some(
        (e) => e.action === 'offer.withdrawn' && e.payload && e.payload.reason === WITHDRAW_REASON
      ),
    { withdraw: withdrawOk.status, audit: buyerCompanyAudit.status }
  );

  // رفض الطلب: كان حرف واحد يمر، وصار الحدّ حدَّ المنصة نفسه.
  const rejectRequestId = await newRequest('حواسيب مكتبية');
  const rejectOfferId = await newOffer(rejectRequestId, 9500);
  const rejectSelect = await request(app)
    .post(`/api/requests/${rejectRequestId}/select-offer`)
    .set(auth(buyer.token))
    .send({ offer_id: rejectOfferId });

  const rejectShortReason = await request(app)
    .post(`/api/requests/${rejectRequestId}/decision`)
    .set(auth(finance.token))
    .send({ decision: 'rejected', reason: 'لا' });
  check('رفض طلب بسبب من حرفين يُرفض', rejectShortReason.status === 400, rejectShortReason.body);

  const rejectOk = await request(app)
    .post(`/api/requests/${rejectRequestId}/decision`)
    .set(auth(finance.token))
    .send({ decision: 'rejected', reason: 'السعر أعلى من المعتاد لهذا الصنف' });
  check(
    'رفض طلب بسبب صحيح يمر كما كان',
    rejectOk.status === 200 && rejectOk.body.request.status === 'rejected',
    { select: rejectSelect.status, status: rejectOk.status }
  );

  section('١٨ — تحديد معدل الطلبات');

  // المحددات معطّلة في بيئة الاختبار لأن ما سبق يسجّل دخول عشرات المرات في ثوانٍ.
  // هذا الفحص وحده يفتحها ثم يغلقها في finally، فلا يتأثر به غيره.
  setLimitsEnabledForTests(true);
  try {
    let lastAttempt;
    for (let attempt = 1; attempt <= 11; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      lastAttempt = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@buyer-demo.sa', password: 'wrong-password' });
    }
    check(
      'المحاولة الحادية عشرة تُحجب بـ 429 ورمزها rate_limited',
      lastAttempt.status === 429 && lastAttempt.body.error && lastAttempt.body.error.code === 'rate_limited',
      { status: lastAttempt.status, body: lastAttempt.body }
    );

    check(
      'رد الحجب يحمل رأس RateLimit-Remaining',
      lastAttempt.headers['ratelimit-remaining'] !== undefined,
      { remaining: lastAttempt.headers['ratelimit-remaining'] }
    );

    // أدوات المراقبة تنادي /health كل دقيقة: حجبه إنذار كاذب بأن المنصة سقطت.
    const health = await request(app).get('/health');
    check('/health بعد تجاوز الحد ما زال 200', health.status === 200, { status: health.status });

    // عدّاد الإنشاء واحد بين المسارين: خمس محاولات على تسجيل الشركة تستنفد نصيب
    // تسجيل المورد أيضاً، فلا يحصل أحد على عشر محاولات بالتنقل بينهما.
    // الأجسام ناقصة عمداً (400): الحد يُحسب قبل التحقق، فلا يُكتب شيء في قاعدة البيانات.
    const companyAttempts = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      companyAttempts.push(await request(app).post('/api/auth/register-company').send({}));
    }
    const supplierAfter = await request(app).post('/api/suppliers/register').send({});
    check(
      'عدّاد إنشاء الحساب مشترك بين تسجيل الشركة وتسجيل المورد',
      companyAttempts.every((r) => r.status === 400) &&
        supplierAfter.status === 429 &&
        supplierAfter.body.error.code === 'rate_limited',
      { company: companyAttempts.map((r) => r.status), supplier: supplierAfter.status }
    );

    // مفتاح الوكيل: الكلفة لا التخمين. عشرون محاولة فاشلة ثم الحجب.
    let lastKeyAttempt;
    for (let attempt = 1; attempt <= 21; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      lastKeyAttempt = await request(app).get('/api/requests').set('X-API-Key', `bogus-key-${attempt}`);
    }
    check(
      'المحاولة الحادية والعشرون بمفتاح وكيل غير صالح تُحجب',
      lastKeyAttempt.status === 429 && lastKeyAttempt.body.error.code === 'rate_limited',
      { status: lastKeyAttempt.status, body: lastKeyAttempt.body }
    );

    // الحد لا يُعدّ إلا ما حمل الرأس: جلسة عادية برمز Bearer لا تتأثر بحجب المفاتيح.
    const sessionAfterBlock = await request(app).get('/api/requests').set(auth(buyer.token));
    check(
      'حد مفتاح الوكيل لا يمس جلسة عادية برمز Bearer',
      sessionAfterBlock.status === 200,
      { status: sessionAfterBlock.status }
    );
  } finally {
    setLimitsEnabledForTests(false);
  }

  section('١٩ — فحص الصحة وتتبّع الأخطاء');

  const health = await request(app).get('/health');
  check(
    'فحص الصحة يرد 200 ومعه uptime_seconds و version',
    health.status === 200 &&
      typeof health.body.uptime_seconds === 'number' &&
      typeof health.body.version === 'string' &&
      health.body.version.length > 0,
    health.body
  );

  // مسار عام يقرؤه أي أحد: لا يتسرّب منه شيء عن البنية التحتية.
  const leakyKey = /database|host|url/i;
  const collectKeys = (value, acc = [], depth = 0) => {
    if (depth > 6 || value === null || typeof value !== 'object') return acc;
    for (const [key, val] of Object.entries(value)) {
      acc.push(key);
      collectKeys(val, acc, depth + 1);
    }
    return acc;
  };
  const healthKeys = collectKeys(health.body);
  check(
    'فحص الصحة لا يكشف شيئاً عن قاعدة البيانات',
    healthKeys.every((key) => !leakyKey.test(key)),
    { keys: healthKeys }
  );

  // الحالة الطبيعية على جهاز المطوّر وفي CI: بلا DSN لا تُحمَّل المكتبة ولا يتغيّر سلوك.
  check(
    'كل شيء يعمل و SENTRY_DSN غير مضبوط',
    !envConfig.sentryDsn && sentry.isEnabled() === false && health.status === 200,
    { dsn: envConfig.sentryDsn, enabled: sentry.isEnabled() }
  );

  section('٢٠ — التسجيل العام');

  // صفحة التسجيل يفتحها زائر بلا رمز، وتسجيل المورد يشترط category_slugs من هذه القائمة.
  const publicCategories = await request(app).get('/api/categories');
  check(
    'قائمة الفئات تُقرأ بلا رمز مصادقة',
    publicCategories.status === 200 &&
      Array.isArray(publicCategories.body.categories) &&
      publicCategories.body.categories.length > 0,
    { status: publicCategories.status }
  );

  // cr_number فريد في الجدول، فيُشتق من الوقت كما في القسم ١٤ — ولكل تسجيل رقمه.
  const registerStamp = Date.now();
  const freshCr = (offset) => String(registerStamp + offset).slice(-10);
  const freshOwnerEmail = `register-${registerStamp}@company-test.sa`;
  const userExists = async (email) => Boolean(await db('users').where({ email }).first());

  const freshCompany = await request(app)
    .post('/api/auth/register-company')
    .send({
      company: { name: `شركة فحص التسجيل ${registerStamp}`, cr_number: freshCr(0), city: 'جدة' },
      owner: { full_name: 'مالك شركة الفحص', email: freshOwnerEmail, password: PASSWORD }
    });
  check(
    'تسجيل شركة جديدة ينجح بـ 201 والشركة ومالكها بحالة pending',
    freshCompany.status === 201 &&
      Boolean(freshCompany.body.company) &&
      freshCompany.body.company.status === 'pending' &&
      Boolean(freshCompany.body.user) &&
      freshCompany.body.user.status === 'pending',
    { status: freshCompany.status, body: freshCompany.body }
  );

  // السبب هو الحالة لا كلمة المرور: كلمة المرور صحيحة، والرسالة غير رسالة البيانات الخاطئة.
  const freshLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: freshOwnerEmail, password: PASSWORD });
  check(
    'الحساب المسجّل حديثاً لا يدخل لأنه بانتظار التوثيق',
    freshLogin.status === 401 &&
      !freshLogin.body.token &&
      Boolean(freshLogin.body.error) &&
      /بانتظار التوثيق/.test(freshLogin.body.error.message),
    { status: freshLogin.status, body: freshLogin.body }
  );

  // سجل تجاري مختلف عمداً: فلا يأتي 409 من تكرار السجل بل من البريد وحده.
  const duplicateEmail = await request(app)
    .post('/api/auth/register-company')
    .send({
      company: { name: 'شركة ببريد مكرر', cr_number: freshCr(1), city: 'جدة' },
      owner: { full_name: 'مالك ببريد مكرر', email: freshOwnerEmail, password: PASSWORD }
    });
  check(
    'تسجيل ببريد مسجّل مسبقاً يُرفض بـ 409',
    duplicateEmail.status === 409 && Boolean(duplicateEmail.body.error) && duplicateEmail.body.error.code === 'conflict',
    { status: duplicateEmail.status, body: duplicateEmail.body }
  );

  const noCategoriesEmail = `no-categories-${registerStamp}@supplier-test.sa`;
  const supplierNoCategories = await request(app)
    .post('/api/suppliers/register')
    .send({
      supplier: { name: 'مورد بلا فئات', cr_number: freshCr(2), city: 'الرياض', category_slugs: [] },
      admin: { full_name: 'مسؤول مورد بلا فئات', email: noCategoriesEmail, password: PASSWORD }
    });
  check(
    'تسجيل مورد بلا فئات يُرفض بـ 400 ولا يُنشأ له حساب',
    supplierNoCategories.status === 400 && !(await userExists(noCategoriesEmail)),
    { status: supplierNoCategories.status, body: supplierNoCategories.body }
  );

  const shortCrEmail = `short-cr-${registerStamp}@company-test.sa`;
  const nineDigitCr = await request(app)
    .post('/api/auth/register-company')
    .send({
      company: { name: 'شركة بسجل ناقص', cr_number: '123456789', city: 'جدة' },
      owner: { full_name: 'مالك بسجل ناقص', email: shortCrEmail, password: PASSWORD }
    });
  check(
    'تسجيل بسجل تجاري من تسعة أرقام يُرفض بـ 400 ولا يُنشأ له حساب',
    nineDigitCr.status === 400 && !(await userExists(shortCrEmail)),
    { status: nineDigitCr.status, body: nineDigitCr.body }
  );

  section('٢١ — إعادة تقديم العرض بعد سحبه');

  // صف واحد لكل مورد على كل طلب (قيد فريد): العرض الجديد بعد السحب يُحيي الصف نفسه ولا يُدرج غيره.
  const withdrawOffer = (offerId, reason) =>
    request(app).post(`/api/offers/${offerId}/withdraw`).set(auth(supplier.token)).send({ reason });
  const submitOffer = (requestId, price) =>
    request(app)
      .post('/api/offers')
      .set(auth(supplier.token))
      .send({ request_id: requestId, price, warranty_months: 12, lead_days: 5 });

  // مورد أخطأ في كتابة السعر فسحب عرضه — كان يفقد الطلب نهائياً.
  const resubmitRequestId = await newRequest('شاشات عرض لقاعة الاجتماعات');
  const mistakenOfferId = await newOffer(resubmitRequestId, 50000000);
  const mistakenWithdraw = await withdrawOffer(mistakenOfferId, 'خطأ في كتابة السعر');

  const resubmit = await submitOffer(resubmitRequestId, 50000);
  const revivedRow = await db('offers').where({ id: mistakenOfferId }).first();
  check(
    'إعادة تقديم عرض بعد سحبه تنجح بـ 200 والسعر الجديد هو المخزَّن',
    mistakenWithdraw.status === 200 &&
      resubmit.status === 200 &&
      Boolean(revivedRow) &&
      revivedRow.status === 'submitted' &&
      Number(revivedRow.price) === 50000,
    { withdraw: mistakenWithdraw.status, status: resubmit.status, body: resubmit.body }
  );

  const { n: offerRowCount } = await db('offers')
    .where({ request_id: resubmitRequestId, supplier_id: supplier.user.supplier_id })
    .count('* as n')
    .first();
  check(
    'إعادة التقديم تُحيي الصف نفسه: صف واحد لهذا المورد على هذا الطلب',
    Number(offerRowCount) === 1 && Boolean(resubmit.body.offer) && resubmit.body.offer.id === mistakenOfferId,
    { rows: offerRowCount }
  );

  // يقرؤه مالك الشركة المشترية: أحداث العروض تُنسب لشركة الطلب.
  const resubmitAudit = await request(app).get(`/api/audit?entity_id=${mistakenOfferId}`).set(auth(owner.token));
  const resubmittedEvent = (resubmitAudit.body.events || []).find((e) => e.action === 'offer.resubmitted');
  check(
    'السجل يقيّد offer.resubmitted ومعه السعر السابق والجديد',
    Boolean(resubmittedEvent && resubmittedEvent.payload) &&
      resubmittedEvent.payload.previous_price === 50000000 &&
      resubmittedEvent.payload.price === 50000,
    { status: resubmitAudit.status, event: resubmittedEvent }
  );

  // بعد الإحياء يعود القفل: العرض مُقدَّم، فالعرض الثاني عليه يُرفض والسعر لا يتغيّر.
  const secondWhileSubmitted = await submitOffer(resubmitRequestId, 45000);
  const afterSecond = await db('offers').where({ id: mistakenOfferId }).first();
  check(
    'عرض ثانٍ فوق عرض مُقدَّم يُرفض بـ 409',
    secondWhileSubmitted.status === 409 && Number(afterSecond.price) === 50000,
    { status: secondWhileSubmitted.status, body: secondWhileSubmitted.body }
  );

  // closed بلا مسار في الواجهة البرمجية بعد، فتُضبط مباشرة كما تُضبط حالات أخرى في هذه الفحوص.
  const closedRequestId = await newRequest('طاولات اجتماعات');
  const closedOfferId = await newOffer(closedRequestId, 12000);
  await withdrawOffer(closedOfferId, 'تغيّر سعر المصنع');
  await db('requests').where({ id: closedRequestId }).update({ status: 'closed' });
  const afterClose = await submitOffer(closedRequestId, 11000);
  const closedRow = await db('offers').where({ id: closedOfferId }).first();
  check(
    'مورد سحب عرضه ثم أُغلق الطلب لا يعيد التقديم',
    afterClose.status === 409 &&
      Boolean(afterClose.body.error && afterClose.body.error.details) &&
      afterClose.body.error.details.status === 'closed' &&
      closedRow.status === 'withdrawn' &&
      Number(closedRow.price) === 12000,
    { status: afterClose.status, body: afterClose.body, row: closedRow && closedRow.status }
  );

  console.log(`\n${'='.repeat(58)}`);
  console.log(`  نجح: ${passed}    فشل: ${failed}`);
  if (failed) console.log(`  الفاشل: ${failures.join(' | ')}`);
  console.log(`${'='.repeat(58)}\n`);

  await db.destroy();
  process.exit(failed ? 1 : 0);
}

run().catch(async (err) => {
  console.error('\nتوقف الاختبار بخطأ:', err);
  await db.destroy();
  process.exit(1);
});
