import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.js';
import {
  ACCESS_LOG_PATH,
  PLATFORM_ADMINS_PATH,
  canCreateRequest,
  canManagePlatform,
  canViewAccessLog,
  canViewAudit,
  canViewPlatform,
  canViewRequests,
  canViewSupplierPortal,
  canViewTeam,
  homeFor
} from '../lib/access.js';
import { roleLabel } from '../lib/labels.js';
import { useTheme } from '../lib/theme.js';
import Logo from './Logo.jsx';
import ThemeIcon from './ThemeIcon.jsx';

// الحلقة نعناعية لا بلون الختم: أرضية القائمة هي الختم نفسه في الفاتح، فحلقة الختم لا تُرى عليها.
const navFocus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-accent';

// النشط لا يُعرف باللون وحده: أرضية أفتح، وشريط نعناعي في الحافة الداخلية (جهة المحتوى)، وخط أثقل.
// الشريط حدّ دائم بعرضه في كل الروابط، شفاف في غير النشط — فلا يقفز النص حين يتغيّر النشط.
const navLinkClass = (isActive) =>
  `flex min-h-11 items-center rounded-sm border-e-4 px-4 text-sm ${navFocus} ${
    isActive
      ? 'border-nav-accent bg-nav-active font-semibold text-nav-ink'
      : 'border-transparent font-normal text-nav-muted hover:bg-nav-hover hover:text-nav-ink'
  }`;

/**
 * هيكل الشاشات خلف الدخول: قائمة جانبية في جهة البداية فوق ٧٦٨ بكسل، وشريط علوي بزر قائمة تحتها.
 * title عنوان الشاشة في الشريط الرفيع أعلى المحتوى، و action إجراؤها الأساسي إن وُجد.
 * titleAs: الشاشة التي عنوانها الحقيقي في محتواها (تفاصيل الطلب: اسم الصنف) تمرّر 'p' فلا يتكرر h1.
 *
 * لكل دور روابط وجهاته الحقيقية، والصلاحية من access.js كما يحرسها App.jsx — لا وجهة تُفتح لمن يُعاد منها:
 *   أدوار الشركة: «الطلبات» و«طلب جديد»، و«الفريق» و«سجل التدقيق» لمن يُسمح له.
 *   المورد: «بوابة المورد». مسؤول المنصة: «لوحة المنصة».
 * مسؤول المنصة لا يرى روابط الشركة: مسارات شركة وهو بلا شركة فتردّ عليه بخطأ — إخفاؤها تصحيح لا تجميل.
 * والشعار رابط إلى مكان الدور (homeFor)، لكنه ليس السبيل الوحيد إليه.
 */
