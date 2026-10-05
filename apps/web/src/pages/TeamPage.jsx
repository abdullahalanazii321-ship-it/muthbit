import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { apiFetch, errorMessage } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { CREATABLE_ROLES, JOIN_ASSIGNABLE_ROLES, canManageJoin, canManageTeam } from '../lib/access.js';
import { formatDateTime, formatSAR, roleLabel, userStatusLabel } from '../lib/labels.js';
import { useResource } from '../lib/useResource.js';
import { isPasswordValid } from '../lib/passwordPolicy.js';
import AppShell from '../components/AppShell.jsx';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import LimitsForm from '../components/LimitsForm.jsx';
import PasswordRules from '../components/PasswordRules.jsx';
import ReasonField, { reasonReady } from '../components/ReasonField.jsx';
import { Badge } from '../components/StatusBadge.jsx';
import { RecordCard, RecordCards, RecordField } from '../components/RecordCard.jsx';

const COLUMNS = ['الاسم', 'البريد', 'الدور', 'الحالة', 'السقف'];
const ACTIONS_COLUMN = 'إجراءات';
const SKELETON_ROWS = 4;
const SUSPENDED = 'suspended';
const OWNER_ROLE = 'company_owner';

const isUsersResponse = (data) => Array.isArray(data?.users);

/** سقف مستخدم واحد. 404 حالة لا خطأ: «لم يُضبط سقف لهذا المستخدم بعد». */
async function fetchLimit(companyPath, userId) {
  try {
    const data = await apiFetch(`${companyPath}/buyers/${encodeURIComponent(userId)}/limits`);
    if (!data?.limits) throw new Error('unexpected response shape');
    return { status: 'set', limits: data.limits };
  } catch (error) {
    if (error?.status === 404) return { status: 'none' };
    return { status: 'error', message: errorMessage(error) };
  }
}

/**
 * سقوف المستخدمين: تُجلب بالتوازي بعد وصول القائمة، وتُعاد مع كل وصول جديد لها (أي بعد كل إجراء).
 * كل خلية تبدأ بالتحميل من جديد، فلا يُفتح نموذج سقف على قيمة قديمة.
 */
function useLimits(companyPath, users) {
  const [entries, setEntries] = useState({});

  const load = useCallback(
    async (userId, isIgnored = () => false) => {
      const entry = await fetchLimit(companyPath, userId);
      if (!isIgnored()) setEntries((current) => ({ ...current, [userId]: entry }));
    },
    [companyPath]
  );

  useEffect(() => {
    if (!users) return undefined;
    let ignore = false;
    setEntries(Object.fromEntries(users.map((user) => [user.id, { status: 'loading' }])));
    // كل نداء يُطلق دون انتظار سابقه.
    for (const user of users) load(user.id, () => ignore);
    return () => {
      ignore = true;
    };
  }, [users, load]);

  const retry = useCallback(
    (userId) => {
      setEntries((current) => ({ ...current, [userId]: { status: 'loading' } }));
      load(userId);
    },
    [load]
  );

  return { entries, retry };
}

/**
 * فريق الشركة: المستخدمون وسقوف إنفاقهم.
 * معرّف الشركة من الجلسة وحدها — لا يُكتب يدوياً، والخادم يرفض غيره.
 * مدير المشتريات يقرأ فقط (فرق ثابت في العقد)، فتُحذف عنه أزرار الكتابة. أي رفض آخر يقرره الخادم.
 */
