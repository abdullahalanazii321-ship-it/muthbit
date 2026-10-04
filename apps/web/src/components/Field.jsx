import { useEffect, useRef, useState } from 'react';

const controlClasses =
  'w-full rounded border border-line-strong bg-surface px-3 py-2 text-ink focus:border-seal focus:outline-none focus:ring-1 focus:ring-seal disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted';

/**
 * حقل بعنوان. as يحدد العنصر: input (الافتراضي) أو select أو textarea.
 * optional يضيف «(اختياري)» للعنوان، و hint سطر تحت الحقل (تحميل أو خطأ أو إرشاد).
 * type="password" يضيف زر إظهار/إخفاء داخل الحقل في طرفه. onRevealToggle يُنادى عند الضغط عليه.
 */
export default function Field({
  id,
  label,
  as: Control = 'input',
  optional = false,
  hint,
  onRevealToggle,
  children,
  ...controlProps
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const isPassword = Control === 'input' && controlProps.type === 'password';
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="ms-1 font-normal text-muted">(اختياري)</span>}
      </label>
      {isPassword ? (
        <PasswordInput id={id} aria-describedby={hintId} onRevealToggle={onRevealToggle} {...controlProps} />
      ) : (
        <Control id={id} className={controlClasses} aria-describedby={hintId} {...controlProps}>
          {children}
        </Control>
      )}
      {hint && (
        <div id={hintId} className="text-sm">
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * حقل كلمة مرور وزر عين بعده في الترتيب: Tab يصل الحقل أولاً ثم الزر.
 * يبدأ مخفياً، ويعود مخفياً عند إرسال النموذج — فلا تُرسَل الكلمة وهي ظاهرة على الشاشة.
 */
function PasswordInput({ id, dir, disabled, onRevealToggle, ...inputProps }) {
  const inputRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return undefined;
    function hide() {
      // مباشرة على العنصر أيضاً: مدير كلمات المرور يقرأ النوع لحظة الإرسال، قبل أن يُعاد الرسم.
      if (inputRef.current) inputRef.current.type = 'password';
      setVisible(false);
    }
    form.addEventListener('submit', hide);
    return () => form.removeEventListener('submit', hide);
  }, []);

  function toggle() {
    setVisible((current) => !current);
    onRevealToggle?.();
  }

  return (
    // dir الحقل على الغلاف أيضاً: الحقل ltr داخل صفحة rtl، فلو اختلف الاتجاهان لصار end الزر في جهة
    // و pe الحقل في الجهة الأخرى، فيغطّي الزر النص. باتجاه واحد يقعان في الطرف نفسه.
    <div className="relative" dir={dir}>
      <input
        ref={inputRef}
        id={id}
        dir={dir}
        disabled={disabled}
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={`${controlClasses} pe-11`}
      />
      {/* ٤٤×٤٤ في كل المقاسات، متمركز على حقل ارتفاعه ٤٢: يزيد بكسلاً من كل جهة بخلفية شفافة،
          فيبلغ هدف اللمس ولا يتغيّر ارتفاع الحقل. */}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        className="absolute end-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-seal disabled:cursor-not-allowed"
      >
        <EyeIcon crossed={visible} />
      </button>
    </div>
  );
}

// أيقونة خطّية مرسومة هنا (stroke لا fill) على شبكة 24×24 كأيقونات صفحة التعريف — لا مكتبة أيقونات.
// العين تدعو للإظهار، والعين المشطوبة للإخفاء: الأيقونة تقول ما سيحدث عند الضغط.
function EyeIcon({ crossed }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-5"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="m4 4 16 16" />}
    </svg>
  );
}
