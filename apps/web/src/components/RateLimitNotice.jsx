import Alert from './Alert.jsx';
import { formatRemaining, remainingUnit } from '../lib/useRateLimit.js';

/**
 * رسالة الحجب كما أرسلها الخادم، وتحتها الوقت المتبقي يتناقص كل ثانية.
 * aria-live="off" على سطر العدّاد: التنبيه نفسه يُعلَن مرة، ولا يُقرأ الرقم مع كل ثانية.
 * bdi باتجاه ltr يبقي «4:32» بترتيبه داخل الجملة العربية.
 */
export default function RateLimitNotice({ message, remaining }) {
  return (
    <Alert>
      {message}
      {remaining !== null && (
        <p className="mt-1 font-medium" aria-live="off">
          يمكنك المحاولة بعد{' '}
          <bdi dir="ltr" className="tabular-nums">
            {formatRemaining(remaining)}
          </bdi>
          {remainingUnit(remaining) && ` ${remainingUnit(remaining)}`}
        </p>
      )}
    </Alert>
  );
}
