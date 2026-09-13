import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { blockedReasons, reasonMessages } from '../lib/policy.js';
import AppHeader from '../components/AppHeader.jsx';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';

/** نموذج إنشاء طلب شراء. الخادم وحده يقرر السياسة؛ الشاشة تعرض قراره. */
export default function NewRequestPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ item: '', quantity: '', categoryId: '', specs: '', neededBy: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const categories = useCategories();

  const quantity = Number(form.quantity);
  const quantityValid = form.quantity !== '' && Number.isInteger(quantity) && quantity >= 1;
  const canSubmit = form.item.trim() !== '' && quantityValid;

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    // الحقول الاختيارية الفارغة لا تُرسل: category_id الفارغ يرفضه الخادم كمعرّف غير صالح.
    const body = { item: form.item.trim(), quantity };
    if (form.categoryId) body.category_id = form.categoryId;
    if (form.specs.trim()) body.specs = form.specs.trim();
    if (form.neededBy) body.needed_by = form.neededBy;

    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch('/api/requests', { method: 'POST', body });
      const warnings = reasonMessages(data?.policy?.reasons);
      navigate('/requests', {
        replace: true,
        state: { created: { reference: data?.request?.reference ?? null, warnings } }
      });
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      // policy_blocked ليس عطلاً: رسالة الخادم ثم أسبابه. أما details في 400 فمخرجات تحقق بالإنجليزية فلا تُعرض.
      setError({
        message: errorMessage(err),
        reasons: blockedReasons(err)
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-2xl font-semibold text-ink">طلب شراء جديد</h1>

        <div className="mt-6 max-w-measure rounded border border-line bg-surface p-6 sm:p-8">
          {/* noValidate: فقاعات تحقق المتصفح تظهر بلغته، ونريد رسائل الخادم العربية بدلها. */}
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field
              id="item"
              label="الصنف"
              value={form.item}
              onChange={update('item')}
              maxLength={300}
              disabled={submitting}
            />
            <Field
              id="quantity"
              label="الكمية"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.quantity}
              onChange={update('quantity')}
              disabled={submitting}
            />
            <Field
              id="category"
              as="select"
              label="الفئة"
              optional
              value={form.categoryId}
              onChange={update('categoryId')}
              disabled={submitting || categories.status === 'loading'}
              hint={<CategoriesHint categories={categories} />}
            >
              <option value="">بلا فئة</option>
              {categories.items.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name_ar}
                </option>
              ))}
            </Field>
            <Field
              id="specs"
              as="textarea"
              label="المواصفات"
              optional
              rows={4}
              maxLength={4000}
              value={form.specs}
              onChange={update('specs')}
              disabled={submitting}
            />
            <Field
              id="needed-by"
              type="date"
              label="مطلوب بحلول"
              optional
              value={form.neededBy}
              onChange={update('neededBy')}
              disabled={submitting}
            />

            {error && <Alert items={error.reasons}>{error.message}</Alert>}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!canSubmit} loading={submitting} loadingText="جارٍ الإرسال…">
                إرسال الطلب
              </Button>
              <Button variant="secondary" onClick={() => navigate('/requests')} disabled={submitting}>
                إلغاء
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

/** الفئات تُحمَّل وحدها ولا توقف النموذج: الفئة اختيارية أصلاً. */
function useCategories() {
  const [state, setState] = useState({ status: 'loading', items: [], message: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState({ status: 'loading', items: [], message: null });
    apiFetch('/api/categories')
      .then((data) => {
        if (!Array.isArray(data?.categories)) throw new Error('unexpected response shape');
        if (!ignore) setState({ status: 'ready', items: data.categories, message: null });
      })
      .catch((error) => {
        if (ignore || error?.status === 401) return;
        setState({ status: 'error', items: [], message: errorMessage(error) });
      });
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  return { ...state, reload: () => setReloadKey((key) => key + 1) };
}

function CategoriesHint({ categories }) {
  if (categories.status === 'loading') return <p className="text-muted">جارٍ تحميل الفئات…</p>;
  if (categories.status === 'error') {
    return (
      <p className="text-signal">
        {categories.message}{' '}
        <button type="button" onClick={categories.reload} className="font-medium underline">
          إعادة المحاولة
        </button>
      </p>
    );
  }
  return null;
}
