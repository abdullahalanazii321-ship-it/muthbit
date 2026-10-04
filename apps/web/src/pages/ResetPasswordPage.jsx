import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { isPasswordValid, passwordMessage } from '../lib/passwordPolicy.js';
import EntranceShell from '../components/EntranceShell.jsx';
import Field from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import Alert from '../components/Alert.jsx';
import PasswordRules from '../components/PasswordRules.jsx';

// نص شاشة التسجيل نفسه للقاعدة نفسها.
const MISMATCH_MESSAGE = 'كلمتا المرور غير متطابقتين.';

/**
 * الرمز بعد # في رابط البريد: ما بعد # لا يصل أي خادم، فلا يظهر في سجلات الاستضافة.
 * يُقرأ مرة عند فتح الشاشة.
 */
function readTokenFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(hash).get('token') || '';
}

/** إعادة التعيين بالرمز. بعد النجاح: إلى شاشة الدخول ومعها رسالة الخادم. */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [token] = useState(readTokenFromHash);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // الرمز محفوظ في الحالة، فيُمسح من شريط العنوان: لا يبقى في سجل المتصفح ولا في لقطة شاشة.
  useEffect(() => {
    if (window.location.hash) navigate('/reset-password', { replace: true });
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const errors = {};
    if (!isPasswordValid(password)) errors.password = passwordMessage(password);
    if (confirm !== password) errors.confirm = MISMATCH_MESSAGE;
    setFieldErrors(errors);
    setError(null);
    if (errors.password) {
      document.getElementById('new-password')?.focus();
      return;
    }
    if (errors.confirm) {
      document.getElementById('confirm-password')?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch('/api/auth/reset-password', { method: 'POST', body: { token, password } });
      navigate('/login', { replace: true, state: { notice: typeof data?.message === 'string' ? data.message : null } });
    } catch (err) {
      setError({ message: errorMessage(err), invalidLink: err?.status === 400 });
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <EntranceShell>
        <h1 className="font-display text-2xl font-semibold text-ink">إعادة تعيين كلمة المرور</h1>
        <div className="mt-8 flex flex-col gap-5">
          <Alert>الرابط ناقص: افتحه من رسالة البريد كما هو، أو اطلب رابطاً جديداً.</Alert>
          <Button as={Link} to="/forgot-password">
            اطلب رابطاً جديداً
          </Button>
        </div>
      </EntranceShell>
    );
  }

  const errorLine = (name) => (fieldErrors[name] ? <p className="text-signal">{fieldErrors[name]}</p> : null);

  return (
    <EntranceShell>
      <h1 className="font-display text-2xl font-semibold text-ink">إعادة تعيين كلمة المرور</h1>
      <p className="mt-2 text-sm text-muted">اختر كلمة مرور جديدة لحسابك.</p>

      {/* noValidate: فقاعات تحقق المتصفح تظهر بلغته، ونريد رسائلنا ورسالة الخادم العربية بدلها. */}
      <form noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Field
          id="new-password"
          label="كلمة المرور الجديدة"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          disabled={submitting}
          aria-invalid={fieldErrors.password ? true : undefined}
          /* القائمة الحيّة نفسها في شاشة التسجيل، وتبقى تحت الخطأ لأنها تقول كيف يُصلَح. */
          hint={
            <>
              {errorLine('password')}
              <PasswordRules value={password} />
            </>
          }
        />
        <Field
          id="confirm-password"
          label="تأكيد كلمة المرور"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
            setFieldErrors((current) => ({ ...current, confirm: undefined }));
          }}
          disabled={submitting}
          aria-invalid={fieldErrors.confirm ? true : undefined}
          hint={errorLine('confirm')}
        />

        {error && (
          <div className="flex flex-col items-start gap-3">
            <div className="self-stretch">
              <Alert>{error.message}</Alert>
            </div>
            {/* كلمة المرور فُحصت هنا قبل الإرسال بالسياسة نفسها، فـ 400 بعدها هو الرابط لا الكلمة. */}
            {error.invalidLink && (
              <Button as={Link} to="/forgot-password" variant="secondary" className="w-full md:w-auto">
                اطلب رابطاً جديداً
              </Button>
            )}
          </div>
        )}

        <Button
          type="submit"
          disabled={password === '' || confirm === ''}
          loading={submitting}
          loadingText="جارٍ الحفظ…"
        >
          احفظ كلمة المرور الجديدة
        </Button>
      </form>
    </EntranceShell>
  );
}
