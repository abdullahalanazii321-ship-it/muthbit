import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session.js';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
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
        path="/"
        element={
          <RequireSession>
            <HomePage />
          </RequireSession>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireSession({ children }) {
  const { session } = useSession();
  return session ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }) {
  const { session } = useSession();
  return session ? <Navigate to="/" replace /> : children;
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
