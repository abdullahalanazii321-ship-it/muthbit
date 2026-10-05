/**
 * مفتاح تشغيل وإيقاف (role="switch") — المقبض في جهة النهاية حين يكون مفعّلاً: justify لا translate، فيصح في الاتجاهين.
 * كان داخل LimitsForm؛ صار مشتركاً لشاشة «مسؤولو المنصة» بالشكل نفسه حرفياً.
 */
export default function Switch({ id, checked, onClick, disabled = false, describedBy }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-describedby={describedBy}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'justify-end border-seal bg-seal' : 'justify-start border-line-strong bg-surface-2'
      }`}
    >
      <span className="h-4 w-4 rounded-full bg-surface" />
    </button>
  );
}
