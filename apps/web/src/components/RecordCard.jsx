/**
 * بطاقة سجل واحد — بديل صف الجدول على العرض الضيق.
 *
 * الجدول لا يتسع لجواله: أعمدته تُقطع، والتمرير الأفقي ليس حلاً لأن المستخدم
 * لا يعرف أن هناك ما يُسحب ولا يدلّه عليه أثر بصري. فتُقلب كل صفوفه بطاقات
 * مكدّسة: الاسم عنواناً، وبقية الأعمدة أزواج «تسمية: قيمة»، والإجراءات أسفلها
 * أزراراً بعرض كامل — لا معلومة تُحذف ولا إجراء يُخفى.
 *
 * عام عمداً ليُعاد استعماله في بقية جداول المنصة لاحقاً،
 * ولا يُستعمل اليوم إلا في شاشة الفريق.
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
 */
export function RecordCard({ title, badge, actions, children }) {
  return (
    <li className="rounded border border-line bg-surface p-4">
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
