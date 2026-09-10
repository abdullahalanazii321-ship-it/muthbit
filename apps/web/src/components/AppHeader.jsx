import { Link, NavLink } from 'react-router-dom';
import { useSession } from '../lib/session.js';
import { canViewAudit, homeFor } from '../lib/access.js';
import { roleLabel } from '../lib/labels.js';
import Button from './Button.jsx';

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal';

/**
 * شريط أعلى كل شاشة داخلية: اسم المنصة رابطاً إلى الصفحة الرئيسية لدور المستخدم،
 * ورابط سجل التدقيق للأدوار المسموح لها وحدها، واسم المستخدم ودوره بالعربية، وتسجيل الخروج.
 */
export default function AppHeader() {
  const { session, signOut } = useSession();
  const { fullName, role } = session.user;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-6">
          <Link to={homeFor(session.user)} className={`rounded-sm font-display text-lg font-semibold text-ink ${focusRing}`}>
            منصة مثبت
          </Link>
          {canViewAudit(session.user) && (
            <nav aria-label="التنقل الرئيسي">
              <NavLink
                to="/audit"
                className={({ isActive }) =>
                  `rounded-sm text-sm font-medium ${focusRing} ${
                    isActive ? 'text-ink underline underline-offset-4' : 'text-muted hover:text-ink'
                  }`
                }
              >
                سجل التدقيق
              </NavLink>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-end">
            {fullName && <p className="text-sm font-medium text-ink">{fullName}</p>}
            <p className="text-xs text-muted">{roleLabel(role)}</p>
          </div>
          <Button variant="secondary" onClick={signOut}>
            تسجيل الخروج
          </Button>
        </div>
      </div>
    </header>
  );
}
