import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { isPasswordValid, passwordMessage } from '../lib/passwordPolicy.js';
import Logo from '../components/Logo.jsx';
import Field from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import Alert from '../components/Alert.jsx';
import Detail from '../components/Detail.jsx';
import PasswordRules from '../components/PasswordRules.jsx';

/**
 * نوعا الحساب. path والمفاتيح حرفياً كما في مخططي zod في الخادم:
 * auth.routes.js ← { company, owner } · suppliers.routes.js ← { supplier, admin }.
 * والرد يعيد المنشأة تحت entityKey نفسه.
 */
const KINDS = {
  company: {
    title: 'شركة مشترية',
    description: 'نريد أن نشتري عبر المنصة.',
    path: '/api/auth/register-company',
    entityKey: 'company',
    personKey: 'owner',
    entityLegend: 'بيانات الشركة',
    personLegend: 'بيانات المالك',
    entityNameLabel: 'اسم الشركة',
    personNameLabel: 'اسم المالك الكامل',
    withCategories: false
  },
  supplier: {
    title: 'مورد',
    description: 'نريد أن نبيع للشركات.',
    path: '/api/suppliers/register',
    entityKey: 'supplier',
    personKey: 'admin',
    entityLegend: 'بيانات المنشأة',
    personLegend: 'بيانات المسؤول',
    entityNameLabel: 'اسم المنشأة',
    personNameLabel: 'اسم المسؤول الكامل',
    withCategories: true
  }
};
const KIND_KEYS = Object.keys(KINDS);

// حدود مخططي التسجيل في الخادم — متطابقة في المسارين.
const NAME_MIN = 2;
const ENTITY_NAME_MAX = 200;
const VAT_MAX = 20;
const CITY_MAX = 80;
const PERSON_NAME_MAX = 160;
const PHONE_MAX = 30;
// حدّ الفئة المقترحة بعد التشذيب — في مخطط المورد وحده.
const SUGGESTED_CATEGORY_MIN = 2;
const SUGGESTED_CATEGORY_MAX = 100;

const CR_PATTERN = /^\d{10}$/;
// نمط zod نفسه (node_modules/zod/v3/types.js) منسوخاً حرفياً: لا يقبل النموذج بريداً يرفضه الخادم.
// eslint-disable-next-line no-useless-escape
const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;

// رسائل التحقق قبل الإرسال. ما له نص عربي في الخادم منسوخ منه كما هو،
// فلا يرى المستخدم صيغتين للقاعدة نفسها.
const MESSAGES = {
  required: 'هذا الحقل مطلوب.',
  nameTooShort: 'حرفان على الأقل.',
  crNumber: 'السجل التجاري يجب أن يكون 10 أرقام.',
  email: 'البريد الإلكتروني غير صحيح.',
  passwordMismatch: 'كلمتا المرور غير متطابقتين.',
  categories: 'اختر فئة واحدة على الأقل، أو اكتب فئتك إن لم تجدها.',
  suggestedCategory: 'الفئة المقترحة من 2 إلى 100 محرف.'
};

const EMPTY_FORM = {
  entityName: '',
  crNumber: '',
  vatNumber: '',
  city: '',
  // نموذج المورد وحده، وحين يُحدَّد «أخرى».
  suggestedCategory: '',
  fullName: '',
  email: '',
  phone: '',
  password: '',
  passwordConfirm: ''
};

// ترتيب الحقول في الشاشة: عند الخطأ يذهب التركيز إلى أول حقل ناقص من الأعلى.
const FIELD_ORDER = [
  'entityName',
  'crNumber',
  'vatNumber',
  'city',
  'categories',
  'suggestedCategory',
  'fullName',
  'email',
  'phone',
  'password',
  'passwordConfirm'
];
// المعرّفات ثابتة: الصفحة لا تعرض إلا نموذجاً واحداً في كل مرة. وللفئات يحمله أول مربع.
const fieldId = (name) => `register-${name}`;

const NUMERIC_FIELDS = new Set(['crNumber', 'vatNumber', 'phone']);

