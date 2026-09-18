import { formatDays, formatMonths, formatRating, formatSAR } from '../lib/labels.js';
import Alert from './Alert.jsx';
import Button from './Button.jsx';
import Detail from './Detail.jsx';
import { Badge } from './StatusBadge.jsx';

// «العرض المختار» من حالة العرض كما يرسلها الخادم، لا من selected_offer_id في الطلب:
// الرفض يعيد العرض إلى submitted ويُبقي selected_offer_id كما هو.
const SELECTED = 'selected';

/**
 * بطاقة عرض واحد في صفحة تفاصيل الطلب. القارئ هنا المشتري، فيظهر اسم المورد.
 * cheapest يأتي من ترتيب الخادم (الأول في القائمة) لا من حساب هنا.
 * onSelect غائب = لا زر اختيار: الزر يُحذف ولا يُعطَّل.
 */
export default function OfferCard({ offer, cheapest = false, onSelect, selecting = false, disabled = false, error = null }) {
  const selected = offer.status === SELECTED;
  const hasRating = offer.supplier_rating !== null && offer.supplier_rating !== undefined;

  return (
    <article className={`rounded border bg-surface p-5 sm:p-6 ${selected ? 'border-seal ring-1 ring-seal' : 'border-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* min-w-0: بدونها يرفض العمود الانكماش تحت أطول كلمة في اسم المورد، فيدفع البطاقة خارج الشاشة. */}
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{offer.supplier_name}</h3>
          {hasRating && (
            <p className="text-sm text-muted">
              التقييم <span className="tabular-nums">{formatRating(offer.supplier_rating)}</span>
            </p>
          )}
        </div>
        {(selected || cheapest) && (
          <div className="flex flex-wrap gap-2">
            {selected && <Badge tone="seal">العرض المختار</Badge>}
            {cheapest && <Badge>الأقل سعراً</Badge>}
          </div>
        )}
      </div>

      <p className="mt-4 text-2xl font-semibold tabular-nums text-ink">{formatSAR(offer.price)}</p>

      <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Detail label="الضمان">
          <span className="tabular-nums">{formatMonths(offer.warranty_months)}</span>
        </Detail>
        <Detail label="مدة التسليم">
          <span className="tabular-nums">{formatDays(offer.lead_days)}</span>
        </Detail>
      </dl>

      {offer.specs && (
        <div className="mt-3 text-sm">
          <p className="text-muted">ملاحظات المورد</p>
          <p className="mt-1 whitespace-pre-line text-ink">{offer.specs}</p>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <Alert items={error.reasons}>{error.message}</Alert>
        </div>
      )}

      {onSelect && (
        <div className="mt-4">
          {/* بعرض البطاقة كاملة على الجوال — هدف إصبع لا زر صغير وسط نص. وفوق ٧٦٨ بكسل بعرض محتواه كما كان. */}
          <Button
            className="w-full md:w-auto"
            onClick={onSelect}
            disabled={disabled}
            loading={selecting}
            loadingText="جارٍ الاختيار…"
          >
            اختر هذا العرض
          </Button>
        </div>
      )}
    </article>
  );
}
