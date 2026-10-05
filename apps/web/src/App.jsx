import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session.js';
import {
  ACCESS_LOG_PATH,
  COMPANY_HOME,
  PLATFORM_ADMINS_PATH,
  PLATFORM_HOME,
  SUPPLIER_HOME,
  canManagePlatform,
  canViewAccessLog,
  canViewAudit,
  canViewTeam,
  homeFor
} from './lib/access.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import RequestsPage from './pages/RequestsPage.jsx';
import NewRequestPage from './pages/NewRequestPage.jsx';
import RequestDetailPage from './pages/RequestDetailPage.jsx';
import SupplierPortalPage from './pages/SupplierPortalPage.jsx';
import PlatformPage from './pages/PlatformPage.jsx';
import AccessLogPage from './pages/AccessLogPage.jsx';
import PlatformAdminsPage from './pages/PlatformAdminsPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import Alert from './components/Alert.jsx';
import Button from './components/Button.jsx';
import LegalPage from './pages/LegalPage.jsx';
import { PRIVACY, TERMS } from './lib/legalContent.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  const { check } = useSession();

  // لا نعرض أي مسار قبل أن ينتهي التحقق من الجلسة المحفوظة — لا شاشة بيضاء ولا وميض شاشة الدخول.
  if (check.status === 'checking') return <SessionChecking />;
  if (check.status === 'failed') return <SessionCheckFailed />;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <GuestOnly>
            <ForgotPasswordPage />
          </GuestOnly>
        }
      />
      {/* بلا حارس عمداً: رابط البريد يُفتح ولو كان في المتصفح جلسة أخرى، والتحويل عنه يضيّع الرمز. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<PublicHome />} />
      {/* عامتان للزائر ولمن سجّل دخوله على السواء — لا تحويل ولا حماية. */}
      <Route path="/terms" element={<LegalPage doc={TERMS} />} />
      <Route path="/privacy" element={<LegalPage doc={PRIVACY} />} />
      <Route
        path="/requests"
        element={
          <RequireSession home={COMPANY_HOME}>
            <RequestsPage />
          </RequireSession>
        }
      />
      <Route
        path="/requests/new"
        element={
          <RequireSession home={COMPANY_HOME}>
            <NewRequestPage />
          </RequireSession>
        }
      />
      <Route
        path="/requests/:id"
        element={
          <RequireSession home={COMPANY_HOME}>
            <RequestDetailPage />
          </RequireSession>
        }
      />
      <Route
        path="/audit"
        element={
          <RequireSession home={COMPANY_HOME}>
            <AllowedOnly allowed={canViewAudit}>
              <AuditPage />
            </AllowedOnly>
          </RequireSession>
        }
      />
      <Route
        path="/team"
        element={
          <RequireSession home={COMPANY_HOME}>
            <AllowedOnly allowed={canViewTeam}>
              <TeamPage />
            </AllowedOnly>
          </RequireSession>
        }
      />
      <Route
        path="/supplier"
        element={
          <RequireSession home={SUPPLIER_HOME}>
            <SupplierPortalPage />
          </RequireSession>
        }
      />
      {/* لوحة المنصة مكان مسؤول المنصة (homeFor)، فأي دور آخر يفتحها يُعاد إلى مكانه هو. */}
      <Route
        path="/platform"
        element={
          <RequireSession home={PLATFORM_HOME}>
            <PlatformPage />
          </RequireSession>
        }
      />
      {/* قسم مالك المنصة: من لا يملكه يرى صفحة 404 نفسها — لا يُعلَم بوجود الصفحة.
          «سجل الوصول» للمالك ولمن مُنح القراءة، و«مسؤولو المنصة» للمالك وحده. */}
      <Route
        path={ACCESS_LOG_PATH}
        element={
          <RequireSession home={PLATFORM_HOME}>
            <AllowedOnly allowed={canViewAccessLog}>
              <AccessLogPage />
            </AllowedOnly>
          </RequireSession>
        }
      />
      <Route
        path={PLATFORM_ADMINS_PATH}
        element={
          <RequireSession home={PLATFORM_HOME}>
            <AllowedOnly allowed={canManagePlatform}>
              <PlatformAdminsPage />
            </AllowedOnly>
          </RequireSession>
        }
      />
      {/* مسار مجهول: صفحة 404 بحسب حال الزائر، والعنوان يبقى كما طُلب. */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/**
 * جذر الموقع للجميع بلا حارس: الزائر يرى صفحة التعريف، وصاحب الجلسة يُحوَّل إلى مكانه (homeFor).
 * لوحة الشركة انتقلت إلى /requests، فمن جاء يعرف ما المنصة لا يُطلب منه حساب أولاً.
 */
function PublicHome() {
  const { session } = useSession();
  return session ? <Navigate to={homeFor(session.user)} replace /> : <LandingPage />;
}

/**
 * home: لمن هذا المسار. الزائر إلى الدخول؛ وصاحب جلسة مكانه غيره يرى صفحة 404 في مكانه —
 * بالنص نفسه لمسار مجهول، فلا يُعلَم بوجود صفحة لا تخص دوره. لا تحويل: الخروج بزر.
 */
function RequireSession({ home, children }) {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  return homeFor(session.user) === home ? children : <NotFoundPage />;
}

/** مسار لأدوار محددة (allowed من access.js)؛ غيرهم يرى صفحة 404 نفسها — والخادم يرد 403 أصلاً. */
function AllowedOnly({ allowed, children }) {
  const { session } = useSession();
  return allowed(session.user) ? children : <NotFoundPage />;
}

function GuestOnly({ children }) {
  const { session } = useSession();
  return session ? <Navigate to={homeFor(session.user)} replace /> : children;
}

function SessionChecking() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4">
      <p role="status" className="text-muted">
        جارٍ التحقق من الجلسة…
      </p>
    </main>
  );
}

function SessionCheckFailed() {
  const { check, retryCheck, signOut } = useSession();
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-12">
      <div className="flex w-full max-w-measure flex-col gap-5 rounded border border-line bg-surface p-6 sm:p-8">
        <Alert>{check.message}</Alert>
        <div className="flex flex-wrap gap-3">
          <Button onClick={retryCheck}>إعادة المحاولة</Button>
          <Button variant="secondary" onClick={signOut}>
            تسجيل الخروج
          </Button>
        </div>
      </div>
    </main>
  );
}