/**
 * الأرقام المشرقية (٠١٢…) والفارسية (۰۱۲…) تتحوّل لاتينية لحظة الكتابة:
 * لوحة المفاتيح العربية تكتب المشرقية، والخادم لا يقبل غير اللاتينية في السجل التجاري —
 * فيرى المستخدم ما سيُرسل فعلاً بدل رسالة «10 أرقام» وقد كتب عشرة.
 */
function toLatinDigits(value) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/**
 * choice: null لنموذج الشركة (بلا فئات)، ولنموذج المورد { slugs, other }:
 * المختار من القائمة، وهل حُدّد «أخرى». الحدّ ورسالته كما في مخطط الخادم.
 */
function validate(form, choice) {
  const errors = {};
  const present = (name, value) => {
    if (!value) errors[name] = MESSAGES.required;
    return Boolean(value);
  };

  const entityName = form.entityName.trim();
  if (present('entityName', entityName) && entityName.length < NAME_MIN) errors.entityName = MESSAGES.nameTooShort;

  const crNumber = form.crNumber.trim();
  if (present('crNumber', crNumber) && !CR_PATTERN.test(crNumber)) errors.crNumber = MESSAGES.crNumber;

  // «أخرى» محدَّد: حقله مطلوب ويُحدّ طوله. غير محدَّد: فئة واحدة من القائمة على الأقل.
  if (choice?.other) {
    const suggested = form.suggestedCategory.trim();
    if (
      present('suggestedCategory', suggested) &&
      (suggested.length < SUGGESTED_CATEGORY_MIN || suggested.length > SUGGESTED_CATEGORY_MAX)
    ) {
      errors.suggestedCategory = MESSAGES.suggestedCategory;
    }
  } else if (choice && choice.slugs.length === 0) {
    errors.categories = MESSAGES.categories;
  }

  const fullName = form.fullName.trim();
  if (present('fullName', fullName) && fullName.length < NAME_MIN) errors.fullName = MESSAGES.nameTooShort;

  const email = form.email.trim();
  if (present('email', email) && !EMAIL_PATTERN.test(email)) errors.email = MESSAGES.email;

  // الرسالة تسمّي الشروط الناقصة بنصّ الخادم نفسه.
  if (present('password', form.password) && !isPasswordValid(form.password)) {
    errors.password = passwordMessage(form.password);
  }

  if (present('passwordConfirm', form.passwordConfirm) && form.passwordConfirm !== form.password) {
    errors.passwordConfirm = MESSAGES.passwordMismatch;
  }

  return errors;
}

// الحقل الاختياري الفارغ لا يُرسل أصلاً (undefined يسقط من JSON)، والخادم يخزّنه null.
const optionalValue = (value) => value.trim() || undefined;

/** الجسم بالشكل الذي يطلبه الخادم حرفياً. تأكيد كلمة المرور لا يُرسل. */
function buildBody(kind, form, slugs) {
  const entity = {
    name: form.entityName.trim(),
    cr_number: form.crNumber.trim(),
    vat_number: optionalValue(form.vatNumber),
    city: optionalValue(form.city)
  };
  if (kind.withCategories) {
    entity.category_slugs = slugs;
    // الحقل يُفرَّغ مع إلغاء «أخرى»، فالفارغ لا يُرسل والخادم يخزّن null.
    entity.suggested_category = optionalValue(form.suggestedCategory);
  }

  return {
    [kind.entityKey]: entity,
    [kind.personKey]: {
      full_name: form.fullName.trim(),
      email: form.email.trim(),
      phone: optionalValue(form.phone),
      password: form.password
    }
  };
}

const ARABIC_TEXT = /[؀-ۿ]/;
const NO_GROUP_ERRORS = { entity: [], person: [] };

/**
 * رسائل 400 من الخادم لمجموعة واحدة من الجسم.
 * details هو zod.flatten() على مخطط متداخل، فمفاتيح fieldErrors هي مجموعتا الجسم (company/owner …)
 * لا أسماء الحقول — flatten يقف عند المستوى الأول ولا يحفظ المسار. فتُعرض الرسالة تحت عنوان مجموعتها.
 * ويُعرض منها العربي وحده: رسائل zod الافتراضية إنجليزية، والرسالة العامة فوق الزر تغني عنها.
 */
