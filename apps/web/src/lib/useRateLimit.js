import { useEffect, useState } from 'react';
import { errorMessage } from './api.js';

/** الثواني المتبقية كما أرسلها الخادم في details.retry_after_seconds — أو null إن غابت أو شذّت. */
function retryAfterSeconds(err) {
  const seconds = Number(err?.details?.retry_after_seconds);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}

/** ٤:٣٢ بأرقام لاتينية: «4:32»، وتحت الدقيقة الثواني وحدها: «45». */
export function formatRemaining(seconds) {
  if (seconds < 60) return String(seconds);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** الوحدة بعد الرقم: لا شيء مع «4:32»، و«ثانية/ثوانٍ» تحت الدقيقة بحسب العدد. */
export function remainingUnit(seconds) {
  if (seconds >= 60) return '';
  if (seconds >= 3 && seconds <= 10) return 'ثوانٍ';
  return 'ثانية';
}

/**
 * حجب المحاولات (429) بعدّاد تنازلي.
 *
 * capture(err) يُستدعى في catch: إن كان الخطأ حجباً حفظ رسالة الخادم كما هي والوقت المتبقي، وأعاد true.
 * العدّ من موعد انتهاء محسوب لا بإنقاص عدّاد، فلا ينجرف إن تأخّر المتصفح في تبويب خلفي.
 * عند الصفر تختفي الرسالة ويعود الزر. ولا تخزين في المتصفح: بعد العودة أو إعادة التحميل
 * يأتي الوقت من الخادم نفسه مع أول محاولة.
 *
 * إن جاء حجب بلا ثوانٍ (لا يحدث اليوم) بقي الزر معطّلاً بلا عدّاد — المنع افتراضاً.
 */
export function useRateLimit() {
  const [block, setBlock] = useState(null); // { message, until } — until بالمللي ثانية أو null
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!block?.until) return undefined;
    let timer;
    const tick = () => {
      const msLeft = block.until - Date.now();
      if (msLeft <= 0) {
        setBlock(null);
        setRemaining(null);
        return;
      }
      setRemaining(Math.ceil(msLeft / 1000));
      // الدقّة التالية عند حدّ الثانية التالية بالضبط.
      timer = setTimeout(tick, msLeft % 1000 || 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [block]);

  function capture(err) {
    if (err?.status !== 429) return false;
    const seconds = retryAfterSeconds(err);
    setRemaining(seconds);
    setBlock({ message: errorMessage(err), until: seconds ? Date.now() + seconds * 1000 : null });
    return true;
  }

  return { blocked: block !== null, message: block?.message ?? null, remaining, capture };
}

/** نص الزر أثناء الحجب: «أعد المحاولة بعد 4:32» — أو null إن لم يكن عدّاد. */
export function retryLabel(remaining) {
  if (remaining === null) return null;
  const unit = remainingUnit(remaining);
  return `أعد المحاولة بعد ${formatRemaining(remaining)}${unit ? ` ${unit}` : ''}`;
}
