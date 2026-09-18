import { useState } from 'react';
import { apiFetch, errorMessage } from '../lib/api.js';
import Alert from './Alert.jsx';
import Button from './Button.jsx';
import Field from './Field.jsx';

// يُعرض تحت حقلي الضمان ومدة التسليم، وتحت جدول «عروضي» حين يكون فيه عرض ناقص.
export const INCOMPLETE_OFFER_HINT = 'الضمان صفر أو مدة التسليم صفر يجعل العرض ناقصاً فلا يصل المشتري.';

const isZero = (value) => value !== '' && Number(value) === 0;

/**
 * نموذج تقديم عرض لطلب واحد، يظهر داخل بطاقة الطلب.
 * الضمان صفر أو مدة التسليم صفر لا يُمنع: الخادم يقبله عمداً ويحفظه عرضاً ناقصاً،
 * ومهمة النموذج أن يحذّر لا أن يمنع. الزر يُعطَّل بسبب السعر وحده.
 */
export default function OfferForm({ requestId, onSubmitted, onCancel }) {
  const [form, setForm] = useState({ price: '', warranty: '', leadDays: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const price = Number(form.price);
  const priceValid = form.price !== '' && Number.isFinite(price) && price > 0;
  const hasZeroTerm = isZero(form.warranty) || isZero(form.leadDays);
  const ids = {
    price: `offer-${requestId}-price`,
    warranty: `offer-${requestId}-warranty`,
    leadDays: `offer-${requestId}-lead-days`,
    notes: `offer-${requestId}-notes`,
    termsHint: `offer-${requestId}-terms-hint`
  };

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!priceValid || submitting) return;

    // الحقل الفارغ لا يُرسل ولا يتحوّل صفراً: Number('') يساوي 0، فيصنع عرضاً ناقصاً لم يقصده المورد.
    // الخادم يرفض الحقل الغائب برسالته.
    const body = { request_id: requestId, price };
    if (form.warranty !== '') body.warranty_months = Number(form.warranty);
    if (form.leadDays !== '') body.lead_days = Number(form.leadDays);
    if (form.notes.trim()) body.specs = form.notes.trim();

    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch('/api/offers', { method: 'POST', body });
      onSubmitted({ complete: data?.complete === true, message: data?.message ?? null });
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
        id={ids.price}
        label="السعر (ر.س)"
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={form.price}
        onChange={update('price')}
        disabled={submitting}
      />

      <div className="flex flex-col gap-2">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id={ids.warranty}
            label="الضمان (بالأشهر)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={form.warranty}
            onChange={update('warranty')}
            disabled={submitting}
            aria-describedby={ids.termsHint}
          />
          <Field
            id={ids.leadDays}
            label="مدة التسليم (بالأيام)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={form.leadDays}
            onChange={update('leadDays')}
            disabled={submitting}
            aria-describedby={ids.termsHint}
          />
        </div>
        {/* السطر دائم، ويتحوّل إلى لون signal حين يُكتب صفر في أحد الحقلين. */}
        <p id={ids.termsHint} className={`text-sm ${hasZeroTerm ? 'text-signal' : 'text-muted'}`}>
          {INCOMPLETE_OFFER_HINT}
        </p>
      </div>

      <Field
        id={ids.notes}
        as="textarea"
        label="ملاحظات"
        optional
        rows={3}
        maxLength={4000}
        value={form.notes}
        onChange={update('notes')}
        disabled={submitting}
      />

      {error && <Alert>{error}</Alert>}

      {/* الإرسال والإلغاء متجاوران على الحاسب، ومكدّسان بعرض الشاشة على الجوال:
          المورد يضغط واقفاً، و«إلغاء» بجوار «إرسال» بعرض إصبع خسارةٌ لعرض كُتب كاملاً. */}
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:gap-3">
        <Button
          type="submit"
          className="w-full md:w-auto"
          disabled={!priceValid}
          loading={submitting}
          loadingText="جارٍ الإرسال…"
        >
          إرسال العرض
        </Button>
        <Button variant="secondary" className="w-full md:w-auto" onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
