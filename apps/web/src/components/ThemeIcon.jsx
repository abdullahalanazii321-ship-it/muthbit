/**
 * رمز زر الوضع: شمس حين يكون التبديل إلى الفاتح، وقمر حين يكون إلى الداكن.
 * زخرفة فقط (aria-hidden) — نص الزر هو ما يُقرأ، فلا يعتمد الزر على الرمز وحده. اللون من نص الزر.
 */
export default function ThemeIcon({ to, size = 16, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {to === 'light' ? (
        <>
          <circle cx="10" cy="10" r="3.5" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
        </>
      ) : (
        <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" />
      )}
    </svg>
  );
}
