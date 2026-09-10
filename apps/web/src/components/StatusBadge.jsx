import { status as statusTones } from '@muthbit/design/tokens.js';
import { statusLabel } from '../lib/labels.js';

// لون كل حالة يأتي من خريطة status في tokens.js (muted / seal / signal).
// هنا فقط أسماء الأصناف الكاملة لكل لون، لأن Tailwind لا يرى صنفاً يُركَّب من متغيّر.
const toneClasses = {
  seal: 'border-seal bg-seal-soft text-seal',
  signal: 'border-signal bg-signal-soft text-signal',
  muted: 'border-line-strong bg-surface-2 text-muted'
};

/** وسم صغير بإحدى النغمات الثلاث — للوسوم التي ليست حالة طلب (مثل «العرض المختار»). */
export function Badge({ tone = 'muted', children }) {
  const classes = toneClasses[tone] ?? toneClasses.muted;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium ${classes}`}>
      {children}
    </span>
  );
}

export default function StatusBadge({ status }) {
  const tone = Object.hasOwn(statusTones, status) ? statusTones[status] : 'muted';
  return <Badge tone={tone}>{statusLabel(status)}</Badge>;
}