export default function AppShell({ title, titleAs: TitleTag = 'h1', action, children }) {
  const { session, signOut } = useSession();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef(null);
  const menuId = useId();

  // والضغط على رابط الشاشة الحالية نفسها يغلقها كذلك (onNavigate) — المسار لا يتغيّر فلا يلتقطه هذا الأثر.
  // الانتقال إلى شاشة أخرى يغلق القائمة — وإلا بقيت مفتوحة فوق الشاشة الجديدة.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Escape يغلق القائمة ويعيد التركيز إلى زرها، فلا يضيع مستخدم لوحة المفاتيح.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKey(event) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const home = homeFor(session.user);

  return (
    <div className="min-h-screen bg-ground">
      {/* ───── الحاسب: قائمة ثابتة في جهة البداية (يمين في RTL) ───── */}
      <aside className="fixed inset-y-0 start-0 hidden w-sidebar flex-col bg-nav-ground text-nav-ink md:flex">
        <div className="px-4 pb-4 pt-5">
          <BrandLink to={home} />
        </div>
        <NavLinks user={session.user} pathname={pathname} className="flex-1 overflow-y-auto px-3" />
        <div className="border-t border-nav-line px-3 py-4">
          <UserBlock user={session.user} onSignOut={signOut} />
        </div>
      </aside>

      {/* ───── الجوال: شريط علوي بالشعار وزر القائمة، والقائمة تنفتح تحته داخل الصفحة لا فوقها ───── */}
      <header className="bg-nav-ground text-nav-ink md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <BrandLink to={home} onNavigate={() => setMenuOpen(false)} />
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-3 text-sm font-medium text-nav-ink hover:bg-nav-hover ${navFocus}`}
          >
            <MenuIcon open={menuOpen} />
            {menuOpen ? 'إغلاق القائمة' : 'القائمة'}
          </button>
        </div>
        {menuOpen && (
          <div id={menuId} className="border-t border-nav-line px-3 pb-4 pt-2">
            <NavLinks user={session.user} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            <div className="mt-3 border-t border-nav-line pt-4">
              <UserBlock user={session.user} onSignOut={signOut} />
            </div>
          </div>
        )}
      </header>

      {/* ───── المحتوى: شريط عنوان رفيع ثم الشاشة ───── */}
      <div className="md:ms-sidebar">
        <div className="border-b border-line bg-surface">
          <div className="mx-auto flex min-h-14 max-w-content flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
            <TitleTag className="min-w-0 break-words font-display text-lg font-semibold text-ink">{title}</TitleTag>
            {action}
          </div>
        </div>
        {/* أقصى عرض للمحتوى (--mb-content-width) في مكان واحد لكل الشاشات، موسّطاً؛ والهوامش px-4 في كل شاشة كما هي. */}
        <div className="mx-auto max-w-content">{children}</div>
      </div>
    </div>
  );
}

/** القفلة الأفقية: الرمز ثم الاسم. aria-hidden على الرمز لأن «مثبت» مكتوبة بجانبه — وإلا نُطقت مرتين.
    أرضية القائمة داكنة في الوضعين، فالنسخة الأحادية بنعناعي القائمة (--mb-nav-accent) — لا onDark:
    ذاك يتبع الوضع فيصير بلون الختم في الفاتح، والختم لا يُرى على أرضية بلون الختم. */
function BrandLink({ to, onNavigate }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`inline-flex min-h-11 items-center gap-2 rounded-sm font-display text-lg font-semibold text-nav-ink ${navFocus}`}
    >
      <Logo size={28} body="var(--mb-nav-accent)" accent="var(--mb-nav-accent)" aria-hidden="true" />
      مثبت
    </Link>
  );
}

// «الطلبات» نشط في القائمة وفي تفاصيل أي طلب، لا في «طلب جديد» — فلكلٍّ رابطه النشط وحده.
const isRequestsPath = (path) => path === '/requests' || (path.startsWith('/requests/') && path !== '/requests/new');

function NavLinks({ user, pathname, onNavigate, className = '' }) {
  const links = [
    canViewRequests(user) && { to: '/requests', label: 'الطلبات', active: isRequestsPath(pathname) },
    canCreateRequest(user) && { to: '/requests/new', label: 'طلب جديد', active: pathname === '/requests/new' },
    canViewSupplierPortal(user) && { to: '/supplier', label: 'بوابة المورد', active: pathname === '/supplier' },
    canViewPlatform(user) && { to: '/platform', label: 'لوحة المنصة', active: pathname === '/platform' },
    canViewTeam(user) && { to: '/team', label: 'الفريق', active: pathname === '/team' },
    canViewAudit(user) && { to: '/audit', label: 'سجل التدقيق', active: pathname === '/audit' }
  ].filter(Boolean);
  // قسم خاص بعد الروابط القائمة لا بينها — ترتيبها وشكلها كما كانا. ولمن لا يملك شيئاً منه لا يُرسم أصلاً.
  // «سجل الوصول» للمالك ولمن مُنح القراءة، و«مسؤولو المنصة» للمالك وحده؛ وعنوان القسم يتبع ذلك.
  const isOwner = canManagePlatform(user);
  const ownerLinks = [
    canViewAccessLog(user) && { to: ACCESS_LOG_PATH, label: 'سجل الوصول', active: pathname === ACCESS_LOG_PATH },
    isOwner && { to: PLATFORM_ADMINS_PATH, label: 'مسؤولو المنصة', active: pathname === PLATFORM_ADMINS_PATH }
  ].filter(Boolean);
  const renderLink = (link) => (
    <li key={link.to}>
      <Link
        to={link.to}
        onClick={onNavigate}
        aria-current={link.active ? 'page' : undefined} className={navLinkClass(link.active)}>
        {link.label}
      </Link>
    </li>
  );
  return (
    <nav aria-label="التنقل الرئيسي" className={className}>
      <ul className="flex flex-col gap-1">{links.map(renderLink)}</ul>
      {ownerLinks.length > 0 && (
        <div className="mt-4 border-t border-nav-line pt-3">
          <p id="nav-owner-section" className="px-4 pb-1 text-xs font-medium text-nav-muted">
            {isOwner ? 'مالك المنصة' : 'صلاحية ممنوحة'}
          </p>
          <ul aria-labelledby="nav-owner-section" className="flex flex-col gap-1">
            {ownerLinks.map(renderLink)}
          </ul>
        </div>
      )}
    </nav>
  );
}

function UserBlock({ user, onSignOut }) {
  return (
    <div className="flex flex-col gap-3">
      <ThemeToggle />
      <div className="min-w-0 break-words px-1">
        {user.fullName && <p className="text-sm font-medium text-nav-ink">{user.fullName}</p>}
        <p className="text-xs text-nav-muted">{roleLabel(user.role)}</p>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className={`min-h-11 w-full rounded-sm border border-nav-line px-4 text-sm font-medium text-nav-ink hover:bg-nav-hover ${navFocus}`}
      >
        تسجيل الخروج
      </button>
    </div>
  );
}

/** زر الوضع فوق بطاقة المستخدم — في القائمة الجانبية وفي القائمة المنسدلة على الجوال.
    النص وجهة التبديل (كزر اللغة في صفحة التعريف)، و aria-label الجملة كاملة وفيها النص الظاهر. */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const to = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={to === 'light' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
      className={`flex min-h-11 w-full items-center gap-2 rounded-sm px-4 text-sm text-nav-muted hover:bg-nav-hover hover:text-nav-ink ${navFocus}`}
    >
      <ThemeIcon to={to} />
      {to === 'light' ? 'الوضع الفاتح' : 'الوضع الداكن'}
    </button>
  );
}

/** ثلاثة خطوط للقائمة المغلقة، وعلامة × للمفتوحة. اللون من نص الزر. */
function MenuIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
    </svg>
  );
}
