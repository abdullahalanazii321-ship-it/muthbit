# منصة مثبت

منصة مشتريات موثّقة للشركات السعودية. الواجهة عربية بالكامل واتجاهها RTL.

## من يقرأ هذا
المالك غير مبرمج. اشرح كل قرار بالعربية بجملة واحدة قبل أن تنفّذه.
إن غمض شيء: قف واسأل. لا تفترض.

## المكدّس
- `apps/api` — Node 20 + Express + Knex + PostgreSQL 16. **جاهز ومختبر (١٢٦ فحصاً). لا تعدّل أي ملف تحته إلا بطلب صريح مني.**
- `apps/web` — React + Vite + Tailwind. **مبنيّ بالكامل:** ثماني شاشات (الدخول · الطلبات · طلب جديد · تفاصيل الطلب · بوابة المورد · لوحة المنصة · الفريق · سجل التدقيق).
- `packages/design` — توكنز الهوية: `tokens.css` و `tokens.js` و `tailwind.preset.cjs`

## عقد الواجهة البرمجية
- العنوان في التطوير: `http://localhost:4000` — والواجهة على `http://localhost:5173`.
  إن غيّرت منفذ الواجهة، غيّر `CORS_ORIGIN` في `apps/api/.env` معه وإلا رُفض كل نداء.
- كل المسارات تبدأ بـ `/api` عدا `GET /health`.
- المصادقة: `Authorization: Bearer <token>` من `POST /api/auth/login`.
  الوكيل الذكي وحده يستخدم `X-API-Key` ولا واجهة له إطلاقاً.
- **شكل الخطأ ثابت:** `{ "error": { "code": "...", "message": "...", "details": ... } }`
  النص العربي في `error.message` — اعرضه كما هو. إن غاب فاعرض «تعذّر تنفيذ الطلب.» ولا تخترع رسالة.
  الرموز: `bad_request` `unauthorized` `forbidden` `not_found` `conflict` `policy_blocked` `internal_error`.
  `policy_blocked` (٤٢٢) يعني أن السياسة منعت — وليس عطلاً. اعرض `details` معه.
- `401` يعني انتهت الجلسة: امسح الرمز وأعد المستخدم لشاشة الدخول.

## المسارات الموجودة — لا تخترع غيرها
عام بلا رمز: `POST /api/auth/register-company` · `POST /api/auth/login` · `POST /api/suppliers/register` · `GET /health`

```
GET    /api/auth/me
GET    /api/categories
GET    /api/categories/overview                 (platform_admin)
POST   /api/categories                          (platform_admin)
PATCH  /api/categories/:id                      (platform_admin)
GET    /api/suppliers
PATCH  /api/suppliers/:id/verification          (platform_admin)
GET    /api/suppliers/:id/categories            (platform_admin)
GET    /api/companies                           (platform_admin)
PATCH  /api/companies/:id/verification          (platform_admin)
GET    /api/companies/:id/users
POST   /api/companies/:id/users
POST   /api/companies/:id/users/:userId/suspend
POST   /api/companies/:id/users/:userId/activate
GET    /api/companies/:id/buyers/:userId/limits
PUT    /api/companies/:id/buyers/:userId/limits
POST   /api/requests
GET    /api/requests            ?status=
GET    /api/requests/:id
POST   /api/requests/:id/select-offer
POST   /api/requests/:id/decision               { decision, reason }
POST   /api/requests/:id/purchase-order
GET    /api/offers/open-requests                (المورد)
POST   /api/offers                              (المورد)
GET    /api/offers/mine                         (المورد)
POST   /api/offers/:id/withdraw                 (المورد)
GET    /api/audit
```
قبل أي نداء جديد: افتح `apps/api/src/routes` واقرأ الملف. الأسماء حرفية.

## قواعد ملزمة
1. لا تخترع لوناً ولا خطاً ولا مسافة. كل قيمة من `packages/design` عبر Tailwind preset أو متغيّر CSS.
   الألوان المتاحة: `ground` `surface` `surface2` `ink` `muted` `line` `lineStrong` `seal` `sealSoft` `signal` `signalSoft`.
   لون شارة الحالة يؤخذ من خريطة `status` في `tokens.js` — لا تلوّن الحالات يدوياً.
   أي `#RRGGBB` مكتوب داخل `apps/web` خطأ يُصحَّح فوراً.
2. لا تخترع مساراً ولا اسم حقل. اقرأ المسار في `apps/api/src/routes` أولاً واستخدم الأسماء كما هي.
3. كل نص يراه المستخدم بالعربية. أسماء المتغيّرات والملفات بالإنجليزية.
   المبالغ بصيغة `1,250,000 ر.س` والأرقام لاتينية.
