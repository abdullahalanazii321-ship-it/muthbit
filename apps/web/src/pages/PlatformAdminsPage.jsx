import { useId, useState } from 'react';
import { apiFetch, errorMessage } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { isPasswordValid } from '../lib/passwordPolicy.js';
import { userStatusLabel } from '../lib/labels.js';
import AppShell from '../components/AppShell.jsx';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import PanelCard from '../components/PanelCard.jsx';
import PasswordRules from '../components/PasswordRules.jsx';
import ReasonField, { reasonReady } from '../components/ReasonField.jsx';
import Switch from '../components/Switch.jsx';
import { Badge } from '../components/StatusBadge.jsx';
import { RecordCard, RecordCards, RecordCardsSkeleton, RecordField } from '../components/RecordCard.jsx';

const isAdminsResponse = (data) => Array.isArray(data?.admins);
const SUSPENDED = 'suspended';
const COLUMNS = ['الاسم', 'البريد', 'الحالة', 'قراءة سجل الوصول', 'إجراءات'];

/**
 * مسؤولو المنصة — لمالك المنصة (canManagePlatform): إنشاء حساب، ومنح قراءة سجل الوصول وسحبها،
 * والإيقاف وإعادة التفعيل بسبب مكتوب — الزران في الخانة نفسها: الإيقاف للنشط، وإعادة التفعيل للموقوف.
 * حساب المالك مميَّز وبلا أي إجراء — لا زر معطّل، بل لا زر أصلاً: الخادم يرفض إيقافه وسحب قراءته على كل حال.
 * بعد كل إجراء تُعاد القائمة من الخادم — لا تحديث محلي بالتخمين.
 */
