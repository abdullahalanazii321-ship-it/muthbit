import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { PLATFORM_HOME } from '../lib/access.js';
import {
  companyStatusLabel,
  companyStatusLabels,
  companyStatusTones,
  formatDate,
  formatRating,
  formatRatingCount,
  supplierStatusLabel,
  supplierStatusLabels,
  supplierStatusTones
} from '../lib/labels.js';
import { useResource } from '../lib/useResource.js';
import AppHeader from '../components/AppHeader.jsx';
import Alert from '../components/Alert.jsx';
import AuditEvents from '../components/AuditEvents.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import RequestsTable from '../components/RequestsTable.jsx';
import { Badge } from '../components/StatusBadge.jsx';

const TABS = [
  { key: 'companies', label: 'الشركات' },
  { key: 'suppliers', label: 'الموردون' }
];
const TAB_KEYS = TABS.map((tab) => tab.key);

const INSPECT_VIEWS = [
  { key: 'requests', label: 'طلبات الشركة' },
  { key: 'audit', label: 'سجل الشركة' }
];
const INSPECT_KEYS = INSPECT_VIEWS.map((view) => view.key);

// الحالات كما يقبلها الخادم في ?status= — لا حالة نخترعها.
const COMPANY_STATUSES = Object.keys(companyStatusLabels);
const SUPPLIER_STATUSES = Object.keys(supplierStatusLabels);

// مصدر التوثيق في جسم PATCH — manual | wathq وحدهما.
const SOURCES = [
  { value: 'manual', label: 'يدوي' },
  { value: 'wathq', label: 'واثق' }
];

const COMPANY_COLUMNS = ['الاسم', 'السجل التجاري', 'المدينة', 'الحالة', 'تاريخ التسجيل', 'إجراءات'];
const SUPPLIER_COLUMNS = ['الاسم', 'السجل التجاري', 'المدينة', 'حالة التوثيق', 'التقييم', 'إجراءات'];
const SKELETON_ROWS = 5;
const AUDIT_LIMIT = 100;
const MAX_REASON = 500; // حدّ reason في الخادم

const isCompaniesResponse = (data) => Array.isArray(data?.companies);
const isSuppliersResponse = (data) => Array.isArray(data?.suppliers);
const isRequestsResponse = (data) => Array.isArray(data?.requests);
const isCategoriesResponse = (data) => Array.isArray(data?.categories);

/**
 * لوحة مسؤول المنصة: توثيق الشركات والموردين، والاطلاع المسمّى على بيانات شركة واحدة.
 * مسؤول المنصة بلا شركة، فكل قراءة شركة هنا تسمّي شركتها في النداء (?company_id=)
 * — والخادم يقيّد ذلك الاطلاع في سجل تلك الشركة.
 * التبويب والشركة المفتوحة محفوظة في العنوان حتى لا تضيع عند التحديث.
 */