export default function TeamPage() {
  const { session } = useSession();
  const me = session.user;
  const canManage = canManageTeam(me);
  // رمز الشركة وطلبات الانضمام للمالك وحده — من مصدر الصلاحيات نفسه (access.js).
  const canJoin = canManageJoin(me);
  const companyPath = `/api/companies/${encodeURIComponent(me.companyId ?? '')}`;

  const users = useResource(`${companyPath}/users`, isUsersResponse);
  const userList = users.status === 'ready' ? users.data.users : null;
  const limits = useLimits(companyPath, userList);

  // لوحة واحدة مفتوحة في كل مرة: { kind: 'new' } · { kind: 'limits', user, current } · { kind: 'suspend', user }
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState(null);
  // إعادة التفعيل تنفَّذ من الصف مباشرة بلا بطاقة تأكيد، فحالتها هنا: معرّف الصف الجاري ورسالة فشله.
  const [activatingId, setActivatingId] = useState(null);
  const [activateError, setActivateError] = useState(null);

  function openPanel(next) {
    setNotice(null);
    setActivateError(null);
    setPanel(next);
  }

  // بعد أي إجراء ناجح: تُغلق اللوحة وتُعاد القائمة من الخادم ومعها السقوف — لا تحديث محلي بالتخمين.
  function finish(text) {
    setPanel(null);
    setNotice(text || null);
    users.reload();
  }

  /**
   * إعادة التفعيل بلا تأكيد: التأكيد لما لا رجعة فيه، وهذا هو الرجوع نفسه.
   * وما ألغاه الإيقاف لا يعود معه — تقوله رسالة النجاح صراحةً بدل أن يكتشفه المستخدم بعد حين.
   */
  async function activate(user) {
    if (activatingId) return;
    setPanel(null);
    setNotice(null);
    setActivateError(null);
    setActivatingId(user.id);
    try {
      await apiFetch(`${companyPath}/users/${encodeURIComponent(user.id)}/activate`, { method: 'POST' });
      setActivatingId(null);
      finish(`أُعيد تفعيل حساب ${user.full_name}. سقفه وطلباته الملغاة لا تعود — اضبط سقفه من جديد.`);
    } catch (error) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (error?.status === 401) return;
      setActivatingId(null);
      setActivateError(errorMessage(error));
    }
  }

  return (
    <AppShell
      title="فريق الشركة"
      action={canManage && <Button onClick={() => openPanel({ kind: 'new' })}>مستخدم جديد</Button>}
    >
      <main className="mx-auto max-w-5xl px-4 py-8">
        {notice && (
          <div className="mt-6">
            <Alert tone="seal">{notice}</Alert>
          </div>
        )}

        {activateError && (
          <div className="mt-6">
            <Alert>{activateError}</Alert>
          </div>
        )}

        {canJoin && (
          <>
            <JoinCodeCard companyPath={companyPath} />
            <JoinRequestsSection companyPath={companyPath} onDecided={finish} />
            <h2 className="mt-8 font-display text-lg font-semibold text-ink">أعضاء الفريق</h2>
          </>
        )}

        {panel?.kind === 'new' && (
          <PanelCard key="new" title="مستخدم جديد">
            <NewUserForm
              companyPath={companyPath}
              onCreated={(name) => finish(`أُضيف المستخدم «${name}».`)}
              onCancel={() => setPanel(null)}
            />
          </PanelCard>
        )}
        {panel?.kind === 'limits' && (
          <PanelCard key={`limits-${panel.user.id}`} title={`سقف ${panel.user.full_name}`}>
            <LimitsForm
              companyPath={companyPath}
              buyer={panel.user}
              current={panel.current}
              users={userList ?? []}
              onSaved={() => finish(`حُفظ سقف ${panel.user.full_name}.`)}
              onCancel={() => setPanel(null)}
            />
          </PanelCard>
        )}
        {panel?.kind === 'suspend' && (
          <PanelCard key={`suspend-${panel.user.id}`} title={`إيقاف ${panel.user.full_name}`}>
            <SuspendConfirm
              companyPath={companyPath}
              user={panel.user}
              onSuspended={finish}
              onCancel={() => setPanel(null)}
            />
          </PanelCard>
        )}

        <div className="mt-6">
          {users.status === 'loading' && <UsersList loading canManage={canManage} />}

          {users.status === 'error' && (
            <div className="flex flex-col items-start gap-4">
              <Alert>{users.error.message}</Alert>
              <Button variant="secondary" onClick={users.reload}>
                إعادة المحاولة
              </Button>
            </div>
          )}

          {users.status === 'ready' && userList.length === 0 && (
            <div className="rounded border border-line bg-surface p-6 sm:p-8">
              <p className="text-ink">لا يوجد مستخدمون</p>
            </div>
          )}

          {users.status === 'ready' && userList.length > 0 && (
            <>
              {users.refreshing && (
                <p role="status" className="mb-3 text-sm text-muted">
                  جارٍ التحديث…
                </p>
              )}
              <UsersList
                users={userList}
                me={me}
                canManage={canManage}
                busy={users.refreshing}
                limits={limits.entries}
                onRetryLimit={limits.retry}
                onSetLimits={(user, entry) =>
                  openPanel({ kind: 'limits', user, current: entry.status === 'set' ? entry.limits : null })
                }
                onSuspend={(user) => openPanel({ kind: 'suspend', user })}
                onActivate={activate}
                activatingId={activatingId}
              />
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

/** بطاقة في الصفحة (لا نافذة منبثقة). تنفتح أعلى الجدول، فيُنقل التركيز إلى عنوانها ولو فُتحت من صف بعيد. */
function PanelCard({ title, children }) {
  const headingId = useId();
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section aria-labelledby={headingId} className="mt-6 rounded border border-line bg-surface p-5 sm:p-6">
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-lg font-semibold text-ink focus:outline-none"
      >
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * قائمة المستخدمين بشكلين لعرض واحد من البيانات:
 * بطاقات مكدّسة تحت ١٢٨٠ بكسل، والجدول كما هو فوقها. الجدول يحتاج ٧٨٧ بكسل، والقائمة الجانبية تأخذ ٢٣٢ فوق ٧٦٨،
 * فلا يتّسع له المحتوى قبل ١٠٥٦ — وتحتها كان يتمرّر داخل صندوقه بلا دليل.
 * المخفي منهما `display:none` فلا يقرؤه قارئ الشاشة ولا يدفع الصفحة أفقياً.
 */
function UsersList(props) {
  return (
    <>
      <div className="xl:hidden">
        <UsersCards {...props} />
      </div>
      <div className="hidden xl:block">
        <UsersTable {...props} />
      </div>
    </>
  );
}

/**
 * من يجوز إيقافه ومن يجوز إعادة تفعيله — قاعدة واحدة يقرؤها الجدول والبطاقات معاً،
 * فلا يفترقان يوماً في إجراء يظهر هنا ويغيب هناك.
 * الإيقاف لا يظهر لحسابك نفسه ولا لموقوف أصلاً، ولا على صف المالك لغير مالك
 * (الخادم يرفضه دائماً) — يُحذف ولا يُعطَّل.
 * وإعادة التفعيل للموقوف وحده، وبقيد المالك نفسه.
 */
function actionFlags(user, me) {
  const ownerGuard = user.role !== OWNER_ROLE || me.role === OWNER_ROLE;
  return {
    canSuspend: user.id !== me.id && user.status !== SUSPENDED && ownerGuard,
    canActivate: user.status === SUSPENDED && ownerGuard
  };
}

/** أزرار صف واحد. stacked يكدّسها بعرض كامل للبطاقة؛ وبدونه تبقى في صف كما في الجدول. */
function UserActions({
  user,
  me,
  entry,
  busy,
  onSetLimits,
  onSuspend,
  onActivate,
  activatingId,
  stacked = false
}) {
  const limitsKnown = entry?.status === 'set' || entry?.status === 'none';
  const { canSuspend, canActivate } = actionFlags(user, me);
  const width = stacked ? 'w-full' : '';

  return (
    <div className={stacked ? 'flex flex-col gap-2' : 'flex gap-2'}>
      {/* لا يظهر قبل وصول السقف الحالي: النموذج الفارغ يستبدل سقفاً قائماً بلا علم أحد. */}
      {limitsKnown && (
        <Button variant="secondary" className={width} onClick={() => onSetLimits(user, entry)} disabled={busy}>
          ضبط السقف
        </Button>
      )}
      {canSuspend && (
        <Button variant="secondary" className={width} onClick={() => onSuspend(user)} disabled={busy}>
          إيقاف
        </Button>
      )}
      {canActivate && (
        <Button
          className={width}
          onClick={() => onActivate(user)}
          disabled={busy || (activatingId !== null && activatingId !== user.id)}
          loading={activatingId === user.id}
          loadingText="جارٍ التفعيل…"
        >
          إعادة تفعيل
        </Button>
      )}
    </div>
  );
}

/** حالة المستخدم وسماً. اللون هو نفسه الذي يستعمله الجدول: الموقوف بلون الإشارة وما عداه محايد. */
function UserStatusBadge({ status }) {
  return <Badge tone={status === SUSPENDED ? 'signal' : 'muted'}>{userStatusLabel(status)}</Badge>;
}

/** بطاقات العرض الضيق: بطاقة لكل مستخدم، فيها كل ما في صف الجدول بلا نقصان. */
function UsersCards({
  loading = false,
  users = [],
  me,
  canManage,
  busy = false,
  limits = {},
  onRetryLimit,
  onSetLimits,
  onSuspend,
  onActivate,
  activatingId = null
}) {
  if (loading) {
    return (
      <RecordCards label="جارٍ التحميل…" busy>
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <li key={row} className="rounded border border-line bg-surface p-4">
            <div className="h-5 w-40 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: COLUMNS.length - 1 }, (_, line) => (
                <div key={line} className="h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
              ))}
            </div>
          </li>
        ))}
      </RecordCards>
    );
  }

  return (
    <RecordCards label="المستخدمون">
      {users.map((user) => (
        <RecordCard
          key={user.id}
          title={user.full_name}
          badge={<UserStatusBadge status={user.status} />}
          actions={
            canManage ? (
              <UserActions
                stacked
                user={user}
                me={me}
                entry={limits[user.id]}
                busy={busy}
                onSetLimits={onSetLimits}
                onSuspend={onSuspend}
                onActivate={onActivate}
                activatingId={activatingId}
              />
            ) : null
          }
        >
          <RecordField label="البريد">
            <bdi>{user.email}</bdi>
          </RecordField>
          <RecordField label="الدور">{roleLabel(user.role)}</RecordField>
          <RecordField label="السقف">
            <LimitCell entry={limits[user.id]} onRetry={() => onRetryLimit(user.id)} />
          </RecordField>
        </RecordCard>
      ))}
    </RecordCards>
  );
}

