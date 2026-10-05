// الوضع الداكن/الفاتح للموقع كله: صفحة التعريف والباب الأمامي والمنصة.
// المصدر الوحيد data-theme على <html> — tokens.css يقرؤه، فلا نظام ألوان ثانٍ هنا.
// index.html يضبطه قبل أول رسم من المفتاح نفسه، وهذا الملف يبدّله بعد ذلك ويحفظه.
import { useSyncExternalStore } from 'react';

// المفتاح نفسه في سكربت index.html — غيّرهما معاً.
const STORAGE_KEY = 'muthbit.theme';
export const DEFAULT_THEME = 'dark';

const listeners = new Set();

/** الوضع الحالي من <html>. أي قيمة غير light تُقرأ داكنة: الداكن هو الافتراضي. */
function readTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  listeners.forEach((listener) => listener());
}

export function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // التخزين محجوب: يبقى الاختيار لهذه الصفحة حتى تُغلق.
  }
}

// اختيار في نافذة أخرى من الموقع نفسه يصل هنا فوراً — الاختيار واحد عبر الموقع كله.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) applyTheme(event.newValue === 'light' ? 'light' : 'dark');
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** { theme, toggle } — التبديل فوري: تغيير السمة وحده يعيد تلوين كل شيء عبر متغيّرات CSS. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
