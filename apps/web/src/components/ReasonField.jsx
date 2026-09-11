import Field from './Field.jsx';

// حدّ الخادم نفسه — requireReason في companies.routes.js و suppliers.routes.js.
export const MIN_REASON = 5;
const MAX_REASON = 500;

/** هل بلغ السبب حدّ الخادم؟ به تُعطَّل أزرار التأكيد، فيظهر المنع قبل الضغط لا بعده. */
export function reasonReady(value) {
  return value.trim().length >= MIN_REASON;
}

/**
 * حقل سبب الإيقاف أو الرفض. مطلوب دائماً — لا كلمة «اختياري»:
 * الفعل يلغي ويجمّد ويسحب، ولا يُترك فعل بهذا الأثر بلا سبب.
 * وتحته ما يحدث للسبب بعد الإرسال، فيكتبه صاحبه وهو يعرف أنه يبقى.
 */
export default function ReasonField({ id, label, value, onChange, disabled = false, note }) {
  return (
    <Field
      id={id}
      as="textarea"
      label={label}
      rows={3}
      maxLength={MAX_REASON}
      value={value}
      onChange={onChange}
      disabled={disabled}
      hint={
        <>
          <p className="text-muted">يُحفظ في سجل التدقيق ولا يمكن تعديله لاحقاً.</p>
          {note && <p className="mt-1 text-muted">{note}</p>}
        </>
      }
    />
  );
}
