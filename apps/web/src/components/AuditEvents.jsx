import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auditActionLabel, auditActionLabels, entityTypeLabel, formatDateTime, roleLabel } from '../lib/labels.js';
import { COMPANY_HOME } from '../lib/access.js';
import { useResource } from '../lib/useResource.js';
import Alert from './Alert.jsx';
import Button from './Button.jsx';

const SHORT_ID_LENGTH = 8;
const SKELETON_ROWS = 8;

// التمييز بالمعنى: ما يمنع أو يرفض أو يسحب أو يوقف بلون signal، وما يعتمد أو يوثّق أو يُصدر بلون seal.
const SIGNAL_ACTIONS = new Set([
  'request.policy_blocked',
  'request.rejected',
  'offer.withdrawn',
  'user.suspended',
  'company.suspended',
  'supplier.suspended',
  'supplier.rejected',
  // اطلاع المنصة ليس خطأً، لكنه يجب أن يلفت نظر الشركة لا أن يمر بين السطور.
  'platform.viewed_requests',
  'platform.viewed_request',
  'platform.viewed_audit',
  'platform.viewed_users'
]);
const SEAL_ACTIONS = new Set([
  'request.approved',
  'purchase_order.issued',
  'supplier.verified',
  'company.active',
  'user.activated'
]);

function actionTone(action) {
  if (SIGNAL_ACTIONS.has(action)) return 'text-signal';
  if (SEAL_ACTIONS.has(action)) return 'text-seal';
  return 'text-ink';
}

export const isAuditResponse = (data) => Array.isArray(data?.events);
export const shortId = (id) => String(id).slice(0, SHORT_ID_LENGTH);

function hasPayload(payload) {
  if (payload === null || payload === undefined || payload === '') return false;
  return typeof payload === 'object' ? Object.keys(payload).length > 0 : true;
}

// بيانات خام للتدقيق: تُعرض كما كُتبت بمسافات بادئة فقط — لا إعادة صياغة ولا ترجمة للحقول.
function formatPayload(payload) {
  return typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
}

/**
 * أحداث السجل بحالاتها الأربع: تحميل · فراغ · خطأ · قائمة.
 * تستعملها شاشة سجل التدقيق ولوحة المنصة بالعرض نفسه — السجل واحد فلا يُعرض بصورتين.
 * path يحمل كل التصفيات؛ الترتيب والنطاق من الخادم وحده.
 */
export default function AuditEvents({ path, filtered = false, onShowAll, backTo = COMPANY_HOME, emptyText }) {
  const events = useResource(path, isAuditResponse);

  if (events.status === 'loading') return <EventsSkeleton />;
  if (events.status === 'error') return <EventsError error={events.error} onRetry={events.reload} backTo={backTo} />;

  const list = events.data.events;
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded border border-line bg-surface p-6 sm:p-8">
        <p className="text-ink">{filtered ? 'لا توجد أحداث بهذه التصفية' : emptyText ?? 'لا توجد أحداث بعد'}</p>
        {filtered && onShowAll && (
          <Button variant="secondary" onClick={onShowAll}>
            عرض الكل
          </Button>
        )}
      </div>
    );
  }

  // الترتيب كما جاء من الخادم: تنازلياً بالمعرّف، الأحدث أولاً.
  return (
    <ol className="divide-y divide-line rounded border border-line bg-surface">
      {list.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </ol>
  );
}

function EventRow({ event }) {
  const [open, setOpen] = useState(false);
  const known = Object.hasOwn(auditActionLabels, event.action);
  const showDetails = hasPayload(event.payload);
  const detailsId = `audit-${event.id}-payload`;

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-1 text-sm md:flex-row md:items-baseline md:gap-6">
        <time dateTime={event.created_at} className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted md:w-36">
          {formatDateTime(event.created_at)}
        </time>

        <p className="md:w-1/4 md:shrink-0">
          <span className="text-ink">{event.actor_name ?? '—'}</span>
          {event.actor_role && <span className="ms-2 text-muted">{roleLabel(event.actor_role)}</span>}
        </p>

        <p className={`font-medium md:flex-1 ${actionTone(event.action)}`}>
          {known ? auditActionLabel(event.action) : <bdi className="font-mono">{event.action}</bdi>}
        </p>

        <p className="text-muted md:w-1/5 md:shrink-0">
          {entityTypeLabel(event.entity_type)}
          {event.entity_id && (
            <bdi className="ms-2 font-mono" title={event.entity_id}>
              {shortId(event.entity_id)}
            </bdi>
          )}
        </p>

        <div className="md:w-16 md:shrink-0 md:text-end">
          {showDetails && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen((current) => !current)}
              className={`rounded-sm border border-line-strong px-2 py-0.5 text-xs font-medium text-ink hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal ${
                open ? 'bg-surface-2' : ''
              }`}
            >
              تفاصيل
            </button>
          )}
        </div>
      </div>

      {showDetails && open && (
        <div id={detailsId} className="mt-3 overflow-x-auto rounded bg-surface-2">
          <pre dir="ltr" className="p-3 font-mono text-xs text-ink">
            {formatPayload(event.payload)}
          </pre>
        </div>
      )}
    </li>
  );
}

function EventsSkeleton() {
  const bar = 'h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse';
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        جارٍ التحميل…
      </p>
      <ul className="divide-y divide-line rounded border border-line bg-surface">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} className="flex flex-col gap-2 px-4 py-3 sm:px-5 md:flex-row md:gap-6">
            <div className={`w-36 ${bar}`} />
            <div className={`md:w-1/4 ${bar}`} />
            <div className={`md:flex-1 ${bar}`} />
            <div className={`md:w-1/5 ${bar}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 403: الدور لا يملك الاطلاع — رسالة الخادم وزر رجوع، فإعادة المحاولة لن تغيّر شيئاً. */
function EventsError({ error, onRetry, backTo }) {
  const forbidden = error.httpStatus === 403;
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert>{error.message}</Alert>
      {forbidden ? (
        <Button as={Link} to={backTo} variant="secondary">
          رجوع
        </Button>
      ) : (
        <Button variant="secondary" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
