import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api.js';
import { formatDate, formatDays, formatMonths, formatSAR, offerStatusLabel } from '../lib/labels.js';
import { useResource } from '../lib/useResource.js';
import AppHeader from '../components/AppHeader.jsx';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Detail from '../components/Detail.jsx';
import OfferForm, { INCOMPLETE_OFFER_HINT } from '../components/OfferForm.jsx';
import ReasonField, { reasonReady } from '../components/ReasonField.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { RecordCard, RecordCards, RecordField } from '../components/RecordCard.jsx';

/**
 * المورد يقدّم من جواله وهو واقف في مستودع، فكل زر قرار بعرض الشاشة تحت ٧٦٨ بكسل،
 * وفوقها يعود صفاً بعرض محتواه كما هو اليوم حرفياً.
 */
const STACKED_ROW = 'flex flex-col gap-4 md:flex-row md:flex-wrap md:gap-2';
const FULL_ON_MOBILE = 'w-full md:w-auto';

const OPEN_TAB = 'open';
const OFFERS_TAB = 'offers';
const TABS = [
  { key: OPEN_TAB, label: 'الطلبات المفتوحة' },
  { key: OFFERS_TAB, label: 'عروضي' }
];
const OFFER_COLUMNS = ['المرجع', 'الصنف', 'الكمية', 'السعر', 'الضمان', 'مدة التسليم', 'حالة العرض', 'حالة الطلب', 'التاريخ'];
const SKELETON_CARDS = 3;
const SKELETON_ROWS = 4;

// زر السحب للعرض المُقدَّم وحده: المختار يرفض الخادم سحبه، والمسحوب انتهى أمره.
// وأي حالة غير معروفة لا يظهر لها زر — الافتراض هو المنع.
const WITHDRAWABLE_STATUS = 'submitted';

// «تقديم عرض جديد» للمسحوب وحده وعلى طلب ما زال يستقبل العروض — لا لعرض قائم ولا مختار ولا لطلب أُغلق.
const RESUBMITTABLE_STATUS = 'withdrawn';
const OPEN_REQUEST_STATUS = 'sourcing';

const isOpenRequestsResponse = (data) => Array.isArray(data?.requests);
const isMyOffersResponse = (data) => Array.isArray(data?.offers);

// الخادم يعدّ العرض مكتملاً إذا كان الضمان ومدة التسليم كلاهما أكبر من صفر.
const isZeroTerm = (value) => Number(value) === 0;
const isIncomplete = (offer) => isZeroTerm(offer.warranty_months) || isZeroTerm(offer.lead_days);

/**
 * بوابة المورد: الطلبات المفتوحة في فئاته المعتمدة، وعروضه.
 * لا يظهر هنا شيء عن الشركة الطالبة — الخادم لا يرسله أصلاً ولا يُجلب من مسار آخر:
 * المورد يسعّر الحاجة لا اسم المشتري.
 */
