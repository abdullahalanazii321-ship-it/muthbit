export default function Field({ id, label, ...inputProps }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded border border-line-strong bg-surface px-3 py-2 text-ink focus:border-seal focus:outline-none focus:ring-1 focus:ring-seal disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
        {...inputProps}
      />
    </div>
  );
}
