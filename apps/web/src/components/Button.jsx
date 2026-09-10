const variants = {
  primary: 'border-seal bg-seal text-surface enabled:hover:opacity-90',
  secondary: 'border-line-strong bg-surface text-ink enabled:hover:bg-surface-2'
};

/** أثناء الانتظار يُعطَّل الزر ويتغيّر نصه إلى loadingText. */
export default function Button({
  variant = 'primary',
  type = 'button',
  loading = false,
  loadingText,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded border px-4 py-2.5 font-medium transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
