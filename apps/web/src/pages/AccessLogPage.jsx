import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../lib/useResource.js';
import {
  accessActionLabel,
  companyStatusLabel,
  formatDateTime,
  roleLabel,
  supplierStatusLabel
} from '../lib/labels.js';
import AppShell from '../components/AppShell.jsx';
import Alert from '../components/Alert.jsx';
import Button from '../components/Button.jsx';
import Field from '../components/Field.jsx';
import { RecordCard, RecordCards, RecordCardsSkeleton, RecordField } from '../components/RecordCard.jsx';

// حدّ الخادم (ACCESS_LOG_MAX في platform.routes.js) — يُطلب كاملاً، ويُقال للمستخدم كم عُرض.
const ACCESS_LOG_MAX = 500;
const isEntriesResponse = (data) => Array.isArray(data?.entries);
const COLUMNS = ['الوقت', 'من اطّلع', 'العملية', 'على'];

/** على من وقعت العملية: الشركة أو المورد أو حساب المسؤول المعني. */
function targetOf(entry) {
  if (entry.company_name) return { label: 'شركة', name: entry.company_name };
  if (entry.supplier_name) return { label: 'مورد', name: entry.supplier_name };
  if (entry.target_name) return { label: 'مسؤول', name: entry.target_name };
  return null;
}

/** تفصيل قصير من payload — مرجع الطلب، أو الحالة قبل التوثيق وبعده، أو السبب، أو عدد المعروض. لا سر فيه أصلاً. */
function detailOf(entry) {
  const p = entry.payload || {};
  if (entry.action === 'verified.company' && p.to) return `${companyStatusLabel(p.from)} ← ${companyStatusLabel(p.to)}`;
  if (entry.action === 'verified.supplier' && p.to) return `${supplierStatusLabel(p.from)} ← ${supplierStatusLabel(p.to)}`;
  if (p.reference) return p.reference;
  if (p.reason) return `السبب: ${p.reason}`;
  if (typeof p.count === 'number') return `المعروض: ${p.count}`;
  return null;
}

/**
 * سجل الوصول الداخلي — لمالك المنصة ولمن منحه القراءة (canViewAccessLog). من اطّلع، وعلى أي شركة أو مورد، ومتى، وأي عملية.
 * فتح الصفحة وتغيير المرشّحين يُقيَّدان في السجل نفسه (الخادم يكتب قيد القراءة بعد كل قراءة) — ويُقال ذلك في الصفحة.
 * المرشّحان في العنوان (?company_id= · ?actor_user_id=) كبقية القوائم.
 */
