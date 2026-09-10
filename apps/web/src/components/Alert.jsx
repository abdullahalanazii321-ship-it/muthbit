/** تنبيه بلون الإشارة. يعرض النص كما وصل — لا رمز خطأ ولا ترجمة. */
export default function Alert({ children }) {
  return (
    <div role="alert" className="rounded border border-signal bg-signal-soft px-3 py-2.5 text-sm text-signal">
      {children}
    </div>
  );
}
