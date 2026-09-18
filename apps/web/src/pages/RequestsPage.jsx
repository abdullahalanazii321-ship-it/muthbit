import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { formatDate, formatSAR, statusLabels } from '../lib/labels.js';
import AppHeader from '../components/AppHeader.jsx';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import RequestsTable from '../components/RequestsTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { RecordCard, RecordCards, RecordField } from '../components/RecordCard.jsx';

const SKELETON_CARDS = 5;

// الحالات التي يمكن أن توجد فعلاً اليوم. delivered و closed و cancelled بلا مسار يوصل إليها بعد.
const FILTER_STATUSES = ['sourcing', 'pending_approval', 'approved', 'rejected', 'ordered'];

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

        {/* المرشّح بعرض كامل على الجوال — هدف إصبع لا حقل ضيّق. وفوق ٧٦٨ بكسل يعود محصوراً كما كان. */}
        <div className="mt-6 md:max-w-xs">
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
          {list.status === 'loading' && <RequestsList loading />}

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

          {list.status === 'ready' && list.requests.length > 0 && <RequestsList requests={list.requests} />}
        </div>
      </main>
    </div>
  );
}

/**
 * قائمة الطلبات بشكلين لعرض واحد من البيانات:
 * بطاقات مكدّسة تحت ٧٦٨ بكسل، والجدول كما هو فوقها.
 * المخفي منهما `display:none` فلا يقرؤه قارئ الشاشة ولا ينزلق داخل صندوقه.
 *
 * البطاقات هنا لا في RequestsTable عمداً: الجدول تستعمله لوحة المنصة أيضاً
 * بـ linked=false، وهي شاشة خارج هذه المهمة فلا يتغيّر شكلها.
 */
function RequestsList({ loading = false, requests = [] }) {
  return (
    <>
      <div className="md:hidden">
        <RequestCards loading={loading} requests={requests} />
      </div>
      <div className="hidden md:block">
        <RequestsTable loading={loading} requests={requests} />
      </div>
    </>
  );
}

/** بطاقات العرض الضيق: بطاقة لكل طلب، فيها كل ما في صف الجدول بلا نقصان. */
function RequestCards({ loading, requests }) {
  if (loading) {
    return (
      <RecordCards label="جارٍ التحميل…" busy>
        {Array.from({ length: SKELETON_CARDS }, (_, card) => (
          <li key={card} className="rounded border border-line bg-surface p-4">
            <div className="h-5 w-36 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, line) => (
                <div key={line} className="h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
              ))}
            </div>
          </li>
        ))}
      </RecordCards>
    );
  }

  return (
    <RecordCards label="الطلبات">
      {requests.map((request) => (
        <RecordCard
          key={request.id}
          // relative لتغطية الرابط البطاقة كلها، والخلفية تتغيّر بالمرور وبالتركيز معاً.
          className="relative hover:bg-surface-2 focus-within:bg-surface-2"
          title={
            /* الرابط على المرجع يمتد فوق البطاقة كلها (after:inset-0): الضغط في أي موضع منها
               يفتح التفاصيل، ويبقى رابطاً حقيقياً فيعمل «فتح في تبويب جديد». */
            <Link
              to={`/requests/${request.id}`}
              className="font-mono after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-seal"
            >
              <bdi>{request.reference}</bdi>
            </Link>
          }
          badge={<StatusBadge status={request.status} />}
        >
          <RecordField label="الصنف">{request.item}</RecordField>
          <RecordField label="الكمية">
            <span className="tabular-nums">{request.quantity}</span>
          </RecordField>
          <RecordField label="المبلغ">
            <span className="tabular-nums">{formatSAR(request.amount)}</span>
          </RecordField>
          <RecordField label="التاريخ">
            <span className="tabular-nums">{formatDate(request.created_at)}</span>
          </RecordField>
        </RecordCard>
      ))}
    </RecordCards>
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