export default function PlatformPage() {
  const [params, setParams] = useSearchParams();

  const openCompanyId = (params.get('company') ?? '').trim();
  const requestedTab = params.get('tab');
  // شركة مفتوحة تعني تبويب الشركات مهما قال ?tab=، وقيمة غير معروفة تُهمل.
  const tab = openCompanyId ? 'companies' : TAB_KEYS.includes(requestedTab) ? requestedTab : 'companies';

  const requestedView = params.get('view');
  const view = INSPECT_KEYS.includes(requestedView) ? requestedView : 'requests';

  const statuses = tab === 'companies' ? COMPANY_STATUSES : SUPPLIER_STATUSES;
  const requestedStatus = params.get('status');
  const statusFilter = statuses.includes(requestedStatus) ? requestedStatus : '';

  // كل انتقال يكتب العنوان كاملاً: تبديل التبويب يُسقط تصفية لا تخصه، وفتح شركة يُسقطها كلها.
  const selectTab = (key) => setParams(key === 'companies' ? {} : { tab: key });
  const selectStatus = (value) => setParams(value ? { tab, status: value } : { tab });
  const openCompany = (id) => setParams({ tab: 'companies', company: id });
  const selectView = (key) => setParams({ tab: 'companies', company: openCompanyId, view: key });
  const closeCompany = () => setParams({ tab: 'companies' });

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-2xl font-semibold text-ink">لوحة المنصة</h1>
        <p className="mt-1 text-sm text-muted">
          توثيق الشركات والموردين. المورد لا يقدّم عرضاً قبل توثيقه، والشركة لا تدخل قبل تفعيلها.
        </p>

        {!openCompanyId && (
          <div role="tablist" aria-label="أقسام اللوحة" className="mt-6 flex gap-1 border-b border-line">
            {TABS.map((item) => (
              <TabButton key={item.key} selected={tab === item.key} onClick={() => selectTab(item.key)}>
                {item.label}
              </TabButton>
            ))}
          </div>
        )}

        <div className="mt-6">
          {tab === 'companies' ? (
            <CompaniesTab
              statusFilter={statusFilter}
              onStatus={selectStatus}
              openCompanyId={openCompanyId}
              onOpen={openCompany}
              onClose={closeCompany}
              view={view}
              onView={selectView}
            />
          ) : (
            <SuppliersTab statusFilter={statusFilter} onStatus={selectStatus} />
          )}
        </div>
      </main>
    </div>
  );
}

