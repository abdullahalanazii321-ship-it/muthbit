// [&:not(:disabled)]:hover بدل enabled:hover لأن الزر قد يكون رابطاً، والرابط لا يطابق :enabled.
const variants = {
  primary: 'border-seal bg-seal text-surface [&:not(:disabled)]:hover:opacity-90',
  secondary: 'border-line-strong bg-surface text-ink [&:not(:disabled)]:hover:bg-surface-2',
  // للإجراء الذي يرفض — لون الإشارة لا لون الختم.
  signal: 'border-signal bg-signal text-surface [&:not(:disabled)]:hover:opacity-90'
};

/**
 * أثناء الانتظار يُعطَّل الزر ويتغيّر نصه إلى loadingText.
 * as={Link} يرسمه رابطاً بالشكل نفسه — للتنقل بين الشاشات.
 */
export default function Button({
  as: Component = 'button',
  variant = 'primary',
  type = 'button',
  loading = false,
  loadingText,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const buttonProps =
    Component === 'button' ? { type, disabled: disabled || loading, 'aria-busy': loading || undefined } : {};
  return (
    <Component
      {...buttonProps}
      className={`inline-flex items-center justify-center rounded border px-4 py-2.5 font-medium transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading && loadingText ? loadingText : children}
    </Component>
  );
}
