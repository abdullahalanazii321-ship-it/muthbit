import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session.js';
import { COMPANY_HOME, PLATFORM_HOME, SUPPLIER_HOME, canViewAudit, canViewTeam, homeFor } from './lib/access.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import RequestsPage from './pages/RequestsPage.jsx';
import NewRequestPage from './pages/NewRequestPage.jsx';
import RequestDetailPage from './pages/RequestDetailPage.jsx';
import SupplierPortalPage from './pages/SupplierPortalPage.jsx';
import PlatformPage from './pages/PlatformPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import Alert from './components/Alert.jsx';
import Button from './components/Button.jsx';

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
      <Route path="/" element={<PublicHome />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
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

/** home: لمن هذا المسار. من كان مكانه غيره يُعاد إلى مكانه. */
function RequireSession({ home, children }) {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  const userHome = homeFor(session.user);
  return userHome === home ? children : <Navigate to={userHome} replace />;
}

/** مسار لأدوار محددة (allowed من access.js)؛ غيرهم يُعاد إلى لوحة الشركة بلا رسالة — الخادم يرد 403 أصلاً. */
function AllowedOnly({ allowed, children }) {
  const { session } = useSession();
  return allowed(session.user) ? children : <Navigate to={COMPANY_HOME} replace />;
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
