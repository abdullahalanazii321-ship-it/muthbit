/**
 * بطاقة سجل واحد — بديل صف الجدول على العرض الضيق.
 *
 * الجدول لا يتسع لجواله: أعمدته تُقطع، والتمرير الأفقي ليس حلاً لأن المستخدم
 * لا يعرف أن هناك ما يُسحب ولا يدلّه عليه أثر بصري. فتُقلب كل صفوفه بطاقات
 * مكدّسة: الاسم عنواناً، وبقية الأعمدة أزواج «تسمية: قيمة»، والإجراءات أسفلها
 * أزراراً بعرض كامل — لا معلومة تُحذف ولا إجراء يُخفى.
 *
 * عام عمداً: تستعمله شاشة الفريق وجداول لوحة المنصة الثلاثة وقائمة الطلبات.
 */

/** حاوية البطاقات. label اسم القائمة لقارئ الشاشة — يقوم مقام عنوان الجدول. */
export function RecordCards({ label, busy = false, children }) {
  return (
    <ul aria-label={label} aria-busy={busy || undefined} className="flex flex-col gap-3">
      {children}
    </ul>
  );
}

/**
 * بطاقة واحدة. title العنوان الأبرز، badge وسم يقع بجانبه (الحالة مثلاً)،
 * children أزواج RecordField، actions أزرار أسفل البطاقة.
 *
 * className يُضاف إلى البطاقة نفسها — لبطاقة يفتحها الضغط عليها كلها:
 * `relative` هنا، ورابط العنوان يمدّ `after:inset-0` فوقها.
 */
export function RecordCard({ title, badge, actions, className = '', children }) {
  return (
    <li className={`rounded border border-line bg-surface p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-display text-base font-semibold text-ink">{title}</h3>
        {badge}
      </div>
      <dl className="mt-3 flex flex-col gap-2 text-sm">{children}</dl>
      {/* الإجراءات مكدّسة بعرض كامل: هدف إصبع لا أيقونة صغيرة. */}
      {actions && <div className="mt-4 flex flex-col gap-2">{actions}</div>}
    </li>
  );
}

/**
 * زوج «تسمية: قيمة».
 * يلتفّ إلى سطرين إن ضاق العرض بدل أن يدفع البطاقة خارج الشاشة،
 * و break-words يكسر البريد الطويل الذي لا مسافة فيه.
 */
export function RecordField({ label, children }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

/**
 * هيكل الانتظار بشكل البطاقات: عنوان وأسطر بعدد حقول البطاقة.
 * هنا لا في كل شاشة: أربع قوائم تنتظر بالشكل نفسه، ونسخه أربع مرات يجعلها تفترق مع الوقت.
 */
export function RecordCardsSkeleton({ count = 5, lines = 4 }) {
  const bar = 'rounded-sm bg-surface-2 motion-safe:animate-pulse';
  return (
    <RecordCards label="جارٍ التحميل…" busy>
      {Array.from({ length: count }, (_, card) => (
        <li key={card} className="rounded border border-line bg-surface p-4">
          <div className={`h-5 w-36 ${bar}`} />
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: lines }, (_, line) => (
              <div key={line} className={`h-4 ${bar}`} />
            ))}
          </div>
        </li>
      ))}
    </RecordCards>
  );
}