4. لا تعدّل `.env` ولا `db/migrations` ولا `db/seeds` ولا `tests` ولا أي ملف تحت `apps/api/src` بدون إذني.
   ولا تضف حزمة جديدة (`npm install`) بدون أن تقول لي لماذا وتنتظر موافقتي.
5. أخطاء الخادم تُعرض كما هي من `error.message` — هي عربية أصلاً. لا تترجمها ولا تلطّفها ولا تبتلعها.
6. في كل شاشة أربع حالات مطلوبة: تحميل · فراغ · خطأ · نجاح. لا شاشة بيضاء ولا زر بلا حالة انتظار.
7. شاشة واحدة في كل مهمة. تبنيها، تريني إياها، تقف. لا تبنِ شاشة لم أطلبها ولو بدت ناقصة.
8. بعد كل تغيير: `npm run api:dev` ثم `npm run web:dev` (بعد إنشاء `apps/web`)، وافتح الشاشة وتأكد أن الطرفية بلا خطأ. ثم `git commit` برسالة عربية قصيرة.
9. اتجاه الصفحة `<html lang="ar" dir="rtl">`. لا تستخدم `left`/`right` في التنسيق — استخدم `start`/`end` المنطقية.

## الأدوار السبعة
| الدور | يفعل |
|---|---|
| `platform_admin` | فريق المنصة: يوثّق الشركات والموردين. لا يُنشأ من داخل شركة |
| `company_owner` | يدير المستخدمين والسقوف، ويعتمد |
| `finance_manager` | يضبط سقوف المشترين، ويعتمد |
| `procurement_manager` | يطلب ويعتمد ويصدر أمر الشراء |
| `procurement_buyer` | يطلب ويختار العرض فقط |
| `ai_agent` | يطلب عبر `X-API-Key` — **بلا شاشة ولا تسجيل دخول** |
| `supplier_admin` | يرى الطلبات المفتوحة ويقدّم العروض ويسحبها |

يمكن إنشاؤها من داخل الشركة أربعة فقط:
`finance_manager` · `procurement_manager` · `procurement_buyer` · `ai_agent`

## حالات الطلب التسع
`draft` مسودة · `sourcing` بانتظار العروض · `pending_approval` بانتظار الاعتماد · `approved` معتمد · `rejected` مرفوض · `ordered` صدر أمر الشراء · `delivered` سُلّم · `closed` مقفل · `cancelled` ملغى

**الانتقالات التي تدعمها الواجهة البرمجية اليوم فقط:**
`POST /api/requests` ← `sourcing` · `select-offer` ← `pending_approval` · `decision` ← `approved` أو `rejected` · `purchase-order` ← `ordered`

`delivered` و `closed` و `cancelled` موجودة في قاعدة البيانات بلا مسار بعد.
اعرضها كحالة، ولا تبنِ لها زراً — الزر الذي لا مسار له كذب على المستخدم.

## قواعد السياسة التي تُظهرها الواجهة ولا تعيد حسابها
الخادم وحده يقرر. الواجهة تعرض قراره:
- مشترٍ بلا سقف مضبوط لا يشتري (`no_limits_configured`).
- فئة خارج المصرّح به: حجب صلب. السقف الشهري: حجب صلب.
- تجاوز سقف الطلب الواحد: **ليس حجباً** — يُرفع للمدير المالي ثم للمالك. اعرضه تنبيهاً بلون `signal` لا رسالة رفض.
- لا أحد يعتمد طلب نفسه.
- العرض الناقص (بلا ضمان أو مدة توريد) لا يصل المشتري.
- المورد لا يرى اسم الشركة الطالبة أبداً. لا تعرضه في أي شاشة مورد.

## التشغيل
```
npm install
npm run api:migrate && npm run api:seed
npm run api:test        # ١٢٦ فحصاً — يجب أن تمر كلها
```
`npm run api:test` **يغيّر بيانات العرض**. بعده شغّل `npm run reset` داخل `apps/api` قبل بناء أي واجهة عليها.

حسابات العرض — كلمة المرور `Test@1234`:
`admin@platform-demo.sa` · `admin@owner-demo.sa` · `admin@finance-demo.sa` · `admin@buyer-demo.sa` · `admin@supplier-demo.sa`
(وشركة ثانية `admin@owner2-demo.sa` · `admin@buyer2-demo.sa` لإثبات العزل بين الشركات)

## المبدأ الحاكم
الافتراض هو المنع. إن غمض شيء، امنع واسأل — لا تسمح.
