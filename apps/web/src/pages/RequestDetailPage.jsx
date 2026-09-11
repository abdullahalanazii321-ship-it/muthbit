import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { formatDate, formatDays, formatMonths, formatOfferCount, formatSAR, roleLabel } from '../lib/labels.js';
import { blockedReasons, reasonMessages } from '../lib/policy.js';
import { useResource } from '../lib/useResource.js';
import AppHeader from '../components/AppHeader.jsx';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Detail from '../components/Detail.jsx';
import ReasonField, { reasonReady } from '../components/ReasonField.jsx';
import OfferCard from '../components/OfferCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const LIST_PATH = '/';
const OVER_CEILING_TEXT = 'تجاوز المبلغ سقف الطلب الواحد، فرُفع الطلب لمعتمِد أعلى.';
const APPROVAL_RULE_TEXT = 'القرار للمعتمِد المحدد وحده، ولا يعتمد أحد طلباً أنشأه بنفسه.';
const REJECTED_NOTICE = 'رُفض الطلب. العرض الذي كان مختاراً عاد إلى حالة «مُقدَّم» وبقي قائماً.';

// 404 طلب غير موجود. والخادم يعيد 403 كذلك لطلب غير موجود أو خارج نطاقك — والمعنى للمستخدم واحد:
// لا فائدة من إعادة المحاولة، والمخرج هو الرجوع للقائمة.
const NOT_ACCESSIBLE = [403, 404];

const isDetailResponse = (data) =>
  Boolean(data?.request) && Array.isArray(data?.offers) && Array.isArray(data?.approvals);

/**
 * policy_snapshot عمود jsonb فيصل كائناً، لكنه قد يصل نصاً أو فارغاً.
 * أي شكل غير متوقع يعني: لا أسباب تُسرد — ولا تتعطل الصفحة.
 */
function snapshotReasons(snapshot) {
  let value = snapshot;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return value && typeof value === 'object' ? reasonMessages(value.reasons) : [];
}

export default function RequestDetailPage() {
  const { id } = useParams();
  // المفتاح بالمعرّف: الانتقال من طلب إلى آخر يبدأ بحالة نظيفة لا ببيانات الطلب السابق.
  return <RequestDetail key={id} id={id} />;
}

/**
 * تفاصيل طلب: العروض، واختيار عرض، والاعتماد والرفض، وأمر الشراء.
 * الخادم وحده يقرر: لا تُخفى الأزرار بحسب من أنت، ولا تُحدَّث الحالة محلياً بعد أي إجراء —
 * تُعاد قراءة الصفحة من الخادم.
 */
function RequestDetail({ id }) {
  const requestPath = `/api/requests/${encodeURIComponent(id)}`;
  const detail = useResource(requestPath, isDetailResponse);
  // الإجراء الجاري أو الأخير الذي فشل: { kind: select · approve · reject · po, offerId, sending, error }
  const [action, setAction] = useState(null);
  const [notice, setNotice] = useState(null);

  const busy = Boolean(action?.sending) || detail.refreshing;

  async function run(kind, path, body, { offerId = null, onSuccess } = {}) {
    if (busy) return;
    setAction({ kind, offerId, sending: true, error: null });
    setNotice(null);
    try {
      await apiFetch(path, { method: 'POST', body });
      onSuccess?.();
      setAction(null);
      detail.reload();
    } catch (error) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (error?.status === 401) return;
      const poNumber = error?.details?.po_number;
      setAction({
        kind,
        offerId,
        sending: false,
        error: {
          message: errorMessage(error),
          reasons: blockedReasons(error),
          poNumber: typeof poNumber === 'string' ? poNumber : null
        }
      });
    }
  }

  const handlers = {
    select: (offer) => run('select', `${requestPath}/select-offer`, { offer_id: offer.id }, { offerId: offer.id }),
    approve: () => run('approve', `${requestPath}/decision`, { decision: 'approved' }),
    reject: (reason) =>
      run('reject', `${requestPath}/decision`, { decision: 'rejected', reason }, { onSuccess: () => setNotice(REJECTED_NOTICE) }),
    issuePurchaseOrder: () => run('po', `${requestPath}/purchase-order`)
  };

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {detail.status === 'loading' && <DetailSkeleton />}
        {detail.status === 'error' && <DetailError error={detail.error} onRetry={detail.reload} />}
        {detail.status === 'ready' && (
          <RequestView
            data={detail.data}
            refreshing={detail.refreshing}
            notice={notice}
            action={action}
            busy={busy}
            handlers={handlers}
          />
        )}
      </main>
    </div>
  );
}