export default function SupplierPortalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === OFFERS_TAB ? OFFERS_TAB : OPEN_TAB;

  // القائمتان تُحمَّلان معاً: تقديم عرض أو سحبه من أي لسان يغيّر الاثنتين.
  const openRequests = useResource('/api/offers/open-requests', isOpenRequestsResponse);
  const myOffers = useResource('/api/offers/mine', isMyOffersResponse);

  // رسائل الخادم بعد التقديم أو السحب. تُحفظ هنا لا في البطاقة حتى تبقى بعد إعادة التحميل.
  const [cardNotices, setCardNotices] = useState({});
  const [offersNotice, setOffersNotice] = useState(null);

  function reloadBoth() {
    openRequests.reload();
    myOffers.reload();
  }

  function setCardNotice(requestId, notice) {
    setCardNotices((current) => ({ ...current, [requestId]: notice }));
  }

  function handleOfferSubmitted(requestId, { complete, message }) {
    // complete === false تحذير حقيقي لا نجاح: العرض محفوظ ولا يراه المشتري.
    if (message) setCardNotice(requestId, { tone: complete ? 'seal' : 'signal', text: message });
    reloadBoth();
  }

  function handleCardWithdraw(requestId, { ok, text }) {
    if (text) setCardNotice(requestId, { tone: ok ? 'seal' : 'signal', text });
    if (ok) reloadBoth();
  }

  function handleTableWithdraw(offer, { ok, text }) {
    setOffersNotice(text ? { reference: offer.reference, tone: ok ? 'seal' : 'signal', text } : null);
    if (ok) reloadBoth();
  }

  function changeTab(key) {
    setSearchParams(key === OFFERS_TAB ? { tab: OFFERS_TAB } : {});
  }

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader />
      {/* break-words موروثة، فسطر واحد يكسر كل نص طويل في الشاشة: الصنف، والمواصفات،
          ورسائل الخادم، ورقم المرجع. خلايا الجدول عليها whitespace-nowrap فلا تتأثر. */}
      <main className="mx-auto max-w-5xl break-words px-4 py-8">
        <h1 className="font-display text-2xl font-semibold text-ink">بوابة المورد</h1>

        <Tabs active={activeTab} onChange={changeTab} />

        <section role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="mt-6">
          {activeTab === OPEN_TAB ? (
            <OpenRequestsPanel
              list={openRequests}
              notices={cardNotices}
              onDismissNotice={(requestId) => setCardNotice(requestId, null)}
              onSubmitted={handleOfferSubmitted}
              onWithdrawResult={handleCardWithdraw}
            />
          ) : (
            <MyOffersPanel
              list={myOffers}
              notice={offersNotice}
              onDismissNotice={() => setOffersNotice(null)}
              onWithdrawResult={handleTableWithdraw}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function Tabs({ active, onChange }) {
  return (
    <div role="tablist" aria-label="بوابة المورد" className="mt-6 flex gap-6 border-b border-line">
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={selected ? `panel-${tab.key}` : undefined}
            onClick={() => onChange(tab.key)}
            className={`-mb-px border-b-2 pb-3 pt-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal ${
              selected ? 'border-seal text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- لسان «الطلبات المفتوحة» ----------

function OpenRequestsPanel({ list, notices, onDismissNotice, onSubmitted, onWithdrawResult }) {
  if (list.status === 'loading') return <CardsSkeleton />;
  if (list.status === 'error') return <ListError error={list.error} onRetry={list.reload} />;

  const { requests, note } = list.data;
  // note يشرح سبباً مختلفاً عن الفراغ العادي (لا فئات معتمدة)، فيُعرض هو كما ورد.
  if (requests.length === 0) {
    return <EmptyCard>{typeof note === 'string' && note ? note : 'لا توجد طلبات مفتوحة في فئاتك حالياً'}</EmptyCard>;
  }

  return (
    <div className="flex flex-col gap-4">
      {list.refreshing && <RefreshingNote />}
      {requests.map((request) => (
        // المفتاح يحمل حالة عرضي: وصول القائمة المحدّثة بعد تقديم أو سحب يبني البطاقة من جديد،
        // فلا يبقى فيها «جارٍ التحديث» أو نموذج مفتوح من حالة سابقة.
        <OpenRequestCard
          key={`${request.id}:${request.my_offer_status ?? 'none'}`}
          request={request}
          notice={notices[request.id] ?? null}
          onDismissNotice={() => onDismissNotice(request.id)}
          onSubmitted={(result) => onSubmitted(request.id, result)}
          onWithdrawResult={(result) => onWithdrawResult(request.id, result)}
        />
      ))}
    </div>
  );
}

/** بطاقة طلب: الحاجة وحدها — لا اسم شركة ولا أي حقل يدل عليها. */
function OpenRequestCard({ request, notice, onDismissNotice, onSubmitted, onWithdrawResult }) {
  const [formOpen, setFormOpen] = useState(false);
  // بعد نجاح التقديم وقبل وصول القائمة المحدّثة: لا يعود زر «قدّم عرضاً» للظهور لحظةً.
  const [submitted, setSubmitted] = useState(false);
  const hasOffer = Boolean(request.my_offer_id);
  // حالة الطلب صريحة لا مفترضة من أن القائمة للطلبات المفتوحة: إن غابت فلا زر.
  const canResubmit = request.my_offer_status === RESUBMITTABLE_STATUS && request.status === OPEN_REQUEST_STATUS;
  const itemId = `request-${request.id}-item`;

  function handleSubmitted(result) {
    setFormOpen(false);
    setSubmitted(true);
    onSubmitted(result);
  }

  return (
    <article aria-labelledby={itemId} className="rounded border border-line bg-surface">
      <div className="p-5 sm:p-6">
        <bdi className="font-mono text-sm text-muted">{request.reference}</bdi>
        <h2 id={itemId} className="mt-1 text-lg font-semibold text-ink">
          {request.item}
        </h2>

        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <Detail label="الكمية">
            <span className="tabular-nums">{request.quantity}</span>
          </Detail>
          {request.needed_by && (
            <Detail label="مطلوب بحلول">
              <span className="tabular-nums">{formatDate(request.needed_by)}</span>
            </Detail>
          )}
          <Detail label="تاريخ النشر">
            <span className="tabular-nums">{formatDate(request.created_at)}</span>
          </Detail>
        </dl>

        {request.specs && (
          <div className="mt-4 text-sm">
            <p className="text-muted">المواصفات</p>
            <p className="mt-1 whitespace-pre-line text-ink">{request.specs}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t border-line p-5 sm:p-6">
        {notice && (
          <Notice tone={notice.tone} onClose={onDismissNotice}>
            {notice.text}
          </Notice>
        )}

        {hasOffer && <MyOfferBar request={request} onWithdrawResult={onWithdrawResult} />}

        {/* النموذج نفسه للعرض الأول وللعرض الجديد بعد السحب، ويفتح فارغاً في الحالتين. */}
        {(!hasOffer || canResubmit) &&
          (submitted ? (
            <RefreshingNote />
          ) : formOpen ? (
            <OfferForm requestId={request.id} onSubmitted={handleSubmitted} onCancel={() => setFormOpen(false)} />
          ) : (
            <div>
              <Button className={FULL_ON_MOBILE} onClick={() => setFormOpen(true)}>
                {hasOffer ? 'تقديم عرض جديد' : 'قدّم عرضاً'}
              </Button>
            </div>
          ))}
      </div>
    </article>
  );
}

/**
 * عرض المورد الحالي على الطلب. المسحوب يبقى مرتبطاً بالطلب في الخادم (صف واحد لكل مورد على كل طلب)،
 * والعرض الجديد بعد السحب يُحيي الصف نفسه — فيبقى هذا السطر بسعره القديم حتى يصل الجديد.
 */
function MyOfferBar({ request, onWithdrawResult }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
      <p className="min-w-0 text-ink">
        عرضك: <span className="tabular-nums">{formatSAR(request.my_offer_price)}</span> —{' '}
        {offerStatusLabel(request.my_offer_status)}
      </p>
      {request.my_offer_status === WITHDRAWABLE_STATUS && (
        <WithdrawButton offerId={request.my_offer_id} label="سحب العرض" onResult={onWithdrawResult} />
      )}
    </div>
  );
}

function CardsSkeleton() {
  const bar = 'rounded-sm bg-surface-2 motion-safe:animate-pulse';
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <p role="status" className="sr-only">
        جارٍ التحميل…
      </p>
      {Array.from({ length: SKELETON_CARDS }, (_, index) => (
        <div key={index} className="rounded border border-line bg-surface p-5 sm:p-6">
          <div className={`h-4 w-32 ${bar}`} />
          <div className={`mt-3 h-5 w-2/3 ${bar}`} />
          <div className={`mt-4 h-4 w-1/2 ${bar}`} />
        </div>
      ))}
    </div>
  );
}

// ---------- لسان «عروضي» ----------

function MyOffersPanel({ list, notice, onDismissNotice, onWithdrawResult }) {
  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Notice tone={notice.tone} onClose={onDismissNotice}>
          {notice.reference && <bdi className="me-2 font-mono">{notice.reference}</bdi>}
          {notice.text}
        </Notice>
      )}
      <MyOffersContent list={list} onWithdrawResult={onWithdrawResult} />
    </div>
  );
}

function MyOffersContent({ list, onWithdrawResult }) {
  if (list.status === 'loading') return <OffersList loading />;
  if (list.status === 'error') return <ListError error={list.error} onRetry={list.reload} />;

  const { offers } = list.data;
  if (offers.length === 0) return <EmptyCard>لم تقدّم أي عرض بعد</EmptyCard>;

  return (
    <>
      {list.refreshing && <RefreshingNote />}
      <OffersList offers={offers} onWithdrawResult={onWithdrawResult} />
      {offers.some(isIncomplete) && <p className="text-sm text-signal">{INCOMPLETE_OFFER_HINT}</p>}
    </>
  );
}

/**
 * عروضي بشكلين لعرض واحد من البيانات: بطاقات مكدّسة تحت ٧٦٨ بكسل، والجدول كما هو فوقها.
 * المخفي منهما `display:none` فلا يقرؤه قارئ الشاشة ولا ينزلق داخل صندوقه.
 */
function OffersList(props) {
  return (
    <>
      <div className="md:hidden">
        <OffersCards {...props} />
      </div>
      <div className="hidden md:block">
        <OffersTable {...props} />
      </div>
    </>
  );
}

/** بطاقات العرض الضيق: بطاقة لكل عرض، فيها كل أعمدة الجدول العشرة بلا نقصان. */
function OffersCards({ loading = false, offers = [], onWithdrawResult }) {
  if (loading) {
    return (
      <RecordCards label="جارٍ التحميل…" busy>
        {Array.from({ length: SKELETON_CARDS }, (_, card) => (
          <li key={card} className="rounded border border-line bg-surface p-4">
            <div className="h-5 w-36 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: 5 }, (_, line) => (
                <div key={line} className="h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
              ))}
            </div>
          </li>
        ))}
      </RecordCards>
    );
  }

  return (
    <RecordCards label="عروضي">
      {offers.map((offer) => (
        <RecordCard
          key={offer.id}
          title={
            <bdi className="font-mono">{offer.reference}</bdi>
          }
          badge={<StatusBadge status={offer.request_status} />}
          actions={
            offer.status === WITHDRAWABLE_STATUS ? (
              <WithdrawButton
                offerId={offer.id}
                label="سحب"
                onResult={(result) => onWithdrawResult(offer, result)}
              />
            ) : null
          }
        >
          <RecordField label="الصنف">{offer.item}</RecordField>
          <RecordField label="الكمية">
            <span className="tabular-nums">{offer.quantity}</span>
          </RecordField>
          <RecordField label="السعر">
            <span className="tabular-nums">{formatSAR(offer.price)}</span>
          </RecordField>
          <RecordField label="الضمان">
            <span className="tabular-nums">
              <TermValue value={offer.warranty_months} format={formatMonths} />
            </span>
          </RecordField>
          <RecordField label="مدة التسليم">
            <span className="tabular-nums">
              <TermValue value={offer.lead_days} format={formatDays} />
            </span>
          </RecordField>
          <RecordField label="حالة العرض">{offerStatusLabel(offer.status)}</RecordField>
          <RecordField label="التاريخ">
            <span className="tabular-nums">{formatDate(offer.updated_at ?? offer.created_at)}</span>
          </RecordField>
        </RecordCard>
      ))}
    </RecordCards>
  );
}

/** الجدول داخل حاوية تنزلق أفقياً وحدها على الشاشات الضيقة. */
function OffersTable({ loading = false, offers = [], onWithdrawResult }) {
  const cell = 'whitespace-nowrap px-4 py-3';
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface">
      <table className="w-full text-sm" aria-busy={loading || undefined}>
        {loading && <caption className="sr-only">جارٍ التحميل…</caption>}
        <thead className="bg-surface-2">
          <tr>
            {OFFER_COLUMNS.map((column) => (
              <th key={column} scope="col" className={`${cell} text-start font-medium text-muted`}>
                {column}
              </th>
            ))}
            <th scope="col" className={cell}>
              <span className="sr-only">إجراء</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <tr key={row} className="border-t border-line">
                  {[...OFFER_COLUMNS, 'action'].map((column) => (
                    <td key={column} className={cell}>
                      <div className="h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            : offers.map((offer) => (
                <tr key={offer.id} className="border-t border-line">
                  <td className={`${cell} font-mono`}>
                    <bdi>{offer.reference}</bdi>
                  </td>
                  <td className="px-4 py-3 text-ink">{offer.item}</td>
                  <td className={`${cell} tabular-nums`}>{offer.quantity}</td>
                  <td className={`${cell} tabular-nums`}>{formatSAR(offer.price)}</td>
                  <TermCell value={offer.warranty_months} format={formatMonths} />
                  <TermCell value={offer.lead_days} format={formatDays} />
                  <td className={`${cell} text-ink`}>{offerStatusLabel(offer.status)}</td>
                  <td className={cell}>
                    <StatusBadge status={offer.request_status} />
                  </td>
                  {/* تاريخ آخر تغيير على الصف لا تاريخ إنشائه: يطابق السعر المعروض بعد إعادة التقديم.
                      created_at احتياط إن نُشرت الواجهة قبل أن يعيد الخادم updated_at. */}
                  <td className={`${cell} tabular-nums`}>{formatDate(offer.updated_at ?? offer.created_at)}</td>
                  <td className={`${cell} text-end`}>
                    {offer.status === WITHDRAWABLE_STATUS && (
                      <WithdrawButton
                        offerId={offer.id}
                        label="سحب"
                        onResult={(result) => onWithdrawResult(offer, result)}
                      />
                    )}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * قيمة الضمان أو مدة التسليم. الصفر «—» ومعه «ناقص» لقارئ الشاشة: العرض لا يصل المشتري.
 * يقرأها الجدول والبطاقات معاً فلا يفترقان في معنى الصفر.
 */
function TermValue({ value, format }) {
  if (!isZeroTerm(value)) return <>{format(value)}</>;
  return (
    <span className="text-signal">
      <span aria-hidden="true">—</span>
      <span className="sr-only">ناقص</span>
    </span>
  );
}

/** الخلية نفسها في الجدول: الصفر يصبغ الخلية كلها بخلفية signal الخفيفة. */
function TermCell({ value, format }) {
  const missing = isZeroTerm(value);
  return (
    <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${missing ? 'bg-signal-soft text-signal' : ''}`}>
      <TermValue value={value} format={format} />
    </td>
  );
}

// ---------- مشترك بين اللسانين ----------

/**
 * السحب بخطوتين داخل السطر نفسه، والسبب مطلوب: السحب يسلب الشركة عرضاً قد تكون بنت عليه قرارها،
 * ويبقى في سجلها وإن قُدّم بعده عرض جديد.
 * بعد النجاح يبقى الزر بحالة الانتظار حتى تصل القائمة المحدّثة ويختفي معها.
 */
function WithdrawButton({ offerId, label, onResult }) {
  const reasonId = useId();
  const [step, setStep] = useState('idle'); // idle · confirm · sending
  const [reason, setReason] = useState('');

  async function withdraw() {
    setStep('sending');
    try {
      const data = await apiFetch(`/api/offers/${encodeURIComponent(offerId)}/withdraw`, {
        method: 'POST',
        body: { reason: reason.trim() }
      });
      onResult({ ok: true, text: data?.message ?? null });
    } catch (error) {
      // 401: api.js أنهى الجلسة وحوّل إلى /login.
      if (error?.status === 401) return;
      onResult({ ok: false, text: errorMessage(error) });
      setStep('idle');
    }
  }

  if (step === 'idle') {
    return (
      <Button variant="secondary" className={FULL_ON_MOBILE} onClick={() => setStep('confirm')}>
        {label}
      </Button>
    );
  }

  return (
    // w-64 كان عرضاً ثابتاً يزاحم شاشة ٣٦٠ بكسل: بعرض الحاوية على الجوال، وعند ٧٦٨ يعود ٢٥٦ كما كان.
    <div className="flex w-full flex-col gap-4 text-start md:w-64">
      <ReasonField
        id={reasonId}
        label="سبب سحب العرض"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={step === 'sending'}
        note="تقرأ الشركة المشترية هذا السبب."
      />
      <div className={STACKED_ROW}>
        <Button
          className={FULL_ON_MOBILE}
          onClick={withdraw}
          disabled={!reasonReady(reason)}
          loading={step === 'sending'}
          loadingText="جارٍ السحب…"
        >
          تأكيد السحب
        </Button>
        <Button
          variant="secondary"
          className={FULL_ON_MOBILE}
          onClick={() => setStep('idle')}
          disabled={step === 'sending'}
        >
          تراجع
        </Button>
      </div>
    </div>
  );
}

/** رسالة الخادم بعد عمل، كما وردت، مع زر إغلاق. */
function Notice({ tone, onClose, children }) {
  return (
    <Alert tone={tone}>
      <div className="flex items-start justify-between gap-4">
        <p>{children}</p>
        <button type="button" onClick={onClose} className="shrink-0 font-medium underline">
          إغلاق
        </button>
      </div>
    </Alert>
  );
}

/**
 * policy_blocked ليس عطلاً: السياسة منعت (الحساب قيد التوثيق).
 * يُعرض بطاقة حالة هادئة برسالة الخادم كما هي، لا تنبيه خطأ.
 */
function ListError({ error, onRetry }) {
  if (error.code === 'policy_blocked') {
    return (
      <div role="status" className="rounded border border-line bg-surface p-6 text-ink sm:p-8">
        {error.message}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert>{error.message}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

function EmptyCard({ children }) {
  return (
    <div className="rounded border border-line bg-surface p-6 sm:p-8">
      <p className="text-ink">{children}</p>
    </div>
  );
}

function RefreshingNote() {
  return (
    <p role="status" className="text-sm text-muted">
      جارٍ التحديث…
    </p>
  );
}