/** الجدول داخل حاوية تنزلق أفقياً وحدها على الشاشات الضيقة. */
function UsersTable({
  loading = false,
  users = [],
  me,
  canManage,
  busy = false,
  limits = {},
  onRetryLimit,
  onSetLimits,
  onSuspend,
  onActivate,
  activatingId = null
}) {
  const cell = 'whitespace-nowrap px-4 py-3';
  // عمود الإجراءات لمن يملك الكتابة وحده: لا عمود فارغاً لمن يقرأ فقط.
  const columns = canManage ? [...COLUMNS, ACTIONS_COLUMN] : COLUMNS;

  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full text-sm" aria-busy={loading || undefined}>
        {loading && <caption className="sr-only">جارٍ التحميل…</caption>}
        <thead className="bg-surface-2">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className={`${cell} text-start font-medium text-muted`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <tr key={row} className="border-t border-line">
                  {columns.map((column) => (
                    <td key={column} className={cell}>
                      <div className="h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            : users.map((user) => {
                const entry = limits[user.id];
                return (
                  <tr key={user.id} className="border-t border-line">
                    <td className="px-4 py-3 text-ink">{user.full_name}</td>
                    <td className={cell}>
                      <bdi>{user.email}</bdi>
                    </td>
                    <td className={cell}>{roleLabel(user.role)}</td>
                    <td className={`${cell} ${user.status === SUSPENDED ? 'text-signal' : 'text-ink'}`}>
                      {userStatusLabel(user.status)}
                    </td>
                    <td className={cell}>
                      <LimitCell entry={entry} onRetry={() => onRetryLimit(user.id)} />
                    </td>
                    {canManage && (
                      <td className={cell}>
                        <UserActions
                          user={user}
                          me={me}
                          entry={entry}
                          busy={busy}
                          onSetLimits={onSetLimits}
                          onSuspend={onSuspend}
                          onActivate={onActivate}
                          activatingId={activatingId}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}

function LimitCell({ entry, onRetry }) {
  if (!entry || entry.status === 'loading') {
    return <div className="h-4 w-24 rounded-sm bg-surface-2 motion-safe:animate-pulse" />;
  }
  if (entry.status === 'none') return <span className="text-signal">— لم يُضبط</span>;
  if (entry.status === 'error') {
    return (
      <span className="whitespace-normal text-signal">
        {entry.message}{' '}
        <button type="button" onClick={onRetry} className="font-medium underline">
          إعادة المحاولة
        </button>
      </span>
    );
  }

  const { limits } = entry;
  if (limits.active === false) return <span className="text-signal">موقوف</span>;
  const hasMonthly = limits.monthly_ceiling !== null && limits.monthly_ceiling !== undefined;
  return (
    <div className="tabular-nums">
      <p className="text-ink">{formatSAR(limits.per_request_ceiling)}</p>
      {hasMonthly && <p className="text-xs text-muted">شهرياً {formatSAR(limits.monthly_ceiling)}</p>}
    </div>
  );
}

function NewUserForm({ companyPath, onCreated, onCancel }) {
  const idPrefix = useId();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit =
    form.fullName.trim() !== '' &&
    form.email.trim() !== '' &&
    isPasswordValid(form.password) &&
    CREATABLE_ROLES.includes(form.role);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    const body = {
      full_name: form.fullName.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role
    };

    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch(`${companyPath}/users`, { method: 'POST', body });
      onCreated(data?.user?.full_name ?? body.full_name);
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      // details في 400 مخرجات تحقق بالإنجليزية فلا تُعرض.
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    // noValidate: فقاعات تحقق المتصفح تظهر بلغته، ونريد رسائل الخادم العربية بدلها.
    <form noValidate onSubmit={handleSubmit} className="flex max-w-measure flex-col gap-5">
      <Field
        id={`${idPrefix}-name`}
        label="الاسم"
        maxLength={160}
        value={form.fullName}
        onChange={update('fullName')}
        disabled={submitting}
      />
      <Field
        id={`${idPrefix}-email`}
        label="البريد الإلكتروني"
        type="email"
        dir="ltr"
        autoComplete="off"
        value={form.email}
        onChange={update('email')}
        disabled={submitting}
      />
      <Field
        id={`${idPrefix}-password`}
        label="كلمة المرور"
        type="password"
        dir="ltr"
        autoComplete="new-password"
        value={form.password}
        onChange={update('password')}
        disabled={submitting}
        hint={<PasswordRules value={form.password} />}
      />
      {/* الأدوار الأربعة التي يقبلها الخادم وحدها — عرض غيرها كذب. */}
      <Field
        id={`${idPrefix}-role`}
        as="select"
        label="الدور"
        value={form.role}
        onChange={update('role')}
        disabled={submitting}
      >
        <option value="" disabled>
          اختر الدور
        </option>
        {CREATABLE_ROLES.map((role) => (
          <option key={role} value={role}>
            {roleLabel(role)}
          </option>
        ))}
      </Field>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canSubmit} loading={submitting} loadingText="جارٍ الإنشاء…">
          إنشاء المستخدم
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

/**
 * تأكيد الإيقاف: إجراء واسع الأثر يُقال بكامله قبل التنفيذ لا بعده.
 * ما يُسرد هنا هو ما يفعله مسار suspend في الخادم حرفياً.
 */
function SuspendConfirm({ companyPath, user, onSuspended, onCancel }) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const body = { reason: reason.trim() };
      const data = await apiFetch(`${companyPath}/users/${encodeURIComponent(user.id)}/suspend`, {
        method: 'POST',
        body
      });
      onSuspended(data?.message ?? null);
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return (
    <div className="flex max-w-measure flex-col gap-5">
      <Alert>
        <p>سيحدث فوراً عند التأكيد:</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>إيقاف حساب {user.full_name}، فلا يستطيع الدخول.</li>
          <li>تعطيل سقف إنفاقه.</li>
          <li>إلغاء مفاتيح وكلائه الذكيين.</li>
          <li className="font-semibold">
            إلغاء كل طلباته المفتوحة: المسودة، وبانتظار العروض، وبانتظار الاعتماد.
          </li>
        </ul>
        <p className="mt-2">يمكن إعادة تفعيل الحساب لاحقاً، لكن سقفه وطلباته الملغاة لا تعود.</p>
      </Alert>

      <ReasonField
        id={reasonId}
        label="سبب الإيقاف"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={sending}
      />

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="signal"
          onClick={confirm}
          disabled={!reasonReady(reason)}
          loading={sending}
          loadingText="جارٍ الإيقاف…"
        >
          تأكيد الإيقاف
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}

/* ───────────── انضمام الموظفين برمز الشركة — للمالك وحده (canManageJoin) ─────────────
 * المكوّنان لا يُرسمان لغير المالك، فلا يُنادى مسارا الرمز والطلبات أصلاً لمن يرفضه الخادم.
 * الإخفاء انعكاس لقرار الخادم لا حماية: companies.routes.js يرفض غير المالك في كل مسار منها.
 */

const isJoinCodeResponse = (data) => typeof data?.join_code === 'string';
const isJoinRequestsResponse = (data) => Array.isArray(data?.requests);
// كم يبقى «نُسخ الرمز» ظاهراً.
const COPIED_MS = 2500;

const CARD = 'rounded border border-line bg-surface p-5 sm:p-6';

/**
 * رمز الشركة: مقسوماً مجموعتين من أربعة ليُقرأ شفهياً، وزر نسخ، وشرح ما هو، وتوليد رمز جديد بتأكيد.
 * المنسوخ هو الرمز بلا فراغ — الفراغ عرض فقط، والخادم يزيل الفراغات على كل حال.
 */
function JoinCodeCard({ companyPath }) {
  const code = useResource(`${companyPath}/join-code`, isJoinCodeResponse);
  const [copyState, setCopyState] = useState(null); // null · 'copied' · 'failed'
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState(null);
  const [rotated, setRotated] = useState(false);
  const copiedTimer = useRef(null);
  const headingId = useId();

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const value = code.status === 'ready' ? code.data.join_code : '';

  async function copy() {
    clearTimeout(copiedTimer.current);
    try {
      await navigator.clipboard.writeText(value);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    copiedTimer.current = setTimeout(() => setCopyState(null), COPIED_MS);
  }

  async function rotate() {
    if (rotating) return;
    setRotating(true);
    setRotateError(null);
    try {
      await apiFetch(`${companyPath}/join-code/rotate`, { method: 'POST' });
      setConfirming(false);
      setRotated(true);
      setCopyState(null);
      code.reload();
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      setRotateError(errorMessage(err));
    } finally {
      setRotating(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className={`mt-6 ${CARD}`}>
      <h2 id={headingId} className="font-display text-lg font-semibold text-ink">
        رمز الشركة
      </h2>

      {code.status === 'loading' && (
        <div aria-busy="true" className="mt-4">
          <p role="status" className="sr-only">
            جارٍ التحميل…
          </p>
          <div className="h-9 w-56 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
        </div>
      )}

      {code.status === 'error' && (
        <div className="mt-4 flex flex-col items-start gap-4">
          <Alert>{code.error.message}</Alert>
          <Button variant="secondary" onClick={code.reload}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {code.status === 'ready' && (
        <>
          {/* LTR داخل صفحة RTL: المجموعة الأولى يساراً كما تُقرأ. ولقارئ الشاشة المحارف منفصلة. */}
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2" aria-label={`رمز الشركة: ${value.split('').join(' ')}`}>
            <bdi dir="ltr" aria-hidden="true" className="font-mono text-2xl font-semibold tracking-widest text-ink">
              {value.slice(0, 4)}
              <span className="ms-3">{value.slice(4)}</span>
            </bdi>
          </p>
          {code.data.join_code_updated_at && (
            <p className="mt-1 text-xs text-muted">
              آخر توليد: <bdi className="tabular-nums">{formatDateTime(code.data.join_code_updated_at)}</bdi>
            </p>
          )}

          <p className="mt-3 text-sm text-muted">
            يستخدمه الموظف ليطلب الانضمام إلى شركتك. الرمز لا يمنحه دخولاً حتى تعتمد طلبه.
          </p>

          {rotated && (
            <div className="mt-4">
              <Alert tone="seal">وُلّد رمز جديد. الرمز السابق لم يعد يعمل.</Alert>
            </div>
          )}

          {!confirming && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={copy} disabled={code.refreshing}>
                نسخ الرمز
              </Button>
              <Button variant="secondary" onClick={() => { setConfirming(true); setRotated(false); setRotateError(null); }} disabled={code.refreshing}>
                توليد رمز جديد
              </Button>
              <p role="status" className="text-sm text-muted">
                {copyState === 'copied' && 'نُسخ الرمز.'}
                {copyState === 'failed' && 'تعذّر النسخ — انسخه يدوياً.'}
              </p>
            </div>
          )}

          {confirming && (
            <div className="mt-4 flex max-w-measure flex-col gap-4">
              <Alert>
                <p>سيبطل الرمز الحالي فوراً عند التأكيد.</p>
                <p className="mt-1">من استلمه ولم يرسل طلبه بعد لن يستطيع استخدامه — أرسل له الرمز الجديد.</p>
              </Alert>
              {rotateError && <Alert>{rotateError}</Alert>}
              <div className="flex flex-wrap gap-3">
                <Button variant="signal" onClick={rotate} loading={rotating} loadingText="جارٍ التوليد…">
                  تأكيد توليد رمز جديد
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={rotating}>
                  تراجع
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * طلبات الانضمام المعلّقة: الاسم والبريد ووقت الطلب، ولكل طلب اعتماد أو رفض في لوحة.
 * بعد كل قرار تُعاد القائمة من الخادم، ويُبلَّغ الأب ليعيد قائمة الفريق (onDecided).
 */
function JoinRequestsSection({ companyPath, onDecided }) {
  const requests = useResource(`${companyPath}/join-requests`, isJoinRequestsResponse);
  // { kind: 'approve' | 'reject', request } — لوحة واحدة في كل مرة.
  const [panel, setPanel] = useState(null);
  const headingId = useId();
  const list = requests.status === 'ready' ? requests.data.requests : [];

  function decided(text) {
    setPanel(null);
    requests.reload();
    onDecided(text);
  }

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="font-display text-lg font-semibold text-ink">
        طلبات الانضمام
      </h2>

      {requests.status === 'loading' && (
        <p role="status" className="mt-2 text-sm text-muted">
          جارٍ تحميل الطلبات…
        </p>
      )}

      {requests.status === 'error' && (
        <div className="mt-3 flex flex-col items-start gap-4">
          <Alert>{requests.error.message}</Alert>
          <Button variant="secondary" onClick={requests.reload}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* لا صندوق فارغ: سطر واحد هادئ. */}
      {requests.status === 'ready' && list.length === 0 && (
        <p className="mt-2 text-sm text-muted">لا توجد طلبات انضمام.</p>
      )}

      {panel?.kind === 'approve' && (
        <PanelCard key={`approve-${panel.request.id}`} title={`اعتماد ${panel.request.full_name}`}>
          <ApproveJoinForm companyPath={companyPath} request={panel.request} onApproved={decided} onCancel={() => setPanel(null)} />
        </PanelCard>
      )}
      {panel?.kind === 'reject' && (
        <PanelCard key={`reject-${panel.request.id}`} title={`رفض طلب ${panel.request.full_name}`}>
          <RejectJoinForm companyPath={companyPath} request={panel.request} onRejected={decided} onCancel={() => setPanel(null)} />
        </PanelCard>
      )}

      {requests.status === 'ready' && list.length > 0 && (
        <div className="mt-3">
          {requests.refreshing && (
            <p role="status" className="mb-3 text-sm text-muted">
              جارٍ التحديث…
            </p>
          )}
          <RecordCards label="طلبات الانضمام" busy={requests.refreshing}>
            {list.map((request) => (
              <RecordCard
                key={request.id}
                title={request.full_name}
                actions={
                  <>
                    <Button onClick={() => setPanel({ kind: 'approve', request })} disabled={requests.refreshing}>
                      اعتماد
                    </Button>
                    <Button variant="secondary" onClick={() => setPanel({ kind: 'reject', request })} disabled={requests.refreshing}>
                      رفض
                    </Button>
                  </>
                }
              >
                <RecordField label="البريد">
                  <bdi>{request.email}</bdi>
                </RecordField>
                <RecordField label="وقت الطلب">
                  <bdi className="tabular-nums">{formatDateTime(request.join_requested_at)}</bdi>
                </RecordField>
              </RecordCard>
            ))}
          </RecordCards>
        </div>
      )}
    </section>
  );
}

/**
 * اعتماد طلب: الدور وسقف الطلب الواحد، وكلاهما إلزامي — الزر معطّل حتى يكتملا.
 * الأدوار هي التي يقبلها الخادم وحدها (JOIN_ASSIGNABLE_ROLES)؛ والسقف الشهري والفئات والمعتمِد
 * تبقى فارغة يضبطها المالك لاحقاً من «ضبط السقف».
 */
function ApproveJoinForm({ companyPath, request, onApproved, onCancel }) {
  const idPrefix = useId();
  const [role, setRole] = useState('');
  const [ceiling, setCeiling] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const ceilingNumber = Number(ceiling);
  const ceilingValid = ceiling.trim() !== '' && Number.isFinite(ceilingNumber) && ceilingNumber >= 0;
  const canSubmit = JOIN_ASSIGNABLE_ROLES.includes(role) && ceilingValid;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch(`${companyPath}/join-requests/${encodeURIComponent(request.id)}/approve`, {
        method: 'POST',
        body: { role, per_request_ceiling: ceilingNumber }
      });
      onApproved(`اعتُمد ${request.full_name} ${roleLabel(data?.user?.role ?? role)} بسقف ${formatSAR(ceilingNumber)} للطلب الواحد.`);
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    // noValidate: فقاعات تحقق المتصفح تظهر بلغته، ونريد رسائل الخادم العربية بدلها.
    <form noValidate onSubmit={handleSubmit} className="flex max-w-measure flex-col gap-5">
      <p className="text-sm text-muted">
        <bdi>{request.email}</bdi>
      </p>
      <Field id={`${idPrefix}-role`} as="select" label="الدور" value={role} onChange={(event) => setRole(event.target.value)} disabled={submitting}>
        <option value="" disabled>
          اختر الدور
        </option>
        {JOIN_ASSIGNABLE_ROLES.map((option) => (
          <option key={option} value={option}>
            {roleLabel(option)}
          </option>
        ))}
      </Field>
      <Field
        id={`${idPrefix}-ceiling`}
        label="سقف الطلب الواحد (ر.س)"
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={ceiling}
        onChange={(event) => setCeiling(event.target.value)}
        disabled={submitting}
        hint={<p className="text-muted">تجاوز هذا السقف لا يمنع الطلب، بل يرفعه لمعتمِد أعلى. السقف الشهري والفئات تضبطها لاحقاً من «ضبط السقف».</p>}
      />

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canSubmit} loading={submitting} loadingText="جارٍ الاعتماد…">
          اعتماد الطلب
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

/** رفض طلب: السبب إلزامي بحدّ الرفض نفسه في المنصة كلها (ReasonField · reasonReady)، ورسالة الخادم كما هي. */
function RejectJoinForm({ companyPath, request, onRejected, onCancel }) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetch(`${companyPath}/join-requests/${encodeURIComponent(request.id)}/reject`, {
        method: 'POST',
        body: { reason: reason.trim() }
      });
      onRejected(data?.message ?? null);
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return (
    <div className="flex max-w-measure flex-col gap-5">
      <p className="text-sm text-muted">
        <bdi>{request.email}</bdi> — لن يستطيع الدخول. ويمكنه أن يرسل طلباً جديداً بالبريد نفسه إن كان الرفض خطأً.
      </p>
      <ReasonField id={reasonId} label="سبب الرفض" value={reason} onChange={(event) => setReason(event.target.value)} disabled={sending} />

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button variant="signal" onClick={confirm} disabled={!reasonReady(reason)} loading={sending} loadingText="جارٍ الرفض…">
          تأكيد الرفض
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}
