import { useSession } from '../lib/session.js';
import { roleLabel } from '../lib/labels.js';
import Button from './Button.jsx';

/** شريط أعلى كل شاشة داخلية: اسم المنصة، واسم المستخدم ودوره بالعربية، وتسجيل الخروج. */
export default function AppHeader() {
  const { session, signOut } = useSession();
  const { fullName, role } = session.user;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <p className="font-display text-lg font-semibold text-ink">منصة مثبت</p>
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