function RequestView({ data, refreshing, notice, action, busy, handlers }) {
  const { request, offers, approvals } = data;
  const withheld = Number(data.withheld_offers_count) || 0;
  const purchaseOrder = data.purchase_order ?? null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <bdi className="font-mono text-sm text-muted">{request.reference}</bdi>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-ink">{request.item}</h1>
            <StatusBadge status={request.status} />
          </div>
        </div>
        <Button as={Link} to={LIST_PATH} variant="secondary">
          رجوع للقائمة
        </Button>
      </div>

      {refreshing && (
        <p role="status" className="mt-4 text-sm text-muted">
          جارٍ التحديث…
        </p>
      )}
      {notice && (
        <div className="mt-6">
          <Alert tone="seal">{notice}</Alert>
        </div>
      )}

      <Summary request={request} />
      <OffersSection
        request={request}
        offers={offers}
        withheld={withheld}
        action={action}
        busy={busy}
        onSelect={handlers.select}
      />
      {request.status === 'pending_approval' && (
        <DecisionSection action={action} busy={busy} onApprove={handlers.approve} onReject={handlers.reject} />
      )}
      {approvals.length > 0 && <DecisionLog approvals={approvals} />}
      <PurchaseOrderSection
        request={request}
        purchaseOrder={purchaseOrder}
        action={action}
        busy={busy}
        onIssue={handlers.issuePurchaseOrder}
      />
    </>
  );
}

