'use strict';
/**
 * اختبار المسار الكامل لمنصة مثبت.
 * يشغّل السيناريو على قاعدة بيانات حقيقية بعد المهاجرات والبذور، ويتحقق من:
 *   العزل بين الشركات · حجب العروض الناقصة · فرض السقف والتصعيد ·
 *   منع اعتماد المرء لطلبه · منع المورد غير الموثّق · حصانة سجل التدقيق.
 *
 * التشغيل:  npm run reset && npm test   (داخل apps/api)
 */
const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/db/knex');

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
