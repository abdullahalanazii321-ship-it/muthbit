const controlClasses =
  'w-full rounded border border-line-strong bg-surface px-3 py-2 text-ink focus:border-seal focus:outline-none focus:ring-1 focus:ring-seal disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted';

/**
 * حقل بعنوان. as يحدد العنصر: input (الافتراضي) أو select أو textarea.
 * optional يضيف «(اختياري)» للعنوان، و hint سطر تحت الحقل (تحميل أو خطأ أو إرشاد).
 */
export default function Field({ id, label, as: Control = 'input', optional = false, hint, children, ...controlProps }) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="ms-1 font-normal text-muted">(اختياري)</span>}
      </label>
      <Control id={id} className={controlClasses} aria-describedby={hintId} {...controlProps}>
        {children}
      </Control>
      {hint && (
        <div id={hintId} className="text-sm">
          {hint}
        </div>
      )}
    </div>
  );
}