function Section({ id, title, className = '', children }) {
  return (
    <section aria-labelledby={id} className={`mt-8 ${className}`}>
      <h2 id={id} className="font-display text-lg font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ---------- ٢. ملخّص الطلب ----------

function Summary({ request }) {
  return (
    <section aria-label="ملخّص الطلب" className="mt-6 rounded border border-line bg-surface p-5 sm:p-6">
      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="الكمية">
          <span className="tabular-nums">{request.quantity}</span>
        </Detail>
        <Detail label="مطلوب بحلول">
          <span className="tabular-nums">{formatDate(request.needed_by)}</span>
        </Detail>
        <Detail label="المبلغ">
          <span className="tabular-nums">{formatSAR(request.amount)}</span>
        </Detail>
        <Detail label="تاريخ الإنشاء">
          <span className="tabular-nums">{formatDate(request.created_at)}</span>
        </Detail>
      </dl>

      {request.specs && (
        <div className="mt-4 text-sm">
          <p className="text-muted">المواصفات</p>
          <p className="mt-1 whitespace-pre-line text-ink">{request.specs}</p>
        </div>
      )}

      {/* تجاوز سقف الطلب الواحد تصعيد لا حجب: تنبيه بلون signal لا رسالة رفض.
          الأسباب من policy_snapshot — وهو نفس policy الذي يعيده select-offer، محفوظاً في الطلب. */}
      {request.over_ceiling === true && (
        <div className="mt-4">
          <Alert items={snapshotReasons(request.policy_snapshot)}>{OVER_CEILING_TEXT}</Alert>
        </div>
      )}
    </section>
  );
}

// ---------- ٣. العروض ----------

function OffersSection({ request, offers, withheld, action, busy, onSelect }) {
  // الخادم يقبل الاختيار في حالات أخرى أيضاً، لكن الزر يظهر في مرحلة جمع العروض وحدها.
  const canSelect = request.status === 'sourcing';
  const withheldText = withheld > 0 ? `حُجب ${formatOfferCount(withheld)} لنقص الضمان أو مدة التسليم.` : null;
  const selectError = (offerId) => (action?.kind === 'select' && action.offerId === offerId ? action.error : null);

  return (
    <Section id="offers-heading" title="العروض">
      {offers.length === 0 ? (
        <div className="mt-4 rounded border border-line bg-surface p-6 sm:p-8">
          <p className="text-ink">{withheldText ? `لم تصل عروض بعد. ${withheldText}` : 'لم تصل عروض بعد'}</p>
        </div>
      ) : (
        <>
          {/* الترتيب كما جاء من الخادم (تصاعدياً بالسعر) — لا يُعاد هنا. */}
          <div className="mt-4 flex flex-col gap-4">
            {offers.map((offer, index) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                cheapest={index === 0}
                onSelect={canSelect ? () => onSelect(offer) : undefined}
                selecting={action?.kind === 'select' && action.offerId === offer.id && action.sending}
                disabled={busy}
                error={selectError(offer.id)}
              />
            ))}
          </div>
          {withheldText && <p className="mt-3 text-sm text-muted">{withheldText}</p>}
        </>
      )}
    </Section>
  );
}

// ---------- ٤. الاعتماد ----------

/** الأزرار تظهر لكل من يفتح الصفحة: الخادم يرد 403 برسالة واضحة، وهي أصدق من إخفاء صامت. */
function DecisionSection({ action, busy, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const approving = action?.kind === 'approve' && action.sending;
  const sendingReject = action?.kind === 'reject' && action.sending;
  const error = action?.kind === 'approve' || action?.kind === 'reject' ? action.error : null;
  const ready = reasonReady(reason);

  function submitReject(event) {
    event.preventDefault();
    if (!ready || busy) return;
    onReject(reason.trim());
  }

  return (
    <Section id="decision-heading" title="الاعتماد" className="rounded border border-line bg-surface p-5 sm:p-6">
      {rejecting ? (
        // noValidate: فقاعة تحقق المتصفح تظهر بلغته. الزر معطّل حتى يُكتب السبب.
        <form noValidate onSubmit={submitReject} className="mt-4 flex flex-col gap-4">
          <ReasonField
            id="reject-reason"
            label="سبب الرفض"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={sendingReject}
            note="ويظهر لصاحب الطلب في تفاصيل الطلب."
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant="signal"
              disabled={!ready || busy}
              loading={sendingReject}
              loadingText="جارٍ الرفض…"
            >
              تأكيد الرفض
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(false)} disabled={sendingReject}>
              تراجع
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={onApprove} disabled={busy} loading={approving} loadingText="جارٍ الاعتماد…">
            اعتماد
          </Button>
          <Button variant="signal" onClick={() => setRejecting(true)} disabled={busy}>
            رفض
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <Alert items={error.reasons}>{error.message}</Alert>
        </div>
      )}

      <p className="mt-4 text-sm text-muted">{APPROVAL_RULE_TEXT}</p>
    </Section>
  );
}

// ---------- ٥. سجل القرارات ----------

function DecisionLog({ approvals }) {
  return (
    <Section id="decisions-heading" title="سجل القرارات">
      {/* بترتيب الخادم الزمني (الأقدم أولاً). */}
      <ol className="mt-4 flex flex-col gap-3">
        {approvals.map((approval) => (
          <li key={approval.id} className="rounded border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink">
                <span className="font-medium">{approval.approver_name}</span>
                <span className="ms-2 text-sm text-muted">{roleLabel(approval.approver_role)}</span>
              </p>
              <StatusBadge status={approval.decision} />
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <Detail label="المبلغ وقت القرار">
                <span className="tabular-nums">{formatSAR(approval.amount_at_decision)}</span>
              </Detail>
              <Detail label="التاريخ">
                <span className="tabular-nums">{formatDate(approval.decided_at)}</span>
              </Detail>
            </dl>
            {approval.reason && (
              <div className="mt-3 text-sm">
                <p className="text-muted">السبب</p>
                <p className="mt-1 whitespace-pre-line text-ink">{approval.reason}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ---------- ٦. أمر الشراء ----------

function PurchaseOrderSection({ request, purchaseOrder, action, busy, onIssue }) {
  if (purchaseOrder) {
    return (
      <Section id="po-heading" title="أمر الشراء" className="rounded border border-line bg-surface p-5 sm:p-6">
        <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <Detail label="رقم الأمر">
            <bdi className="font-mono">{purchaseOrder.po_number}</bdi>
          </Detail>
          <Detail label="المبلغ">
            <span className="tabular-nums">{formatSAR(purchaseOrder.amount)}</span>
          </Detail>
          <Detail label="الضمان">
            <span className="tabular-nums">{formatMonths(purchaseOrder.warranty_months)}</span>
          </Detail>
          <Detail label="مدة التسليم">
            <span className="tabular-nums">{formatDays(purchaseOrder.lead_days)}</span>
          </Detail>
          <Detail label="تاريخ الإصدار">
            <span className="tabular-nums">{formatDate(purchaseOrder.issued_at)}</span>
          </Detail>
        </dl>
      </Section>
    );
  }

  if (request.status !== 'approved') return null;

  const issuing = action?.kind === 'po' && action.sending;
  const error = action?.kind === 'po' ? action.error : null;

  return (
    <Section id="po-heading" title="أمر الشراء" className="rounded border border-line bg-surface p-5 sm:p-6">
      {error && (
        <div className="mt-4">
          <Alert items={error.reasons}>
            {error.message}
            {error.poNumber && (
              <>
                {' '}
                <bdi className="font-mono">{error.poNumber}</bdi>
              </>
            )}
          </Alert>
        </div>
      )}
      <div className="mt-4">
        <Button onClick={onIssue} disabled={busy} loading={issuing} loadingText="جارٍ الإصدار…">
          إصدار أمر الشراء
        </Button>
      </div>
    </Section>
  );
}

// ---------- التحميل والخطأ ----------

function DetailSkeleton() {
  const bar = 'rounded-sm bg-surface-2 motion-safe:animate-pulse';
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        جارٍ التحميل…
      </p>
      <div className={`h-4 w-32 ${bar}`} />
      <div className={`mt-2 h-8 w-2/3 ${bar}`} />
      <div className="mt-6 rounded border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={`h-10 ${bar}`} />
          ))}
        </div>
      </div>
      <div className={`mt-8 h-5 w-24 ${bar}`} />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="mt-4 rounded border border-line bg-surface p-5 sm:p-6">
          <div className={`h-5 w-40 ${bar}`} />
          <div className={`mt-4 h-7 w-32 ${bar}`} />
          <div className={`mt-3 h-4 w-1/2 ${bar}`} />
        </div>
      ))}
    </div>
  );
}

function DetailError({ error, onRetry }) {
  const notAccessible = NOT_ACCESSIBLE.includes(error.httpStatus);
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert>{error.message}</Alert>
      <div className="flex flex-wrap gap-3">
        {!notAccessible && (
          <Button variant="secondary" onClick={onRetry}>
            إعادة المحاولة
          </Button>
        )}
        <Button as={Link} to={LIST_PATH} variant="secondary">
          رجوع للقائمة
        </Button>
      </div>
    </div>
  );
}