function serverGroupMessages(details, key) {
  const list = details?.fieldErrors?.[key];
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((text) => typeof text === 'string' && ARABIC_TEXT.test(text)))];
}

const LINK_CLASSES =
  'rounded-sm font-medium text-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal';

/**
 * إنشاء حساب لزائر بلا جلسة: اختيار النوع، ثم نموذجه في الصفحة نفسها، ثم شاشة «بانتظار التوثيق».
 * النوع محفوظ في العنوان (?type=) كتبويب لوحة المنصة، فزر الرجوع في المتصفح يعيد إلى الاختيار.
 * لا رمز في رد التسجيل ولا دخول بعده: الحساب pending حتى يوثّقه فريق المنصة.
 */
export default function RegisterPage() {
  const [params, setParams] = useSearchParams();
  const requestedKind = params.get('type');
  const kindKey = KIND_KEYS.includes(requestedKind) ? requestedKind : null;

  const [result, setResult] = useState(null);
  // 429 على مستوى الصفحة لا النموذج: عدّاد إنشاء الحساب في الخادم واحد للمسارين،
  // فتبديل النوع لا يعيد تفعيل الزر.
  const [rateLimitMessage, setRateLimitMessage] = useState(null);

  // mb-entrance: الباب الأمامي داكن كصفحة التعريف — رموز المنصة بقيم داكنة داخل هذه الشاشة وحدها (tokens.css).
  return (
    <main className="mb-entrance flex min-h-screen items-center justify-center bg-ground px-4 py-12">
      <div className="w-full max-w-measure rounded border border-line bg-surface p-6 sm:p-8">
        {/* القفلة نفسها في شاشة الدخول: الرمز ثم الاسم تحته، و aria-hidden لأن الاسم مكتوب نصاً. */}
        <div className="mb-6 flex flex-col items-start gap-2">
          <Logo size={64} onDark aria-hidden="true" />
          <span className="font-display text-xl font-semibold text-ink">مثبت</span>
        </div>

        {result ? (
          <RegistrationReceived result={result} />
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold text-ink">إنشاء حساب</h1>

            {kindKey ? (
              <RegistrationForm
                key={kindKey}
                kind={KINDS[kindKey]}
                onChangeKind={() => setParams({})}
                onRegistered={setResult}
                rateLimitMessage={rateLimitMessage}
                onRateLimited={setRateLimitMessage}
              />
            ) : (
              <KindChooser onChoose={(key) => setParams({ type: key })} />
            )}

            <p className="mt-8 text-sm text-muted">
              لديك حساب؟{' '}
              <Link to="/login" className={LINK_CLASSES}>
                تسجيل الدخول
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function KindChooser({ onChoose }) {
  return (
    <div className="mt-6">
      <p id="register-kind-label" className="text-ink">
        اختر نوع الحساب:
      </p>
      <div role="group" aria-labelledby="register-kind-label" className="mt-3 grid gap-3 sm:grid-cols-2">
        {KIND_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onChoose(key)}
            className="flex flex-col items-start gap-1 rounded border border-line-strong bg-surface p-4 text-start transition-colors hover:border-seal hover:bg-seal-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
          >
            <span className="font-display text-lg font-semibold text-ink">{KINDS[key].title}</span>
            <span className="text-sm text-muted">{KINDS[key].description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RegistrationForm({ kind, onChangeKind, onRegistered, rateLimitMessage, onRateLimited }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedSlugs, setSelectedSlugs] = useState([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [groupErrors, setGroupErrors] = useState(NO_GROUP_ERRORS);
  // { status, message } — status لتمييز 409 الذي يحمل رابط الدخول تحته.
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const categories = usePublicCategories(kind.withCategories);

  // المورد بلا فئات محمّلة لا يُرسل: تعذّر جلبها، أو ما زالت تُحمَّل، أو القائمة فارغة.
  const categoriesBlocked =
    kind.withCategories && !(categories.status === 'ready' && categories.items.length > 0);
  // والزر معطّل كذلك حتى يختار المورد فئة من القائمة أو يكتب فئته في «أخرى».
  const categoriesMissing =
    kind.withCategories && selectedSlugs.length === 0 && !(otherChecked && form.suggestedCategory.trim());

  function update(name) {
    return (event) => {
      const value = NUMERIC_FIELDS.has(name) ? toLatinDigits(event.target.value) : event.target.value;
      setForm((current) => ({ ...current, [name]: value }));
      setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
    };
  }

  function toggleCategory(slug) {
    setSelectedSlugs((current) => (current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]));
    setFieldErrors((current) => (current.categories ? { ...current, categories: undefined } : current));
  }

  // الإلغاء يُخفي الحقل ويُفرغه: لا يُرسل نص لم يعد صاحبه يراه.
  function toggleOther() {
    setOtherChecked((current) => !current);
    setForm((current) => ({ ...current, suggestedCategory: '' }));
    setFieldErrors((current) => ({ ...current, categories: undefined, suggestedCategory: undefined }));
  }

  // ما يشترك فيه كل حقل: المعرّف والقيمة والتعطيل، وتحته رسالة خطئه أو إرشاده.
  function fieldProps(name, note, { keepNote = false } = {}) {
    const error = fieldErrors[name];
    const errorLine = error ? <p className="text-signal">{error}</p> : null;
    return {
      id: fieldId(name),
      value: form[name],
      onChange: update(name),
      disabled: submitting,
      'aria-invalid': error ? true : undefined,
      // keepNote لقائمة شروط كلمة المرور: تبقى تحت الخطأ لأنها هي التي تقول كيف يُصلَح.
      hint: keepNote ? (
        <>
          {errorLine}
          {note}
        </>
      ) : (
        errorLine || note
      )
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || rateLimitMessage || categoriesBlocked) return;

    // بترتيب القائمة لا بترتيب النقر، ومما وصل من الخادم وحده.
    const slugs = categories.items.filter((item) => selectedSlugs.includes(item.slug)).map((item) => item.slug);
    const errors = validate(form, kind.withCategories ? { slugs, other: otherChecked } : null);
    setFieldErrors(errors);
    setGroupErrors(NO_GROUP_ERRORS);
    setServerError(null);

    const firstInvalid = FIELD_ORDER.find((name) => errors[name]);
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    const body = buildBody(kind, form, slugs);
    setSubmitting(true);
    try {
      const data = await apiFetch(kind.path, { method: 'POST', body });
      const entity = data?.[kind.entityKey];
      onRegistered({
        message: typeof data?.message === 'string' ? data.message : null,
        nameLabel: kind.entityNameLabel,
        name: entity?.name ?? body[kind.entityKey].name,
        // الخادم لا يعيد cr_number في رد التسجيل، ويخزّن ما أُرسل كما هو بلا تحويل —
        // فالمعروض هو المخزَّن حرفاً بحرف.
        crNumber: body[kind.entityKey].cr_number,
        // وكذلك الفئة المقترحة: الخادم يشذّبها كما شُذّبت هنا، فالمعروض هو المخزَّن.
        suggestedCategory: body[kind.entityKey].suggested_category ?? null
      });
    } catch (err) {
      setSubmitting(false);
      if (err?.status === 429) {
        onRateLimited(errorMessage(err));
        return;
      }
      setServerError({ status: err?.status ?? 0, message: errorMessage(err) });
      if (err?.status === 400) {
        setGroupErrors({
          entity: serverGroupMessages(err.details, kind.entityKey),
          person: serverGroupMessages(err.details, kind.personKey)
        });
      }
    }
  }

  return (
    // noValidate: فقاعات تحقق المتصفح تظهر بلغته، ونريد رسائلنا ورسائل الخادم العربية بدلها.
    <form noValidate onSubmit={handleSubmit} className="mt-6 flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
        <p className="text-sm text-ink">
          نوع الحساب: <span className="font-semibold">{kind.title}</span>
        </p>
        <Button variant="secondary" onClick={onChangeKind} disabled={submitting}>
          تغيير النوع
        </Button>
      </div>

      <FieldGroup legend={kind.entityLegend} messages={groupErrors.entity}>
        <Field
          label={kind.entityNameLabel}
          autoComplete="organization"
          autoFocus
          maxLength={ENTITY_NAME_MAX}
          {...fieldProps('entityName')}
        />
        <Field
          label="السجل التجاري"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          {...fieldProps('crNumber', <p className="text-muted">10 أرقام.</p>)}
        />
        <Field label="الرقم الضريبي" optional dir="ltr" autoComplete="off" maxLength={VAT_MAX} {...fieldProps('vatNumber')} />
        <Field label="المدينة" optional autoComplete="address-level2" maxLength={CITY_MAX} {...fieldProps('city')} />
        {kind.withCategories && (
          <CategoriesPicker
            categories={categories}
            selected={selectedSlugs}
            onToggle={toggleCategory}
            other={otherChecked}
            onToggleOther={toggleOther}
            error={fieldErrors.categories}
            disabled={submitting}
          >
            {otherChecked && (
              <Field
                label="اكتب فئتك"
                autoComplete="off"
                {...fieldProps('suggestedCategory', <p className="text-muted">سنراجعها قبل التفعيل.</p>)}
              />
            )}
          </CategoriesPicker>
        )}
      </FieldGroup>

      <FieldGroup legend={kind.personLegend} messages={groupErrors.person}>
        <Field label={kind.personNameLabel} autoComplete="name" maxLength={PERSON_NAME_MAX} {...fieldProps('fullName')} />
        <Field label="البريد الإلكتروني" type="email" dir="ltr" autoComplete="email" {...fieldProps('email')} />
        <Field label="الجوال" optional type="tel" dir="ltr" autoComplete="tel" maxLength={PHONE_MAX} {...fieldProps('phone')} />
        {/* بلا maxLength عمداً: القصّ الصامت يجعل المستخدم يظن أنه ضبط كلمة أطول مما حُفظ.
            الطول الأقصى شرط في القائمة يظهر غير محقّق، والخادم يرفض. */}
        <Field
          label="كلمة المرور"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          {...fieldProps('password', <PasswordRules value={form.password} />, { keepNote: true })}
        />
        <Field
          label="تأكيد كلمة المرور"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          {...fieldProps('passwordConfirm')}
        />
      </FieldGroup>

      <div className="flex flex-col items-stretch gap-3">
        {rateLimitMessage ? (
          <Alert>{rateLimitMessage}</Alert>
        ) : (
          serverError && (
            <div className="flex flex-col items-start gap-2">
              <div className="self-stretch">
                <Alert>{serverError.message}</Alert>
              </div>
              {serverError.status === 409 && (
                <Link to="/login" className={`text-sm ${LINK_CLASSES}`}>
                  الذهاب إلى تسجيل الدخول
                </Link>
              )}
            </div>
          )
        )}

        <Button
          type="submit"
          disabled={Boolean(rateLimitMessage) || categoriesBlocked || categoriesMissing}
          loading={submitting}
          loadingText="جارٍ الإرسال…"
        >
          إرسال طلب التسجيل
        </Button>
        {/* الزر المعطّل يقول لماذا، وإلا ظن المورد المنصة معطّلة. */}
        {categoriesMissing && !categoriesBlocked && !rateLimitMessage && (
          <p className="text-sm text-muted">{MESSAGES.categories}</p>
        )}
      </div>
    </form>
  );
}

function FieldGroup({ legend, messages, children }) {
  return (
    <div className="border-t border-line pt-6">
      <fieldset className="min-w-0">
        <legend className="font-display text-lg font-semibold text-ink">{legend}</legend>
        {messages.length > 0 && (
          <div className="mt-3">
            <Alert items={messages} />
          </div>
        )}
        <div className="mt-4 flex flex-col gap-5">{children}</div>
      </fieldset>
    </div>
  );
}

/**
 * مربعات اختيار متعددة لا قائمة منسدلة: المورد يرى الفئات كلها أمامه ويختار ما يخدمه.
 * وتحتها «أخرى» لمن لم يجد فئته، و children حقلها النصي حين يُحدَّد.
 */
function CategoriesPicker({ categories, selected, onToggle, other, onToggleOther, error, disabled, children }) {
  const errorId = `${fieldId('categories')}-error`;
  return (
    <fieldset className="min-w-0" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium text-ink">الفئات</legend>

      {categories.status === 'loading' && (
        <p role="status" className="mt-2 text-sm text-muted">
          جارٍ تحميل الفئات…
        </p>
      )}

      {categories.status === 'error' && (
        <div className="mt-2 flex flex-col items-start gap-3">
          <div className="self-stretch">
            <Alert>{categories.message}</Alert>
          </div>
          <p className="text-sm text-muted">لا يمكن إرسال التسجيل قبل تحميل الفئات.</p>
          <Button variant="secondary" onClick={categories.reload}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {categories.status === 'ready' && categories.items.length === 0 && (
        <p className="mt-2 text-sm text-signal">لا توجد فئات في المنصة بعد، فلا يمكن تسجيل مورد الآن.</p>
      )}

      {categories.status === 'ready' && categories.items.length > 0 && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {categories.items.map((category, index) => (
              <label key={category.slug} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  id={index === 0 ? fieldId('categories') : undefined}
                  className="size-4 rounded-sm border-line-strong accent-seal"
                  checked={selected.includes(category.slug)}
                  onChange={() => onToggle(category.slug)}
                  disabled={disabled}
                />
                {category.name_ar}
              </label>
            ))}
          </div>

          {/* تحت الشبكة لا بين فئاتها: ما يُكتب هنا اقتراح يراجعه فريق المنصة، لا فئة تُختار. */}
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 rounded-sm border-line-strong accent-seal"
              checked={other}
              onChange={onToggleOther}
              disabled={disabled}
            />
            أخرى
          </label>
          {children && <div className="mt-3">{children}</div>}
        </>
      )}

      {error && (
        <p id={errorId} className="mt-2 text-sm text-signal">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * الفئات لزائر بلا جلسة. لا يُستعمل useResource هنا: ذاك يسكت عن 401 لأن api.js يُنهي الجلسة عندها،
 * وهنا لا جلسة أصلاً — فأي فشل (ومنه 401 إن سبقت الواجهةُ الخادمَ في النشر) يُعرض خطأً ويُعطّل الإرسال
 * بدل تحميل لا ينتهي.
 */
function usePublicCategories(enabled) {
  const [state, setState] = useState({ status: enabled ? 'loading' : 'idle', items: [], message: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let ignore = false;
    setState({ status: 'loading', items: [], message: null });
    apiFetch('/api/categories')
      .then((data) => {
        if (!Array.isArray(data?.categories)) throw new Error('unexpected response shape');
        if (!ignore) setState({ status: 'ready', items: data.categories, message: null });
      })
      .catch((error) => {
        if (!ignore) setState({ status: 'error', items: [], message: errorMessage(error) });
      });
    return () => {
      ignore = true;
    };
  }, [enabled, attempt]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, reload };
}

/**
 * بعد 201: الحساب pending ولا رمز في الرد. الشاشة تقول صراحةً إن الدخول لن يعمل بعد،
 * وإلا جرّب المستخدم الدخول فرُفض فظن المنصة معطّلة.
 */
function RegistrationReceived({ result }) {
  const headingRef = useRef(null);
  // الشاشة تحلّ محل النموذج، فينتقل التركيز إلى عنوانها لا يضيع مع زر اختفى.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="register-received-title">
      <h1
        id="register-received-title"
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-semibold text-ink focus:outline-none"
      >
        بانتظار التوثيق
      </h1>

      <div className="mt-6 flex flex-col gap-3">
        {result.message && <Alert tone="seal">{result.message}</Alert>}
        <Alert>لن يعمل تسجيل الدخول قبل اكتمال التوثيق. سنراجع طلبك ونفعّل الحساب.</Alert>
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <Detail label={result.nameLabel}>{result.name}</Detail>
        <Detail label="السجل التجاري">
          <bdi className="font-mono">{result.crNumber}</bdi>
        </Detail>
      </dl>

      {result.suggestedCategory && (
        <p className="mt-6 text-sm text-ink">
          فئتك المقترحة: <bdi className="font-semibold">{result.suggestedCategory}</bdi> — سنراجعها ونربطها بالفئة
          المناسبة.
        </p>
      )}

      <Button as={Link} to="/login" className="mt-8">
        العودة إلى تسجيل الدخول
      </Button>
    </section>
  );
}
