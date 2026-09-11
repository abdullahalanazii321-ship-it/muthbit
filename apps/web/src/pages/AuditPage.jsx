import { useSearchParams } from 'react-router-dom';
import { entityTypeLabels } from '../lib/labels.js';
import AppHeader from '../components/AppHeader.jsx';
import AuditEvents, { shortId } from '../components/AuditEvents.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';

const ENTITY_TYPES = Object.keys(entityTypeLabels);
const LIMITS = [50, 100, 250, 500];
const DEFAULT_LIMIT = 100; // افتراضي الخادم نفسه

/**
 * سجل التدقيق: نافذة قراءة على سجل نهائي. لا مسار كتابة ولا حذف فيه، فلا زر يوحي بغير ذلك.
 * كل تصفية معامل في النداء ومحفوظة في العنوان — لا تصفية ولا ترتيب هنا، والنطاق يفرضه الخادم.
 */
export default function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // قيمة غير معروفة في العنوان تُهمل بدل أن تُرسل للخادم كما هي.
  const requestedType = searchParams.get('entity_type');
  const entityType = ENTITY_TYPES.includes(requestedType) ? requestedType : '';
  const requestedLimit = Number(searchParams.get('limit'));
  const limit = LIMITS.includes(requestedLimit) ? requestedLimit : DEFAULT_LIMIT;
  const entityId = (searchParams.get('entity_id') ?? '').trim();
  const filtered = Boolean(entityType || entityId);

  const query = new URLSearchParams({ limit: String(limit) });
  if (entityType) query.set('entity_type', entityType);
  if (entityId) query.set('entity_id', entityId);
  const path = `/api/audit?${query}`;

  function updateParams(changes) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-ground">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-2xl font-semibold text-ink">سجل التدقيق</h1>
        <p className="mt-1 text-sm text-muted">سجل نهائي لا يُعدَّل ولا يُحذف — القيد مفروض في قاعدة البيانات نفسها.</p>

        <div className="mt-6 grid max-w-lg gap-4 sm:grid-cols-2">
          <Field
            id="entity-type"
            as="select"
            label="نوع الكيان"
            value={entityType}
            onChange={(event) => updateParams({ entity_type: event.target.value })}
          >
            <option value="">الكل</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {entityTypeLabels[type]}
              </option>
            ))}
          </Field>
          <Field
            id="limit"
            as="select"
            label="العدد"
            value={String(limit)}
            onChange={(event) =>
              updateParams({ limit: Number(event.target.value) === DEFAULT_LIMIT ? '' : event.target.value })
            }
          >
            {LIMITS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Field>
        </div>

        {entityId && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
            <p className="text-sm text-ink">
              مُصفّى على كيان واحد
              <bdi className="ms-2 font-mono text-muted" title={entityId}>
                {shortId(entityId)}
              </bdi>
            </p>
            <Button variant="secondary" onClick={() => updateParams({ entity_id: '' })}>
              إزالة التصفية
            </Button>
          </div>
        )}

        <div className="mt-6">
          {/* المفتاح بالنداء: كل تصفية جديدة تبدأ بأسطر التحميل لا بنتائج التصفية السابقة. */}
          <AuditEvents
            key={path}
            path={path}
            filtered={filtered}
            onShowAll={() => updateParams({ entity_type: '', entity_id: '' })}
          />
        </div>
      </main>
    </div>
  );
}
