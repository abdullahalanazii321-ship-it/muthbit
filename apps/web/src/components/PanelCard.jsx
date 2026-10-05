import { useEffect, useId, useRef } from 'react';

/** بطاقة في الصفحة (لا نافذة منبثقة). تنفتح أعلى الجدول، فيُنقل التركيز إلى عنوانها ولو فُتحت من صف بعيد. */
export default function PanelCard({ title, children }) {
  const headingId = useId();
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section aria-labelledby={headingId} className="mt-6 rounded border border-line bg-surface p-5 sm:p-6">
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-lg font-semibold text-ink focus:outline-none"
      >
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
