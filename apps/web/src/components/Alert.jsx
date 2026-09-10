const tones = {
  signal: 'border-signal bg-signal-soft text-signal',
  seal: 'border-seal bg-seal-soft text-seal'
};

/**
 * تنبيه بألوان الهوية: signal للخطأ والتنبيه (الافتراضي)، و seal للنجاح.
 * items قائمة نصوص تُسرد تحت الرسالة (أسباب السياسة مثلاً).
 * يعرض النص كما وصل — لا رمز خطأ ولا ترجمة.
 */
export default function Alert({ tone = 'signal', items = [], children }) {
  return (
    <div
      role={tone === 'signal' ? 'alert' : 'status'}
      className={`rounded border px-3 py-2.5 text-sm ${tones[tone] ?? tones.signal}`}
    >
      {children}
      {items.length > 0 && (
        <ul className={`list-disc space-y-1 ps-5 ${children ? 'mt-2' : ''}`}>
          {items.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
