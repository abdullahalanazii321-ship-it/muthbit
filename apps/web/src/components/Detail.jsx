/** زوج عنوان وقيمة داخل <dl>: العنوان بلون muted والقيمة بلون ink. */
export default function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