export default function PlatformAdminsPage() {
  const admins = useResource('/api/platform/admins', isAdminsResponse);
  const list = admins.status === 'ready' ? admins.data.admins : [];
  // لوحة واحدة في كل مرة: { kind: 'new' } · { kind: 'grant', admin } · { kind: 'suspend', admin } · { kind: 'activate', admin }
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState(null);
  // سحب القراءة بلا تأكيد (يسلب ولا يمنح شيئاً يُخشى منه)، فحالته هنا: الصف الجاري ورسالة فشله.
  const [revokingId, setRevokingId] = useState(null);
  const [rowError, setRowError] = useState(null);

  function open(next) {
    setNotice(null);
    setRowError(null);
    setPanel(next);
  }

  function finish(text) {
    setPanel(null);
    setNotice(text || null);
    admins.reload();
  }

  async function revoke(admin) {
    if (revokingId) return;
    setPanel(null);
    setNotice(null);
    setRowError(null);
    setRevokingId(admin.id);
    try {
      const data = await apiFetch(`/api/platform/admins/${encodeURIComponent(admin.id)}/access-log-reader`, {
        method: 'PUT',
        body: { allowed: false }
      });
      setRevokingId(null);
      finish(data?.message ?? null);
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      setRevokingId(null);
      setRowError(errorMessage(err));
    }
  }

  // المفتاح يمنح بتأكيد ويسحب مباشرة.
  const toggleReader = (admin) => (admin.can_read_access_log ? revoke(admin) : open({ kind: 'grant', admin }));

  const rowProps = {
    busy: admins.refreshing,
    revokingId,
    onToggleReader: toggleReader,
    onSuspend: (admin) => open({ kind: 'suspend', admin }),
    onActivate: (admin) => open({ kind: 'activate', admin })
  };

  return (
    <AppShell title="مسؤولو المنصة" action={<Button onClick={() => open({ kind: 'new' })}>مسؤول منصة جديد</Button>}>
      {/* break-words موروثة: اسم أو بريد طويل بلا مسافة ينكسر ولا يمدّ الصفحة. */}
      <main className="break-words px-4 py-8">
        {notice && (
          <div className="mb-6">
            <Alert tone="seal">{notice}</Alert>
          </div>
        )}
        {rowError && (
          <div className="mb-6">
            <Alert>{rowError}</Alert>
          </div>
        )}

        {panel?.kind === 'new' && (
          <PanelCard key="new" title="مسؤول منصة جديد">
            <NewAdminForm onCreated={(name) => finish(`أُنشئ حساب «${name}».`)} onCancel={() => setPanel(null)} />
          </PanelCard>
        )}
        {panel?.kind === 'grant' && (
          <PanelCard key={`grant-${panel.admin.id}`} title={`منح ${panel.admin.full_name} قراءة سجل الوصول`}>
            <GrantConfirm admin={panel.admin} onGranted={finish} onCancel={() => setPanel(null)} />
          </PanelCard>
        )}
        {panel?.kind === 'suspend' && (
          <PanelCard key={`suspend-${panel.admin.id}`} title={`إيقاف ${panel.admin.full_name}`}>
            <SuspendAdmin admin={panel.admin} onSuspended={finish} onCancel={() => setPanel(null)} />
          </PanelCard>
        )}
        {panel?.kind === 'activate' && (
          <PanelCard key={`activate-${panel.admin.id}`} title={`إعادة تفعيل ${panel.admin.full_name}`}>
            <ActivateAdmin admin={panel.admin} onActivated={finish} onCancel={() => setPanel(null)} />
          </PanelCard>
        )}

        <div className={panel ? 'mt-6' : ''}>
          {admins.status === 'loading' && <AdminsList loading />}

          {admins.status === 'error' && (
            <div className="flex flex-col items-start gap-4">
              <Alert>{admins.error.message}</Alert>
              <Button variant="secondary" onClick={admins.reload}>
                إعادة المحاولة
              </Button>
            </div>
          )}

          {admins.status === 'ready' && list.length === 0 && <p className="text-sm text-muted">لا توجد حسابات.</p>}

          {admins.status === 'ready' && list.length > 0 && (
            <>
              {admins.refreshing && (
                <p role="status" className="mb-3 text-sm text-muted">
                  جارٍ التحديث…
                </p>
              )}
              <AdminsList admins={list} {...rowProps} />
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

/** بطاقات تحت ١٠٢٤ بكسل والجدول فوقها — كبقية القوائم. */
function AdminsList(props) {
  return (
    <>
      <div className="lg:hidden">
        <AdminsCards {...props} />
      </div>
      <div className="hidden lg:block">
        <AdminsTable {...props} />
      </div>
    </>
  );
}

function StatusBadgeFor({ status }) {
  return <Badge tone={status === SUSPENDED ? 'signal' : 'muted'}>{userStatusLabel(status)}</Badge>;
}

/**
 * صلاحية قراءة السجل: للمالك «دائماً» نصاً بلا مفتاح، ولغيره مفتاح.
 * العنوان label للمفتاح، فالضغط على النص يقلبه — والصف كله ٤٤ بكسل تحت ٧٦٨ فيُلمس بإصبع.
 */
function ReaderCell({ admin, busy, revokingId, onToggleReader }) {
  const id = useId();
  if (admin.is_platform_owner) return <span className="text-ink">دائماً — مالك المنصة</span>;
  const pending = revokingId === admin.id;
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 md:min-h-0">
      <Switch
        id={id}
        checked={admin.can_read_access_log}
        onClick={() => onToggleReader(admin)}
        disabled={busy || (revokingId !== null && !pending)}
      />
      <span className="text-sm text-ink">{pending ? 'جارٍ السحب…' : admin.can_read_access_log ? 'ممنوحة' : 'غير ممنوحة'}</span>
    </label>
  );
}

/** الإيقاف لغير المالك وللنشط وحده، وإعادة التفعيل للموقوف وحده. المالك بلا زر أصلاً. */
const canSuspend = (admin) => !admin.is_platform_owner && admin.status !== SUSPENDED;
const canActivate = (admin) => !admin.is_platform_owner && admin.status === SUSPENDED;

/** زر الصف: «إيقاف» للنشط أو «إعادة تفعيل» للموقوف — لا يجتمعان، فمكانهما واحد. */
function RowAction({ admin, busy, onSuspend, onActivate, className = '' }) {
  if (canSuspend(admin)) {
    return (
      <Button variant="secondary" className={className} onClick={() => onSuspend(admin)} disabled={busy}>
        إيقاف
      </Button>
    );
  }
  if (canActivate(admin)) {
    return (
      <Button variant="secondary" className={className} onClick={() => onActivate(admin)} disabled={busy}>
        إعادة تفعيل
      </Button>
    );
  }
  return null;
}

function NameCell({ admin }) {
  return (
    // max-w-full و min-w-0: عنصر flex لا ينكمش دون أطول كلمة فيه، فاسم طويل بلا مسافة كان يمدّ الصفحة إلى ٥١٥ بكسل على ٣٦٠.
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <span className="min-w-0 max-w-full break-words">{admin.full_name}</span>
      {admin.is_platform_owner && <Badge tone="seal">مالك المنصة</Badge>}
    </span>
  );
}

function AdminsCards({ loading = false, admins = [], busy, revokingId, onToggleReader, onSuspend, onActivate }) {
  if (loading) return <RecordCardsSkeleton lines={3} />;
  return (
    <RecordCards label="مسؤولو المنصة">
      {admins.map((admin) => (
        <RecordCard
          key={admin.id}
          title={<NameCell admin={admin} />}
          badge={<StatusBadgeFor status={admin.status} />}
          actions={
            canSuspend(admin) || canActivate(admin) ? (
              <RowAction admin={admin} busy={busy} onSuspend={onSuspend} onActivate={onActivate} className="w-full" />
            ) : null
          }
        >
          <RecordField label="البريد">
            <bdi>{admin.email}</bdi>
          </RecordField>
          <RecordField label="قراءة سجل الوصول">
            <ReaderCell admin={admin} busy={busy} revokingId={revokingId} onToggleReader={onToggleReader} />
          </RecordField>
        </RecordCard>
      ))}
    </RecordCards>
  );
}

function AdminsTable({ loading = false, admins = [], busy, revokingId, onToggleReader, onSuspend, onActivate }) {
  const cell = 'px-4 py-3';
  return (
    <div className="rounded border border-line bg-surface">
      <table className="w-full text-sm" aria-busy={loading || undefined}>
        {loading && <caption className="sr-only">جارٍ التحميل…</caption>}
        <thead className="bg-surface-2">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className={`${cell} whitespace-nowrap text-start font-medium text-muted`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 3 }, (_, row) => (
                <tr key={row} className="border-t border-line">
                  {COLUMNS.map((column) => (
                    <td key={column} className={cell}>
                      <div className="h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            : admins.map((admin) => (
                <tr key={admin.id} className="border-t border-line">
                  <td className={`${cell} text-ink`}>
                    <NameCell admin={admin} />
                  </td>
                  <td className={cell}>
                    <bdi>{admin.email}</bdi>
                  </td>
                  <td className={cell}>
                    <StatusBadgeFor status={admin.status} />
                  </td>
                  <td className={cell}>
                    <ReaderCell admin={admin} busy={busy} revokingId={revokingId} onToggleReader={onToggleReader} />
                  </td>
                  <td className={cell}>
                    <RowAction admin={admin} busy={busy} onSuspend={onSuspend} onActivate={onActivate} className="whitespace-nowrap" />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

/** إنشاء مسؤول منصة: الاسم والبريد وكلمة المرور بعدّاد الشروط وزر العين — كإنشاء مستخدم في الفريق. */
function NewAdminForm({ onCreated, onCancel }) {
  const idPrefix = useId();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = form.fullName.trim().length >= 2 && form.email.trim() !== '' && isPasswordValid(form.password);
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    const body = { full_name: form.fullName.trim(), email: form.email.trim(), password: form.password };
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch('/api/platform/admins', { method: 'POST', body });
      onCreated(data?.admin?.full_name ?? body.full_name);
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
      <Field id={`${idPrefix}-name`} label="الاسم" maxLength={160} value={form.fullName} onChange={update('fullName')} disabled={submitting} />
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
      <p className="text-sm text-muted">يُنشأ مسؤول منصة بلا صلاحية قراءة سجل الوصول — تمنحها لاحقاً إن شئت.</p>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canSubmit} loading={submitting} loadingText="جارٍ الإنشاء…">
          إنشاء الحساب
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

/** تأكيد المنح: ما سيراه صاحب الحساب يُقال كاملاً قبل التنفيذ. */
function GrantConfirm({ admin, onGranted, onCancel }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/platform/admins/${encodeURIComponent(admin.id)}/access-log-reader`, {
        method: 'PUT',
        body: { allowed: true }
      });
      onGranted(data?.message ?? null);
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
        <p>سيرى {admin.full_name} سجل الوصول كاملاً: من اطّلع على بيانات أي شركة أو مورد، ومتى، وأي عملية.</p>
        <p className="mt-2">يُقيَّد هذا المنح في السجل، ويُقيَّد كل فتح له للسجل بعده. وتستطيع سحب الصلاحية متى شئت.</p>
      </Alert>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button onClick={confirm} loading={sending} loadingText="جارٍ المنح…">
          تأكيد المنح
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}

/** إيقاف مسؤول بسبب مكتوب — بقاعدة الإيقاف نفسها في المنصة (ReasonField · reasonReady) ورسالة الخادم كما هي. */
function SuspendAdmin({ admin, onSuspended, onCancel }) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/platform/admins/${encodeURIComponent(admin.id)}/suspend`, {
        method: 'POST',
        body: { reason: reason.trim() }
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
        <p>لن يستطيع {admin.full_name} الدخول بعد التأكيد. وتستطيع إعادة تفعيله لاحقاً بسبب مكتوب.</p>
      </Alert>
      <ReasonField id={reasonId} label="سبب الإيقاف" value={reason} onChange={(event) => setReason(event.target.value)} disabled={sending} />

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button variant="signal" onClick={confirm} disabled={!reasonReady(reason)} loading={sending} loadingText="جارٍ الإيقاف…">
          تأكيد الإيقاف
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}

/**
 * إعادة تفعيل مسؤول موقوف بسبب مكتوب — بقاعدة الإيقاف نفسها، ورسالة الخادم كما هي.
 * ما يحدث معها يُقال قبل التأكيد: تنتهي جلساته القديمة، وتُسحب قراءة سجل الوصول إن كانت ممنوحة.
 */
function ActivateAdmin({ admin, onActivated, onCancel }) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/platform/admins/${encodeURIComponent(admin.id)}/activate`, {
        method: 'POST',
        body: { reason: reason.trim() }
      });
      onActivated(data?.message ?? null);
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
        <p>سيستطيع {admin.full_name} الدخول من جديد بعد التأكيد، وتنتهي كل جلساته السابقة فيدخل بكلمة مروره.</p>
        <p className="mt-2">
          {admin.can_read_access_log
            ? 'وتُسحب منه قراءة سجل الوصول — تمنحها من جديد إن شئت.'
            : 'ويعود بلا قراءة سجل الوصول — تمنحها لاحقاً إن شئت.'}
        </p>
      </Alert>
      <ReasonField id={reasonId} label="سبب إعادة التفعيل" value={reason} onChange={(event) => setReason(event.target.value)} disabled={sending} />

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button onClick={confirm} disabled={!reasonReady(reason)} loading={sending} loadingText="جارٍ التفعيل…">
          تأكيد إعادة التفعيل
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}
