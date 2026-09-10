import { useSession } from '../lib/session.js';
import { roleLabel } from '../lib/labels.js';
import Button from '../components/Button.jsx';

/** نقطة هبوط مؤقتة بعد الدخول — لا لوحة ولا جداول ولا نداءات. */
export default function HomePage() {
  const { session, signOut } = useSession();
  const { fullName, role } = session.user;

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-12">
      <div className="w-full max-w-measure rounded border border-line bg-surface p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {fullName ? `مرحباً، ${fullName}` : 'مرحباً'}
        </h1>
        <p className="mt-2 text-muted">{roleLabel(role)}</p>
        <Button variant="secondary" className="mt-8" onClick={signOut}>
          تسجيل الخروج
        </Button>
      </div>
    </main>
  );
}
