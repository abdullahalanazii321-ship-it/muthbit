import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import EntranceShell from '../components/EntranceShell.jsx';
import Field from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import Alert from '../components/Alert.jsx';

const LINK_CLASSES =
  'rounded-sm font-medium text-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal';

/**
 * طلب رابط إعادة التعيين. الخادم يرد الرسالة نفسها دائماً، وجد الحساب أو لم يجده،
 * والشاشة تعرض تلك الرسالة كما وصلت — لا تقول «أرسلنا» ولا «لم نجد».
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // null قبل الإرسال؛ بعده نص الخادم كما هو.
  const [sentMessage, setSentMessage] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || email.trim() === '') return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setSentMessage(typeof data?.message === 'string' ? data.message : '');
    } catch (err) {
      // 400 لبريد مشوّه و 429 للحدّ: رسالة الخادم العربية كما هي.
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <EntranceShell>
      <h1 className="font-display text-2xl font-semibold text-ink">نسيت كلمة المرور</h1>

      {sentMessage !== null ? (
        <div className="mt-8 flex flex-col gap-5">
          {/* الرسالة الموحّدة وحدها: أي سطر بجانبها («تحقّق من بريدك») يوحي بأن الحساب موجود. */}
          {sentMessage && <Alert tone="seal">{sentMessage}</Alert>}
          <Button as={Link} to="/login">
            العودة إلى تسجيل الدخول
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">اكتب بريد حسابك، ونرسل إليه رابطاً تختار به كلمة مرور جديدة.</p>
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

            {error && <Alert>{error}</Alert>}

            <Button type="submit" disabled={email.trim() === ''} loading={submitting} loadingText="جارٍ الإرسال…">
              أرسل رابط إعادة التعيين
            </Button>
          </form>
        </>
      )}

      <p className="mt-6 text-sm text-muted">
        تذكّرت كلمة المرور؟{' '}
        <Link to="/login" className={LINK_CLASSES}>
          تسجيل الدخول
        </Link>
      </p>
    </EntranceShell>
  );
}
