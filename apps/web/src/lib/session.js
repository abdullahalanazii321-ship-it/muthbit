// الجلسة: { token, user } في localStorage، وسياق React يعطي session و signIn و signOut.
// الملف .js لا .jsx، لذلك المزوّد مكتوب بـ createElement بدل JSX.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, connectSession, errorMessage } from './api.js';

const STORAGE_KEY = 'muthbit.session';

/**
 * قارئ واحد للمستخدم بصيغتي الخادم:
 * POST /api/auth/login يعيد full_name و company_id (snake_case)،
 * و GET /api/auth/me يعيد fullName و companyId (camelCase).
 */
export function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id ?? null,
    email: raw.email ?? null,
    fullName: raw.full_name ?? raw.fullName ?? null,
    role: raw.role ?? null,
    companyId: raw.company_id ?? raw.companyId ?? null,
    supplierId: raw.supplier_id ?? raw.supplierId ?? null
  };
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const user = normalizeUser(parsed?.user);
    // جلسة بشكل غير متوقع تُعامل كأنها غير موجودة — الافتراض هو المنع.
    if (typeof parsed?.token !== 'string' || !parsed.token || !user?.role) return null;
    return { token: parsed.token, user };
  } catch {
    return null;
  }
}

// الجلسة التي يرسل api.js رمزها. تُحدَّث مع حالة React في كل تغيير،
// فتبقى صالحة لهذه الصفحة حتى لو كان التخزين محجوباً في المتصفح.
let activeSession = readStoredSession();
let handleExpired = () => {};

function persist(session) {
  activeSession = session;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // التخزين محجوب: تبقى الجلسة في الذاكرة حتى تُغلق الصفحة.
  }
}

connectSession({
  getToken: () => activeSession?.token ?? null,
  onExpired: () => handleExpired()
});

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => activeSession);
  // checking: نتحقق من رمز محفوظ · ready: لا شيء معلّق · failed: تعذّر التحقق لسبب غير انتهاء الجلسة
  const [check, setCheck] = useState(() => ({ status: activeSession ? 'checking' : 'ready', message: null }));

  const signIn = useCallback(({ token, user }) => {
    const next = { token, user: normalizeUser(user) };
    persist(next);
    setSession(next);
    setCheck({ status: 'ready', message: null });
  }, []);

  // عملية عميل فقط: لا يوجد مسار تسجيل خروج في الخادم.
  const signOut = useCallback(() => {
    persist(null);
    setSession(null);
    setCheck({ status: 'ready', message: null });
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    handleExpired = signOut;
  }, [signOut]);

  const verify = useCallback(async () => {
    setCheck({ status: 'checking', message: null });
    try {
      const data = await apiFetch('/api/auth/me');
      const next = { token: activeSession.token, user: normalizeUser(data?.user) };
      persist(next);
      setSession(next);
      setCheck({ status: 'ready', message: null });
    } catch (error) {
      // 401: api.js استدعى signOut فمُسحت الجلسة وتحوّل المستخدم إلى /login.
      if (error?.status === 401) return;
      // أي فشل آخر لا يُدخل المستخدم ولا يمسح جلسته: نعرض السبب ونترك له القرار.
      setCheck({ status: 'failed', message: errorMessage(error) });
    }
  }, []);

  // StrictMode في التطوير يشغّل المؤثرات مرتين؛ هذا الحارس يضمن نداء /me مرة واحدة.
  const verifyStarted = useRef(false);
  useEffect(() => {
    if (verifyStarted.current || !activeSession) return;
    verifyStarted.current = true;
    verify();
  }, [verify]);

  const value = useMemo(
    () => ({ session, check, signIn, signOut, retryCheck: verify }),
    [session, check, signIn, signOut, verify]
  );

  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