function TabButton({ selected, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`-mb-px rounded-t-sm border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal ${
        selected ? 'border-seal text-ink' : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/* ───────────────────────────── الشركات ───────────────────────────── */

function CompaniesTab({ statusFilter, onStatus, openCompanyId, onOpen, onClose, view, onView }) {
  const path = `/api/companies${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''}`;
  const companies = useResource(path, isCompaniesResponse);
  const list = companies.status === 'ready' ? companies.data.companies : null;

  // لوحة واحدة مفتوحة في كل مرة: { kind: 'verify' | 'suspend', company }
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState(null);

  function openPanel(next) {
    setNotice(null);
    setPanel(next);
  }

  // بعد كل إجراء ناجح: تُغلق البطاقة وتُعاد القائمة من الخادم — لا تحديث محلي بالتخمين.
  function finish(text) {
    setPanel(null);
    setNotice(text);
    companies.reload();
  }

  if (openCompanyId) {
    return (
      <CompanyInspect
        companyId={openCompanyId}
        company={list ? list.find((item) => item.id === openCompanyId) ?? null : null}
        resolving={companies.status === 'loading'}
        onClose={onClose}
        view={view}
        onView={onView}
      />
    );
  }

  return (
    <div>
      <div className="max-w-xs">
        <Field id="company-status" as="select" label="الحالة" value={statusFilter} onChange={(e) => onStatus(e.target.value)}>
          <option value="">الكل</option>
          {COMPANY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {companyStatusLabels[status]}
            </option>
          ))}
        </Field>
      </div>

      {notice && (
        <div className="mt-6">
          <Alert tone="seal">{notice}</Alert>
        </div>
      )}

      {panel?.kind === 'verify' && (
        <PanelCard key={`verify-${panel.company.id}`} title={`توثيق ${panel.company.name}`}>
          <VerifyCompany company={panel.company} onDone={finish} onCancel={() => setPanel(null)} />
        </PanelCard>
      )}
      {panel?.kind === 'suspend' && (
        <PanelCard key={`suspend-${panel.company.id}`} title={`إيقاف ${panel.company.name}`}>
          <SuspendCompany company={panel.company} onDone={finish} onCancel={() => setPanel(null)} />
        </PanelCard>
      )}

      <div className="mt-6">
        {companies.status === 'loading' && <CompaniesTable loading />}

        {companies.status === 'error' && <LoadError message={companies.error.message} onRetry={companies.reload} />}

        {companies.status === 'ready' && list.length === 0 && (
          <EmptyState
            text={statusFilter ? 'لا توجد شركات بهذه التصفية' : 'لا توجد شركات بعد'}
            filtered={Boolean(statusFilter)}
            onShowAll={() => onStatus('')}
          />
        )}

        {companies.status === 'ready' && list.length > 0 && (
          <>
            {companies.refreshing && <Refreshing />}
            <CompaniesTable
              companies={list}
              busy={companies.refreshing}
              onVerify={(company) => openPanel({ kind: 'verify', company })}
              onSuspend={(company) => openPanel({ kind: 'suspend', company })}
              onOpen={(company) => {
                setPanel(null);
                setNotice(null);
                onOpen(company.id);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function CompaniesTable({ loading = false, companies = [], busy = false, onVerify, onSuspend, onOpen }) {
  const cell = 'whitespace-nowrap px-4 py-3';
  return (
    <TableShell columns={COMPANY_COLUMNS} loading={loading}>
      {companies.map((company) => (
        <tr key={company.id} className="border-t border-line">
          <td className="px-4 py-3 text-ink">{company.name}</td>
          <td className={`${cell} font-mono`}>
            <bdi>{company.cr_number}</bdi>
          </td>
          <td className={cell}>{company.city || '—'}</td>
          <td className={cell}>
            <Badge tone={companyStatusTones[company.status]}>{companyStatusLabel(company.status)}</Badge>
          </td>
          <td className={`${cell} tabular-nums`}>{formatDate(company.created_at)}</td>
          <td className={cell}>
            <div className="flex flex-wrap gap-2">
              {/* التوثيق لغير الموثّقة، والإيقاف للموثّقة وحدها — لا زر بلا أثر. */}
              {company.status !== 'active' && (
                <Button onClick={() => onVerify(company)} disabled={busy}>
                  توثيق
                </Button>
              )}
              {company.status === 'active' && (
                <Button variant="signal" onClick={() => onSuspend(company)} disabled={busy}>
                  إيقاف
                </Button>
              )}
              <Button variant="secondary" onClick={() => onOpen(company)} disabled={busy}>
                فتح الشركة
              </Button>
            </div>
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

/** ما يفعله PATCH /api/companies/:id/verification حرفياً — يُقال قبل التنفيذ لا بعده. */
function VerifyCompany({ company, onDone, onCancel }) {
  const sourceId = useId();
  const [source, setSource] = useState('manual');
  const action = useAction(async () => {
    await apiFetch(`/api/companies/${encodeURIComponent(company.id)}/verification`, {
      method: 'PATCH',
      body: { status: 'active', source }
    });
    onDone(`وُثّقت شركة «${company.name}».`);
  });

  return (
    <div className="flex max-w-measure flex-col gap-5">
      <Alert tone="seal">
        <p>سيحدث عند التأكيد:</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>تفعيل الشركة فتصبح موثّقة.</li>
          <li className="font-semibold">
            تفعيل حساب مالك الشركة إن كانت حالته «بانتظار التفعيل» — وبهذا وحده تستطيع الشركة الدخول.
          </li>
        </ul>
      </Alert>

      <Field
        id={sourceId}
        as="select"
        label="مصدر التوثيق"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        disabled={action.sending}
      >
        {SOURCES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Field>

      {action.error && <Alert>{action.error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button onClick={action.submit} loading={action.sending} loadingText="جارٍ التوثيق…">
          تأكيد التوثيق
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={action.sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}

function SuspendCompany({ company, onDone, onCancel }) {
  const action = useAction(async () => {
    await apiFetch(`/api/companies/${encodeURIComponent(company.id)}/verification`, {
      method: 'PATCH',
      body: { status: 'suspended' }
    });
    onDone(`أُوقفت شركة «${company.name}» وكل مستخدميها.`);
  });

  return (
    <div className="flex max-w-measure flex-col gap-5">
      <Alert>
        <p>سيحدث عند التأكيد:</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li className="font-semibold">إيقاف كل مستخدمي الشركة بلا استثناء، ومنهم المالك.</li>
          <li>لا يدخل أحد منهم بعدها، ولا يُنشأ طلب ولا يُعتمد.</li>
        </ul>
        <p className="mt-2">
          إعادة التوثيق لاحقاً تعيد تفعيل مالك الشركة، ويتولى هو إعادة بقية الفريق.
        </p>
      </Alert>

      {action.error && <Alert>{action.error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button variant="signal" onClick={action.submit} loading={action.sending} loadingText="جارٍ الإيقاف…">
          تأكيد الإيقاف
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={action.sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────── الاطلاع على شركة واحدة ────────────────────── */

/**
 * قسم الاطلاع: طلبات الشركة وسجلها، كلاهما بنداء يسمّي الشركة صراحةً.
 * التنبيه فوق كل شيء وثابت: الشركة ترى هذا الاطلاع في سجلها، ومن حق من يطّلع أن يعرف ذلك قبل أن يضغط.
 * القسمان الفرعيان لا يُحمَّلان معاً: كل فتح قيد مستقل في سجل الشركة، فلا نكتب قيدين بضغطة واحدة.
 */
function CompanyInspect({ companyId, company, resolving, onClose, view, onView }) {
  const requestsPath = `/api/requests?company_id=${encodeURIComponent(companyId)}`;
  const auditPath = `/api/audit?company_id=${encodeURIComponent(companyId)}&limit=${AUDIT_LIMIT}`;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">
          {company ? (
            company.name
          ) : resolving ? (
            <span className="inline-block h-6 w-48 rounded-sm bg-surface-2 align-middle motion-safe:animate-pulse" />
          ) : (
            <bdi className="font-mono text-base">{companyId}</bdi>
          )}
        </h2>
        <Button variant="secondary" onClick={onClose}>
          إغلاق
        </Button>
      </div>

      {company && (
        <p className="mt-1 text-sm text-muted">
          <bdi className="font-mono">{company.cr_number}</bdi>
          <span className="ms-3">{companyStatusLabel(company.status)}</span>
        </p>
      )}

      <div className="mt-4">
        <Alert>
          كل اطلاع على بيانات هذه الشركة يُسجَّل في سجل التدقيق الخاص بها، وتراه الشركة كما ترى أي حدث آخر.
        </Alert>
      </div>

      <div role="tablist" aria-label="بيانات الشركة" className="mt-6 flex gap-1 border-b border-line">
        {INSPECT_VIEWS.map((item) => (
          <TabButton key={item.key} selected={view === item.key} onClick={() => onView(item.key)}>
            {item.label}
          </TabButton>
        ))}
      </div>

      <div className="mt-6">
        {view === 'requests' ? (
          <CompanyRequests key={requestsPath} path={requestsPath} />
        ) : (
          <AuditEvents
            key={auditPath}
            path={auditPath}
            backTo={PLATFORM_HOME}
            emptyText="لا توجد أحداث في سجل هذه الشركة"
          />
        )}
      </div>
    </section>
  );
}

function CompanyRequests({ path }) {
  const requests = useResource(path, isRequestsResponse);

  if (requests.status === 'loading') return <RequestsTable loading />;
  if (requests.status === 'error') return <LoadError message={requests.error.message} onRetry={requests.reload} />;

  const list = requests.data.requests;
  if (list.length === 0) {
    return (
      <div className="rounded border border-line bg-surface p-6 sm:p-8">
        <p className="text-ink">لا توجد طلبات لهذه الشركة</p>
      </div>
    );
  }
  // بلا روابط: شاشة تفاصيل الطلب مبنية لمستخدم الشركة ولن تعمل كما ينبغي من هنا.
  return <RequestsTable requests={list} linked={false} />;
}

/* ───────────────────────────── الموردون ───────────────────────────── */

function SuppliersTab({ statusFilter, onStatus }) {
  const path = `/api/suppliers${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''}`;
  const suppliers = useResource(path, isSuppliersResponse);
  const list = suppliers.status === 'ready' ? suppliers.data.suppliers : null;

  // لوحة واحدة مفتوحة في كل مرة: { kind: 'verify' | 'reject' | 'suspend', supplier }
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState(null);

  function openPanel(next) {
    setNotice(null);
    setPanel(next);
  }

  function finish(text) {
    setPanel(null);
    setNotice(text);
    suppliers.reload();
  }

  const titles = { verify: 'توثيق', reject: 'رفض', suspend: 'إيقاف' };

  return (
    <div>
      <div className="max-w-xs">
        <Field id="supplier-status" as="select" label="حالة التوثيق" value={statusFilter} onChange={(e) => onStatus(e.target.value)}>
          <option value="">الكل</option>
          {SUPPLIER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {supplierStatusLabels[status]}
            </option>
          ))}
        </Field>
      </div>

      {notice && (
        <div className="mt-6">
          <Alert tone="seal">{notice}</Alert>
        </div>
      )}

      {panel && (
        <PanelCard key={`${panel.kind}-${panel.supplier.id}`} title={`${titles[panel.kind]} ${panel.supplier.name}`}>
          {panel.kind === 'verify' && (
            <VerifySupplier supplier={panel.supplier} onDone={finish} onCancel={() => setPanel(null)} />
          )}
          {panel.kind === 'reject' && (
            <RejectSupplier supplier={panel.supplier} onDone={finish} onCancel={() => setPanel(null)} />
          )}
          {panel.kind === 'suspend' && (
            <SuspendSupplier supplier={panel.supplier} onDone={finish} onCancel={() => setPanel(null)} />
          )}
        </PanelCard>
      )}

      <div className="mt-6">
        {suppliers.status === 'loading' && <SuppliersTable loading />}

        {suppliers.status === 'error' && <LoadError message={suppliers.error.message} onRetry={suppliers.reload} />}

        {suppliers.status === 'ready' && list.length === 0 && (
          <EmptyState
            text={statusFilter ? 'لا يوجد موردون بهذه التصفية' : 'لا يوجد موردون بعد'}
            filtered={Boolean(statusFilter)}
            onShowAll={() => onStatus('')}
          />
        )}

        {suppliers.status === 'ready' && list.length > 0 && (
          <>
            {suppliers.refreshing && <Refreshing />}
            <SuppliersTable
              suppliers={list}
              busy={suppliers.refreshing}
              onAction={(kind, supplier) => openPanel({ kind, supplier })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function SuppliersTable({ loading = false, suppliers = [], busy = false, onAction }) {
  const cell = 'whitespace-nowrap px-4 py-3';
  return (
    <TableShell columns={SUPPLIER_COLUMNS} loading={loading}>
      {suppliers.map((supplier) => {
        const status = supplier.verification_status;
        const rated = supplier.rating !== null && supplier.rating !== undefined && supplier.rating !== '';
        return (
          <tr key={supplier.id} className="border-t border-line">
            <td className="px-4 py-3 text-ink">{supplier.name}</td>
            <td className={`${cell} font-mono`}>
              <bdi>{supplier.cr_number}</bdi>
            </td>
            <td className={cell}>{supplier.city || '—'}</td>
            <td className={cell}>
              <Badge tone={supplierStatusTones[status]}>{supplierStatusLabel(status)}</Badge>
            </td>
            <td className={`${cell} tabular-nums`}>
              {rated ? (
                <div>
                  <p className="text-ink">{formatRating(supplier.rating)}</p>
                  {supplier.rating_count > 0 && (
                    <p className="text-xs text-muted">{formatRatingCount(supplier.rating_count)}</p>
                  )}
                </div>
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>
            <td className={cell}>
              <div className="flex flex-wrap gap-2">
                {status === 'pending' && (
                  <>
                    <Button onClick={() => onAction('verify', supplier)} disabled={busy}>
                      توثيق
                    </Button>
                    <Button variant="signal" onClick={() => onAction('reject', supplier)} disabled={busy}>
                      رفض
                    </Button>
                  </>
                )}
                {status === 'verified' && (
                  <Button variant="signal" onClick={() => onAction('suspend', supplier)} disabled={busy}>
                    إيقاف
                  </Button>
                )}
                {(status === 'rejected' || status === 'suspended') && (
                  <Button onClick={() => onAction('verify', supplier)} disabled={busy}>
                    إعادة التوثيق
                  </Button>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </TableShell>
  );
}

/**
 * توثيق مورد: الفئات المعروضة هي ما سجّله المورد وحده (لا فئات المنصة كلها)،
 * والمعتمد منها اليوم مؤشَّر مسبقاً.
 * والفرق جوهري: اختيار بعضها يعتمد المذكور وحده، وتركه فارغاً يعتمد كل ما سجّله.
 */
function VerifySupplier({ supplier, onDone, onCancel }) {
  const sourceId = useId();
  const categories = useResource(
    `/api/suppliers/${encodeURIComponent(supplier.id)}/categories`,
    isCategoriesResponse
  );
  // null قبل وصول الفئات: لا نبدأ باختيار فارغ يعني «اعتمد الكل» قبل أن نعرف ما المعتمد الآن.
  const [selected, setSelected] = useState(null);
  const [source, setSource] = useState('manual');

  const ready = categories.status === 'ready';
  const list = ready ? categories.data.categories : [];
  const chosen = selected ?? [];

  // ما هو معتمد اليوم يبدأ مؤشَّراً، فلا يسحب التوثيقُ اعتماداً قائماً بسكوت المستخدم.
  useEffect(() => {
    if (categories.status !== 'ready') return;
    setSelected(categories.data.categories.filter((category) => category.approved).map((category) => category.id));
  }, [categories.status, categories.data]);

  const action = useAction(async () => {
    const body = { status: 'verified', source };
    if (chosen.length) body.approve_category_ids = chosen;
    await apiFetch(`/api/suppliers/${encodeURIComponent(supplier.id)}/verification`, { method: 'PATCH', body });
    onDone(`وُثّق المورد «${supplier.name}».`);
  });

  function toggle(id) {
    setSelected((current) => {
      const value = current ?? [];
      return value.includes(id) ? value.filter((item) => item !== id) : [...value, id];
    });
  }

  return (
    <div className="flex max-w-measure flex-col gap-5">
      <Alert tone="seal">
        <p>سيحدث عند التأكيد:</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>تفعيل حسابات المورد المعلّقة، فيستطيع الدخول وتقديم العروض.</li>
          <li>اعتماد فئاته على ما تختاره أدناه.</li>
        </ul>
      </Alert>

      <fieldset>
        <legend className="text-sm font-medium text-ink">الفئات المعتمدة</legend>

        {categories.status === 'loading' && (
          <p role="status" className="mt-2 text-sm text-muted">
            جارٍ تحميل الفئات…
          </p>
        )}

        {categories.status === 'error' && (
          <div className="mt-2 flex flex-col items-start gap-3">
            <Alert>{categories.error.message}</Alert>
            <Button variant="secondary" onClick={categories.reload} disabled={action.sending}>
              إعادة المحاولة
            </Button>
            <p className="text-sm text-muted">يمكنك التوثيق بلا اختيار: تُعتمد كل الفئات التي سجّلها المورد.</p>
          </div>
        )}

        {ready && list.length > 0 && (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {list.map((category) => (
                <label key={category.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="size-4 rounded-sm border-line-strong accent-seal"
                    checked={chosen.includes(category.id)}
                    onChange={() => toggle(category.id)}
                    disabled={action.sending}
                  />
                  {category.name_ar}
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">اترك الاختيار فارغاً لاعتماد كل الفئات التي سجّلها المورد.</p>
          </>
        )}

        {/* مورد بلا فئة حالة صحيحة لا خطأ: يُوثَّق ويدخل، ولا يصله طلب. يُقال صراحةً قبل التأكيد. */}
        {ready && list.length === 0 && (
          <p className="mt-3 text-sm text-signal">
            هذا المورد لم يسجّل أي فئة. توثيقه يسمح له بالدخول لكنه لن يرى أي طلب.
          </p>
        )}
      </fieldset>

      <Field
        id={sourceId}
        as="select"
        label="مصدر التوثيق"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        disabled={action.sending}
      >
        {SOURCES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Field>

      {action.error && <Alert>{action.error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button onClick={action.submit} loading={action.sending} loadingText="جارٍ التوثيق…">
          تأكيد التوثيق
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={action.sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}

function RejectSupplier({ supplier, onDone, onCancel }) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  const action = useAction(async () => {
    await apiFetch(`/api/suppliers/${encodeURIComponent(supplier.id)}/verification`, {
      method: 'PATCH',
      body: { status: 'rejected', reason: trimmed }
    });
    onDone(`رُفض توثيق المورد «${supplier.name}».`);
  });

  return (
    <div className="flex max-w-measure flex-col gap-5">
      <Alert>
        <p>سيحدث عند التأكيد:</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>إيقاف كل حسابات المورد، فلا يدخل أحد منها.</li>
          <li className="font-semibold">سحب كل عروضه المقدَّمة من كل الطلبات المفتوحة.</li>
        </ul>
      </Alert>

      <Field
        id={reasonId}
        as="textarea"
        label="سبب الرفض"
        rows={3}
        maxLength={MAX_REASON}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={action.sending}
        hint={<p className="text-muted">السبب يُحفظ في ملف المورد.</p>}
      />

      {action.error && <Alert>{action.error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button
          variant="signal"
          onClick={action.submit}
          disabled={trimmed === ''}
          loading={action.sending}
          loadingText="جارٍ الرفض…"
        >
          تأكيد الرفض
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={action.sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}

function SuspendSupplier({ supplier, onDone, onCancel }) {
  const reasonId = useId();
  const [reason, setReason] = useState('');

  const action = useAction(async () => {
    const body = { status: 'suspended' };
    if (reason.trim()) body.reason = reason.trim();
    await apiFetch(`/api/suppliers/${encodeURIComponent(supplier.id)}/verification`, { method: 'PATCH', body });
    onDone(`أُوقف المورد «${supplier.name}» وسُحبت عروضه.`);
  });

  return (
    <div className="flex max-w-measure flex-col gap-5">
      <Alert>
        <p>سيحدث عند التأكيد:</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>إيقاف كل حسابات المورد، فلا يدخل أحد منها.</li>
          <li className="font-semibold">سحب كل عروضه المقدَّمة من كل الطلبات المفتوحة.</li>
        </ul>
      </Alert>

      <Field
        id={reasonId}
        as="textarea"
        label="سبب الإيقاف"
        optional
        rows={3}
        maxLength={MAX_REASON}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={action.sending}
        hint={<p className="text-muted">سبب الإيقاف يُقيَّد في سجل التدقيق، ولا يُحفظ في ملف المورد.</p>}
      />

      {action.error && <Alert>{action.error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button variant="signal" onClick={action.submit} loading={action.sending} loadingText="جارٍ الإيقاف…">
          تأكيد الإيقاف
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={action.sending}>
          تراجع
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── قطع مشتركة في الشاشة ───────────────────────── */

/**
 * نداء واحد معلّق في كل بطاقة تأكيد: انتظار وتعطيل ورسالة الخادم كما وردت.
 * عند النجاح تُغلق البطاقة من onDone، فلا حاجة لإنهاء الانتظار هنا.
 */
function useAction(send) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await send();
    } catch (err) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (err?.status === 401) return;
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return { sending, error, submit };
}

/** بطاقة في الصفحة (لا نافذة منبثقة)، وينتقل التركيز إلى عنوانها ولو فُتحت من صف بعيد. */
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

/** إطار الجدول: الرؤوس وصفوف التحميل الهيكلية، والحاوية تنزلق أفقياً وحدها على الشاشات الضيقة. */
function TableShell({ columns, loading, children }) {
  const cell = 'whitespace-nowrap px-4 py-3';
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
            : children}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ text, filtered, onShowAll }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded border border-line bg-surface p-6 sm:p-8">
      <p className="text-ink">{text}</p>
      {filtered && (
        <Button variant="secondary" onClick={onShowAll}>
          عرض الكل
        </Button>
      )}
    </div>
  );
}

function LoadError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert>{message}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

function Refreshing() {
  return (
    <p role="status" className="mb-3 text-sm text-muted">
      جارٍ التحديث…
    </p>
  );
}
