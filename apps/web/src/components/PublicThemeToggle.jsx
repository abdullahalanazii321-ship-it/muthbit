import { useTheme } from '../lib/theme.js';
import ThemeIcon from './ThemeIcon.jsx';

// الحلقة كما في صفحة التعريف: نعناعية في الداكن، وبلون الختم في الفاتح (--mb-mkt-mint يتبع الوضع).
const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mkt-mint';

// النصوص العربية — صفحة التعريف تمرّر نسختها الإنجليزية حين تكون بالإنجليزية.
const AR_LABELS = {
  light: { text: 'فاتح', label: 'التبديل إلى الوضع الفاتح' },
  dark: { text: 'داكن', label: 'التبديل إلى الوضع الداكن' }
};

/**
 * زر الوضع في الصفحات العامة: صفحة التعريف (بجوار زر اللغة وبشكله ومقاسه) والباب الأمامي
 * (الدخول · إنشاء الحساب · نسيت كلمة المرور · إعادة التعيين). شكل واحد في الخمس.
 * النص وجهة التبديل كنص زر اللغة، و aria-label الجملة كاملة وفيها النص الظاهر.
 * الرمز زخرفة، ويختفي تحت ٧٦٨ بكسل: بعرضه كان «تسجيل الدخول» في شريط صفحة التعريف ينكسر على سطرين
 * عند ٣٦٠، والنص وحده يكفي كما يكفي «EN». وتحت ٧٦٨ ارتفاعه ٤٦ بكسل (py-3) — هدف لمس.
 */
export default function PublicThemeToggle({ labels = AR_LABELS }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={labels[next].label}
      className={`inline-flex min-w-11 shrink-0 items-center justify-center gap-1.5 rounded border border-mkt-line-strong px-3 py-3 text-sm font-semibold text-mkt-paper transition-colors hover:border-mkt-mint md:min-w-10 md:py-2 ${focusRing}`}
    >
      <ThemeIcon to={next} className="hidden md:block" />
      {labels[next].text}
    </button>
  );
}
