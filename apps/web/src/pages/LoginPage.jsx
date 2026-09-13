import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { normalizeUser, useSession } from '../lib/session.js';
import { homeFor } from '../lib/access.js';
import Logo from '../components/Logo.jsx';
import Field from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import Alert from '../components/Alert.jsx';

export default function LoginPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // 429: الخادم حجب المحاولات لكثرتها. نعطّل الزر ونكتفي برسالته —
  // لا مؤقّت تنازلي ولا إعادة محاولة تلقائية.
  const [rateLimited, setRateLimited] = useState(false);

  const isEmpty = email.trim() === '' || password === '';

  async function handleSubmit(event) {
    event.preventDefault();
    if (isEmpty || submitting || rateLimited) return;

    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password }
      });
      signIn(data);
      // كل دور إلى مكانه مباشرة: مسؤول المنصة إلى لوحته، والمورد إلى بوابته، وغيرهما إلى لوحة الشركة.
      navigate(homeFor(normalizeUser(data.user)), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      if (err?.status === 429) setRateLimited(true);
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-12">
      <div className="w-full max-w-measure rounded border border-line bg-surface p-6 sm:p-8">
        {/* القفلة الرأسية: الرمز ثم الاسم تحته.
            aria-hidden على الرمز لأن الاسم مكتوب تحته نصاً مرئياً، وبدونها يُنطق «مثبت» مرتين. */}
        <div className="mb-6 flex flex-col items-start gap-2">
          <Logo size={64} aria-hidden="true" />
          <span className="font-display text-xl font-semibold text-ink">مثبت</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink">تسجيل الدخول</h1>

        {/* noValidate: فقاعة تحقق المتصفح تظهر بلغته، ونريد رسالة الخادم العربية بدلها. */}
        <form noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <Field
            id="email"
            label="البريد الإلكتروني"
            type="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
          <Field
            id="password"
            label="كلمة المرور"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
          />

          {error && <Alert>{error}</Alert>}

          <Button type="submit" disabled={isEmpty || rateLimited} loading={submitting} loadingText="جارٍ التحقق…">
            تسجيل الدخول
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted">
          ليس لديك حساب؟{' '}
          <Link
            to="/register"
            className="rounded-sm font-medium text-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
          >
            سجّل شركتك أو منشأتك
          </Link>
        </p>
      </div>
    </main>
  );
}
