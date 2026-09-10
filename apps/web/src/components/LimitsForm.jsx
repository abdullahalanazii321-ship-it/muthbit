import { useId, useState } from 'react';
import { apiFetch, errorMessage } from '../lib/api.js';
import { APPROVER_ROLES } from '../lib/access.js';
import { roleLabel } from '../lib/labels.js';
import { useResource } from '../lib/useResource.js';
import Alert from './Alert.jsx';
import Button from './Button.jsx';
import Field from './Field.jsx';

const ACTIVE_USER = 'active';
const isCategoriesResponse = (data) => Array.isArray(data?.categories);

function initialForm(current, approverOptions) {
  const savedApprover = current?.approver_user_id ?? '';
  const hasMonthly = current?.monthly_ceiling !== null && current?.monthly_ceiling !== undefined;
  return {
    // PostgreSQL يعيد numeric نصاً ("80000.00")، فيُحوَّل إلى رقم ثم نص حتى يظهر في الحقل «80000».
    perRequest: current ? String(Number(current.per_request_ceiling)) : '',
    monthly: hasMonthly ? String(Number(current.monthly_ceiling)) : '',
    // null في الخادم يعني «كل الفئات»، وهو هنا اختيار فارغ.
    categoryIds: Array.isArray(current?.allowed_category_ids) ? current.allowed_category_ids : [],
    approverId: approverOptions.some((user) => user.id === savedApprover) ? savedApprover : '',
    active: current ? current.active !== false : true
  };
}

/**
 * نموذج سقف مستخدم واحد. الحفظ يستبدل السقف القائم كله (upsert)، لذلك يُملأ بالقيم الحالية أولاً.
 * current: السقف الحالي، أو null إن لم يُضبط بعد.
 * users: مستخدمو الشركة كما جاؤوا من الخادم — منهم تُبنى قائمة المعتمِدين.
 */