export default function AccessLogPage() {
  const [params, setParams] = useSearchParams();
  const companyId = params.get('company_id') || '';
  const actorId = params.get('actor_user_id') || '';

  const query = new URLSearchParams({ limit: String(ACCESS_LOG_MAX) });
  if (companyId) query.set('company_id', companyId);
  if (actorId) query.set('actor_user_id', actorId);
  const log = useResource(`/api/platform/access-log?${query}`, isEntriesResponse);
  // خيارا المرشّحين مما ظهر في السجل نفسه: الشركات لا من قائمة الشركات (نداؤها يُقيَّد اطلاعاً مع كل فتح)،
  // والأشخاص لا من مسار المسؤولين (للمالك وحده، ومن مُنح القراءة يفتح هذه الصفحة أيضاً).
  // يتراكمان مع كل تحميل، فلا يختفي الخيار المحدَّد حين يضيّق المرشّح القيود.
  const [companies, setCompanies] = useState(() => new Map());
  const [people, setPeople] = useState(() => new Map());
  useEffect(() => {
    if (log.status !== 'ready') return;
    const grow = (current, pairs) => {
      const next = new Map(current);
      for (const [id, name] of pairs) if (id && name) next.set(id, name);
      return next.size === current.size ? current : next;
    };
    setCompanies((current) => grow(current, log.data.entries.map((e) => [e.company_id, e.company_name])));
    setPeople((current) => grow(current, log.data.entries.map((e) => [e.actor_user_id, e.actor_name])));
  }, [log.status, log.data]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  const entries = log.status === 'ready' ? log.data.entries : [];
  const filtered = Boolean(companyId || actorId);
  const companyOptions = [...companies.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  const peopleOptions = [...people.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));

  return (
    <AppShell title="سجل الوصول">
      {/* break-words موروثة: اسم شركة أو سبب طويل بلا مسافة ينكسر ولا يمدّ الصفحة. */}
      <main className="break-words px-4 py-8">
        <p className="text-sm text-muted">سجل داخلي: لا تراه الشركات، ولا يمكن تعديله ولا حذفه.</p>
        <p className="mt-1 text-xs text-muted">فتحك هذه الصفحة وتغيير المرشّحين يُقيَّدان في السجل نفسه، فسترى قيودك أنت بين القيود.</p>

        {/* المرشّحان بعرض محتواهما فوق ٧٦٨، وبعرض كامل تحتها — هدف إصبع لا حقل ضيّق. */}
        <div className="mt-6 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
          <div className="md:w-auto">
            <Field id="access-company" as="select" label="الشركة" value={companyId} onChange={(event) => setFilter('company_id', event.target.value)}>
              <option value="">كل الشركات</option>
              {companyOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Field>
          </div>
          <div className="md:w-auto">
            <Field id="access-actor" as="select" label="الشخص" value={actorId} onChange={(event) => setFilter('actor_user_id', event.target.value)}>
              <option value="">كل الأشخاص</option>
              {peopleOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Field>
          </div>
          {filtered && (
            <Button variant="secondary" onClick={() => setParams({})}>
              عرض الكل
            </Button>
          )}
        </div>

        <div className="mt-6">
          {log.status === 'loading' && <AccessEntries loading />}

          {log.status === 'error' && (
            <div className="flex flex-col items-start gap-4">
              <Alert>{log.error.message}</Alert>
              <Button variant="secondary" onClick={log.reload}>
                إعادة المحاولة
              </Button>
            </div>
          )}

          {/* لا صندوق فارغ: سطر واحد. */}
          {log.status === 'ready' && entries.length === 0 && (
            <p className="text-sm text-muted">{filtered ? 'لا توجد قيود بهذا المرشّح.' : 'السجل فارغ — لا قيود بعد.'}</p>
          )}

          {log.status === 'ready' && entries.length > 0 && (
            <>
              <p role="status" className="mb-3 text-sm text-ink">
                القيود المعروضة: <bdi className="tabular-nums font-semibold">{entries.length}</bdi>
                <span className="text-muted"> — يعرض الخادم أحدث {ACCESS_LOG_MAX} قيد على الأكثر.</span>
              </p>
              <AccessEntries entries={entries} />
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

/** بطاقات تحت ١٠٢٤ بكسل والجدول فوقها — كبقية القوائم. المخفي منهما display:none. */
function AccessEntries(props) {
  return (
    <>
      <div className="lg:hidden">
        <EntriesCards {...props} />
      </div>
      <div className="hidden lg:block">
        <EntriesTable {...props} />
      </div>
    </>
  );
}

function Target({ entry }) {
  const target = targetOf(entry);
  if (!target) return <span className="text-muted">—</span>;
  return (
    <span>
      <span className="text-muted">{target.label}: </span>
      {target.name}
    </span>
  );
}

function Operation({ entry }) {
  const detail = detailOf(entry);
  return (
    <div>
      <p className="text-ink">{accessActionLabel(entry.action)}</p>
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  );
}

function EntriesCards({ loading = false, entries = [] }) {
  if (loading) return <RecordCardsSkeleton lines={COLUMNS.length} />;
  return (
    <RecordCards label="قيود سجل الوصول">
      {entries.map((entry) => (
        <RecordCard key={entry.id} title={accessActionLabel(entry.action)}>
          <RecordField label="الوقت">
            <bdi className="tabular-nums">{formatDateTime(entry.created_at)}</bdi>
          </RecordField>
          <RecordField label="من اطّلع">
            {entry.actor_name || '—'} <span className="text-muted">({roleLabel(entry.actor_role)})</span>
          </RecordField>
          <RecordField label="على">
            <Target entry={entry} />
          </RecordField>
          {detailOf(entry) && <RecordField label="التفصيل">{detailOf(entry)}</RecordField>}
        </RecordCard>
      ))}
    </RecordCards>
  );
}

function EntriesTable({ loading = false, entries = [] }) {
  const cell = 'px-4 py-3 align-top';
  return (
    <div className="rounded border border-line bg-surface">
      <table className="w-full text-sm" aria-busy={loading || undefined}>
        {loading && <caption className="sr-only">جارٍ التحميل…</caption>}
        <thead className="bg-surface-2">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className={`${cell} whitespace-nowrap text-start font-medium text-muted`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 4 }, (_, row) => (
                <tr key={row} className="border-t border-line">
                  {COLUMNS.map((column) => (
                    <td key={column} className={cell}>
                      <div className="h-4 rounded-sm bg-surface-2 motion-safe:animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            : entries.map((entry) => (
                <tr key={entry.id} className="border-t border-line">
                  <td className={`${cell} whitespace-nowrap tabular-nums`}>
                    <bdi>{formatDateTime(entry.created_at)}</bdi>
                  </td>
                  <td className={cell}>
                    <p className="text-ink">{entry.actor_name || '—'}</p>
                    <p className="text-xs text-muted">{roleLabel(entry.actor_role)}</p>
                  </td>
                  <td className={cell}>
                    <Operation entry={entry} />
                  </td>
                  <td className={cell}>
                    <Target entry={entry} />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
