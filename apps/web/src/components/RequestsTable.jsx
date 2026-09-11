import { Link } from 'react-router-dom';
import { formatDate, formatSAR } from '../lib/labels.js';
import StatusBadge from './StatusBadge.jsx';

const COLUMNS = ['المرجع', 'الصنف', 'الكمية', 'المبلغ', 'الحالة', 'التاريخ'];
const SKELETON_ROWS = 5;

/**
 * جدول الطلبات: تستعمله لوحة الشركة وقسم اطلاع المنصة على طلبات شركة.
 * linked=false يرسم الصفوف بلا روابط — شاشة تفاصيل الطلب مبنية لمستخدم الشركة،
 * ورابطها من لوحة المنصة يَعِد بما لا يعمل كما ينبغي.
 * الحاوية تنزلق أفقياً وحدها على الشاشات الضيقة.
 */
export default function RequestsTable({ loading = false, requests = [], linked = true }) {
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
                <tr
                  key={request.id}
                  className={`border-t border-line ${
                    linked ? 'relative hover:bg-surface-2 focus-within:bg-surface-2' : ''
                  }`}
                >
                  <td className={`${cell} font-mono`}>
                    {linked ? (
                      /* الرابط على المرجع يمتد فوق الصف كله (after:inset-0): النقر في أي خلية يفتح التفاصيل،
                         والزر الأوسط و«فتح في تبويب جديد» يعملان لأنه رابط حقيقي لا onClick. */
                      <Link
                        to={`/requests/${request.id}`}
                        className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-seal"
                      >
                        <bdi>{request.reference}</bdi>
                      </Link>
                    ) : (
                      <bdi>{request.reference}</bdi>
                    )}
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
