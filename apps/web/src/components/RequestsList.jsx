import { Link } from 'react-router-dom';
import { formatDate, formatSAR } from '../lib/labels.js';
import RequestsTable from './RequestsTable.jsx';
import StatusBadge from './StatusBadge.jsx';
import { RecordCard, RecordCards, RecordCardsSkeleton, RecordField } from './RecordCard.jsx';

/**
 * قائمة الطلبات بشكلين لعرض واحد من البيانات:
 * بطاقات مكدّسة تحت ١٠٢٤ بكسل، والجدول كما هو فوقها — القائمة الجانبية تأخذ ٢٣٢ بكسل فوق ٧٦٨، فالجدول بينهما يضيق ويتمرّر داخل صندوقه بلا دليل.
 * المخفي منهما `display:none` فلا يقرؤه قارئ الشاشة ولا ينزلق داخل صندوقه.
 *
 * كانت في RequestsPage وحدها، ونُقلت هنا حين احتاجتها لوحة المنصة بـ linked=false:
 * نسخها كان سيجعل الشكلين يفترقان مع أول تعديل.
 *
 * linked=false يرسمها بلا روابط — شاشة تفاصيل الطلب مبنية لمستخدم الشركة،
 * ورابطها من لوحة المنصة يَعِد بما لا يعمل كما ينبغي.
 */
export default function RequestsList({ loading = false, requests = [], linked = true }) {
  return (
    <>
      <div className="lg:hidden">
        <RequestCards loading={loading} requests={requests} linked={linked} />
      </div>
      <div className="hidden lg:block">
        <RequestsTable loading={loading} requests={requests} linked={linked} />
      </div>
    </>
  );
}

/** بطاقات العرض الضيق: بطاقة لكل طلب، فيها كل ما في صف الجدول بلا نقصان. */
function RequestCards({ loading, requests, linked }) {
  if (loading) return <RecordCardsSkeleton lines={4} />;

  return (
    <RecordCards label="الطلبات">
      {requests.map((request) => (
        <RecordCard
          key={request.id}
          // relative لتغطية الرابط البطاقة كلها، والخلفية تتغيّر بالمرور وبالتركيز معاً.
          // وبلا رابط لا داعي لأيّ منهما: البطاقة لا تُفتح فلا تُوحي بأنها تُفتح.
          className={linked ? 'relative hover:bg-surface-2 focus-within:bg-surface-2' : ''}
          title={
            linked ? (
              /* الرابط على المرجع يمتد فوق البطاقة كلها (after:inset-0): الضغط في أي موضع منها
                 يفتح التفاصيل، ويبقى رابطاً حقيقياً فيعمل «فتح في تبويب جديد». */
              <Link
                to={`/requests/${request.id}`}
                className="font-mono after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-seal"
              >
                <bdi>{request.reference}</bdi>
              </Link>
            ) : (
              <bdi className="font-mono">{request.reference}</bdi>
            )
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