export default function LimitsForm({ companyPath, buyer, current, users, onSaved, onCancel }) {
  const idPrefix = useId();
  const ids = {
    perRequest: `${idPrefix}-per-request`,
    monthly: `${idPrefix}-monthly`,
    categories: `${idPrefix}-categories`,
    approver: `${idPrefix}-approver`,
    active: `${idPrefix}-active`,
    activeHint: `${idPrefix}-active-hint`
  };

  // المعتمِد: مستخدم نشط في الشركة بدور يملك قرار الاعتماد، وليس المشتري نفسه.
  // من لا يملك الاعتماد لو عُيّن معتمِداً لعلقت طلبات المشتري بانتظار اعتماد لا يستطيعه أحد.
  const approverOptions = users.filter(
    (user) => user.status === ACTIVE_USER && user.id !== buyer.id && APPROVER_ROLES.includes(user.role)
  );
  const savedApproverUnavailable =
    Boolean(current?.approver_user_id) && !approverOptions.some((user) => user.id === current.approver_user_id);

  const [form, setForm] = useState(() => initialForm(current, approverOptions));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const categories = useResource('/api/categories', isCategoriesResponse);

  const perRequest = Number(form.perRequest);
  const perRequestValid = form.perRequest !== '' && Number.isFinite(perRequest) && perRequest >= 0;
  const monthly = Number(form.monthly);
  const monthlyValid = form.monthly === '' || (Number.isFinite(monthly) && monthly > 0);
  // لا حفظ قبل ظهور الفئات: الاختيار الفارغ يعني «كل الفئات»، فلا يُحفظ اختيار لم يره المستخدم.
  const canSubmit = perRequestValid && monthlyValid && categories.status === 'ready';

  function update(field) {
    return (event) => setForm((currentForm) => ({ ...currentForm, [field]: event.target.value }));
  }

  function toggleCategory(categoryId) {
    setForm((currentForm) => ({
      ...currentForm,
      categoryIds: currentForm.categoryIds.includes(categoryId)
        ? currentForm.categoryIds.filter((id) => id !== categoryId)
        : [...currentForm.categoryIds, categoryId]
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    const body = {
      per_request_ceiling: perRequest,
      // الفارغ null صراحةً: «بلا سقف شهري». لا يُرسل صفراً ولا يُحذف الحقل.
      monthly_ceiling: form.monthly === '' ? null : monthly,
      allowed_category_ids: form.categoryIds,
      approver_user_id: form.approverId || null,
      active: form.active
    };

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`${companyPath}/buyers/${encodeURIComponent(buyer.id)}/limits`, { method: 'PUT', body });
      onSaved();
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      // details في 400 مخرجات تحقق بالإنجليزية فلا تُعرض.
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    // noValidate: فقاعات تحقق المتصفح تظهر بلغته، ونريد رسائل الخادم العربية بدلها.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field
        id={ids.perRequest}
        label="سقف الطلب الواحد (ر.س)"
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={form.perRequest}
        onChange={update('perRequest')}
        disabled={submitting}
        hint={<p className="text-muted">تجاوز هذا السقف لا يمنع الطلب، بل يرفعه لمعتمِد أعلى.</p>}
      />

      <Field
        id={ids.monthly}
        label="السقف الشهري (ر.س)"
        optional
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={form.monthly}
        onChange={update('monthly')}
        disabled={submitting}
        hint={<p className="text-muted">اتركه فارغاً إن لم تُرد سقفاً شهرياً. تجاوز السقف الشهري يمنع الطلب فعلاً.</p>}
      />

      <fieldset className="flex flex-col gap-2" aria-describedby={`${ids.categories}-hint`}>
        <legend className="text-sm font-medium text-ink">
          الفئات المسموحة
          <span className="ms-1 font-normal text-muted">(اختياري)</span>
        </legend>
        <CategoryChoices
          categories={categories}
          selected={form.categoryIds}
          onToggle={toggleCategory}
          disabled={submitting}
        />
        <p id={`${ids.categories}-hint`} className="text-sm text-muted">
          اترك الاختيار فارغاً لتسمح بكل الفئات.
        </p>
      </fieldset>

      <Field
        id={ids.approver}
        as="select"
        label="المعتمِد"
        value={form.approverId}
        onChange={update('approverId')}
        disabled={submitting}
        hint={
          savedApproverUnavailable ? (
            <p className="text-signal">المعتمِد المحفوظ حالياً لم يعد متاحاً للاختيار، فسيُحفظ «تلقائي» ما لم تختر غيره.</p>
          ) : null
        }
      >
        <option value="">تلقائي</option>
        {approverOptions.map((user) => (
          <option key={user.id} value={user.id}>
            {user.full_name} — {roleLabel(user.role)}
          </option>
        ))}
      </Field>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          {/* المفتاح: المقبض في جهة النهاية حين يكون مفعّلاً — justify لا translate، فيصح في الاتجاهين. */}
          <button
            type="button"
            role="switch"
            id={ids.active}
            aria-checked={form.active}
            aria-describedby={ids.activeHint}
            onClick={() => setForm((currentForm) => ({ ...currentForm, active: !currentForm.active }))}
            disabled={submitting}
            className={`flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal disabled:cursor-not-allowed disabled:opacity-60 ${
              form.active ? 'justify-end border-seal bg-seal' : 'justify-start border-line-strong bg-surface-2'
            }`}
          >
            <span className="h-4 w-4 rounded-full bg-surface" />
          </button>
          <label htmlFor={ids.active} className="text-sm font-medium text-ink">
            مفعّل
          </label>
        </div>
        <p id={ids.activeHint} className="text-sm text-muted">
          التعطيل يوقف شراء هذا المستخدم دون إيقاف حسابه.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canSubmit} loading={submitting} loadingText="جارٍ الحفظ…">
          حفظ السقف
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

function CategoryChoices({ categories, selected, onToggle, disabled }) {
  if (categories.status === 'loading') return <p className="text-sm text-muted">جارٍ تحميل الفئات…</p>;
  if (categories.status === 'error') {
    return (
      <p className="text-sm text-signal">
        {categories.error.message}{' '}
        <button type="button" onClick={categories.reload} className="font-medium underline">
          إعادة المحاولة
        </button>
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {categories.data.categories.map((category) => (
        <label key={category.id} className="flex items-center gap-2 text-ink">
          <input
            type="checkbox"
            checked={selected.includes(category.id)}
            onChange={() => onToggle(category.id)}
            disabled={disabled}
            className="h-4 w-4 accent-seal"
          />
          {category.name_ar}
        </label>
      ))}
    </div>
  );
}
