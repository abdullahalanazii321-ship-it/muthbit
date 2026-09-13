// لغة صفحة التعريف وحدها. المنصة بعد الدخول عربية دائماً ولا تقرأ من هنا شيئاً.

export const LANGS = ['ar', 'en'];
export const DEFAULT_LANG = 'ar';
export const LANG_PARAM = 'lang';
const STORAGE_KEY = 'muthbit.landing.lang';

// ما تعود إليه <html> عند مغادرة الصفحة الإنجليزية — كما في index.html. صريحة لا منسوخة من الحالة السابقة:
// كل ما بعد هذه الصفحة (/login و /register والمنصة) عربي RTL دائماً.
const PLATFORM_LANG = 'ar';
const PLATFORM_DIR = 'rtl';

/** اللغة المحفوظة من زيارة سابقة، أو null. بعض المتصفحات ترفض التخزين، فكل وصول إليه ملفوف. */
export function readStoredLang() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // التخزين محجوب: يبقى العنوان (?lang=) وحده مصدر اللغة.
  }
}

/** نسخة من معاملات العنوان باللغة المطلوبة: ?lang=en للإنجليزية، وبلا مُعامل للعربية. */
export function withLang(params, lang) {
  const next = new URLSearchParams(params);
  if (lang === 'en') next.set(LANG_PARAM, 'en');
  else next.delete(LANG_PARAM);
  return next;
}

/**
 * يضبط الإنجليزية على <html> نفسه (lang و dir) وعلى عنوان الصفحة ووصفها، ويعيد دالة الإرجاع.
 * على <html> لا على حاوية الصفحة: المتصفح يقرأ منه لغة الصفحة واقتراح الترجمة وجهة شريط التمرير.
 * دالة الإرجاع تُستدعى عند مغادرة الصفحة أو العودة إلى العربية، فتعيد <html> إلى ar و rtl
 * والعنوان والوصف إلى ما كانا عليه — وإلا ظهرت /login وما بعدها بالاتجاه الخاطئ.
 */
export function applyEnglishDocument(doc, { title, description }) {
  const root = doc.documentElement;
  const meta = doc.querySelector('meta[name="description"]');
  const previous = { title: doc.title, description: meta ? meta.getAttribute('content') : null };

  root.setAttribute('lang', 'en');
  root.setAttribute('dir', 'ltr');
  doc.title = title;
  if (meta) meta.setAttribute('content', description);

  return () => {
    root.setAttribute('lang', PLATFORM_LANG);
    root.setAttribute('dir', PLATFORM_DIR);
    doc.title = previous.title;
    if (meta && previous.description !== null) meta.setAttribute('content', previous.description);
  };
}
