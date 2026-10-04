import Logo from './Logo.jsx';

/**
 * إطار الباب الأمامي لشاشتي «نسيت كلمة المرور» و«إعادة التعيين»: تعتيم شاشة الدخول وبطاقتها وقفلتها حرفياً.
 * mb-entrance: رموز المنصة بقيم داكنة داخل هذه الشاشات وحدها (tokens.css).
 * break-words موروثة: رسالة خادم طويلة بلا مسافة لا تمدّ الصفحة أفقياً.
 * والقفلة الرأسية كما في الدخول: aria-hidden على الرمز لأن الاسم مكتوب تحته نصاً.
 */
export default function EntranceShell({ children }) {
  return (
    <main className="mb-entrance flex min-h-screen items-center justify-center break-words bg-ground px-4 py-12">
      <div className="w-full max-w-measure rounded border border-line bg-surface p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-start gap-2">
          <Logo size={64} onDark aria-hidden="true" />
          <span className="font-display text-xl font-semibold text-ink">مثبت</span>
        </div>
        {children}
      </div>
    </main>
  );
}
