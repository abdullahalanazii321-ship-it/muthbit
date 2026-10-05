import { Link } from 'react-router-dom';
import { useSession } from '../lib/session.js';
import { homeFor, homeLabelFor } from '../lib/access.js';
import AppShell from '../components/AppShell.jsx';
import Button from '../components/Button.jsx';
import Logo from '../components/Logo.jsx';
import { CtaLink, PublicFrame } from './LandingPage.jsx';

/**
 * «الصفحة غير موجودة» — لكل مسار مجهول، ولكل مسار لا يخص دور صاحب الجلسة.
 * النص واحد في الحالتين عمداً: لو قيل «موجودة لكنها ممنوعة عليك» لصار الفرق كاشفاً لما لا يحق له.
 * لا تحويل تلقائي: العنوان يبقى كما طُلب، والخروج بزر.
 * هادئة: «404» بلون muted لا بلون التنبيه — لا رسوم ولا حركة.
 */
export default function NotFoundPage() {
  const { session } = useSession();
  return session ? <SignedInNotFound user={session.user} /> : <GuestNotFound />;
}

/** داخل الصدفة بقائمتها كما هي، فلا يفقد المستخدم مكانه. */
function SignedInNotFound({ user }) {
  return (
    <AppShell title="هذه الصفحة غير موجودة">
      <main className="px-4 py-8">
        <section className="max-w-measure rounded border border-line bg-surface p-5 sm:p-6">
          <p className="font-display text-5xl font-semibold text-muted">404</p>
          <p className="mt-4 text-ink">قد يكون الرابط قديماً، أو أن هذه الصفحة لا تخص دورك.</p>
          <div className="mt-6">
            <Button as={Link} to={homeFor(user)}>
              العودة إلى {homeLabelFor(user)}
            </Button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

/** للزائر: بإطار صفحة التعريف، وطريقا خروج. */
function GuestNotFound() {
  return (
    <PublicFrame>
      <main className="mx-auto flex w-full max-w-6xl justify-center px-5 py-16">
        <div className="flex max-w-measure flex-col items-center text-center">
          <Logo size={64} onDark aria-hidden="true" />
          <p className="mt-6 font-display text-6xl font-semibold text-mkt-muted">404</p>
          <h1 className="mt-4 font-display text-2xl font-semibold text-mkt-paper">هذه الصفحة غير موجودة</h1>
          <p className="mt-3 text-mkt-muted">قد يكون الرابط قديماً أو مكتوباً خطأ.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaLink to="/">الصفحة الرئيسية</CtaLink>
            <CtaLink to="/login" variant="outline">
              تسجيل الدخول
            </CtaLink>
          </div>
        </div>
      </main>
    </PublicFrame>
  );
}
