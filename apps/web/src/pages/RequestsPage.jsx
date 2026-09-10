import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { formatDate, formatSAR, statusLabels } from '../lib/labels.js';
import AppHeader from '../components/AppHeader.jsx';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

// الحالات التي يمكن أن توجد فعلاً اليوم. delivered و closed و cancelled بلا مسار يوصل إليها بعد.
const FILTER_STATUSES = ['sourcing', 'pending_approval', 'approved', 'rejected', 'ordered'];
const COLUMNS = ['المرجع', 'الصنف', 'الكمية', 'المبلغ', 'الحالة', 'التاريخ'];
const SKELETON_ROWS = 5;

/** لوحة الشركة: قائمة الطلبات. النطاق (من يرى ماذا) يقرره الخادم وحده — لا تصفية هنا. */
export default function RequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('status');
  const statusFilter = FILTER_STATUSES.includes(requested) ? requested : '';

  const [list, setList] = useState({ status: 'loading', requests: [], message: null });
  const [reloadKey, setReloadKey] = useState(0);
  const notice = useCreatedNotice();

  useEffect(() => {
    let ignore = false;
    setList({ status: 'loading', requests: [], message: null });
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    apiFetch(`/api/requests${query}`)
      .then((data) => {
        if (!Array.isArray(data?.requests)) throw new Error('unexpected response shape');
        if (!ignore) setList({ status: 'ready', requests: data.requests, message: null });
      })
      .catch((error) => {
        // 401: api.js أنهى الجلسة وحوّل إلى /login.
        if (ignore || error?.status === 401) return;
        setList({ status: 'error', requests: [], message: errorMessage(error) });
      });
    return () => {
      ignore = true;
    };
  }, [statusFilter, reloadKey]);

  function changeFilter(value) {
    setSearchParams(value ? { status: value } : {});
  }

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {notice.value && <CreatedNotice notice={notice.value} onClose={notice.dismiss} />}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold text-ink">طلبات الشراء</h1>
          <Button as={Link} to="/requests/new">
            طلب جديد
          </Button>
        </div>

        <div className="mt-6 max-w-xs">
          <Field
            id="status-filter"
            as="select"
            label="الحالة"
            value={statusFilter}
            onChange={(event) => changeFilter(event.target.value)}
          >
            <option value="">الكل</option>
            {FILTER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </Field>
        </div>

        <div className="mt-6">
          {list.status === 'loading' && <RequestsTable loading />}

          {list.status === 'error' && (
            <div className="flex flex-col items-start gap-4">
              <Alert>{list.message}</Alert>
              <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
                إعادة المحاولة
              </Button>
            </div>
          )}

          {list.status === 'ready' && list.requests.length === 0 && (
            <EmptyState filtered={Boolean(statusFilter)} onShowAll={() => changeFilter('')} />
          )}

          {list.status === 'ready' && list.requests.length > 0 && <RequestsTable requests={list.requests} />}
        </div>
      </main>
    </div>
  );
}

/**
 * إشعار الطلب الجديد يصل من شاشة الإنشاء في حالة التنقل (location.state).
 * نحفظه في حالة الشاشة ثم نمسحه من سجل المتصفح حتى لا يعود عند تحديث الصفحة.
 */
function useCreatedNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [value, setValue] = useState(() => location.state?.created ?? null);

  useEffect(() => {
    if (location.state?.created) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    }
  }, [location, navigate]);

  return { value, dismiss: () => setValue(null) };
}

function CreatedNotice({ notice, onClose }) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <Alert tone="seal">
        <div className="flex items-start justify-between gap-4">
          <p>
            {notice.reference ? (
              <>
                تم إنشاء الطلب <bdi className="font-mono">{notice.reference}</bdi>
              </>
            ) : (
              'تم إنشاء الطلب.'
            )}
          </p>
          <button type="button" onClick={onClose} className="shrink-0 font-medium underline">
            إغلاق
          </button>
        </div>
      </Alert>
      {notice.warnings.length > 0 && <Alert items={notice.warnings} />}
    </div>
  );
}

function EmptyState({ filtered, onShowAll }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded border border-line bg-surface p-6 sm:p-8">
      <p className="text-ink">{filtered ? 'لا توجد طلبات بهذه الحالة' : 'لا توجد طلبات بعد'}</p>
      {filtered ? (
        <Button variant="secondary" onClick={onShowAll}>
          عرض الكل
        </Button>
      ) : (
        <Button as={Link} to="/requests/new">
          إنشاء أول طلب
        </Button>
      )}
    </div>
  );
}

/** الجدول داخل حاوية تنزلق أفقياً وحدها على الشاشات الضيقة. كل صف رابط حقيقي إلى تفاصيل الطلب. */
function RequestsTable({ loading = false, requests = [] }) {
  const cell = 'whitespace-nowrap px-4 py-3';
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full text-sm" aria-busy={loading || undefined}>
        {loading && <caption className="sr-only">جارٍ التحميل…</caption>}
        <thead className="bg-surface-2">
          <tr>
            {COLUMNS.map((column) => (
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
                  {COLUMNS.map((column) => (
                    <td key={column} className={cell}>
                      <div className="h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            : requests.map((request) => (
                <tr key={request.id} className="relative border-t border-line hover:bg-surface-2 focus-within:bg-surface-2">
                  <td className={`${cell} font-mono`}>
                    {/* الرابط على المرجع يمتد فوق الصف كله (after:inset-0): النقر في أي خلية يفتح التفاصيل،
                        والزر الأوسط و«فتح في تبويب جديد» يعملان لأنه رابط حقيقي لا onClick. */}
                    <Link
                      to={`/requests/${request.id}`}
                      className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-seal"
                    >
                      <bdi>{request.reference}</bdi>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">{request.item}</td>
                  <td className={`${cell} tabular-nums`}>{request.quantity}</td>
                  <td className={`${cell} tabular-nums`}>{formatSAR(request.amount)}</td>
                  <td className={cell}>
                    <StatusBadge status={request.status} />
                  </td>
                  <td className={`${cell} tabular-nums`}>{formatDate(request.created_at)}</td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
