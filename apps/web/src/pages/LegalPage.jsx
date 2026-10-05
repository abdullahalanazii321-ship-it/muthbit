import { useEffect } from 'react';
import { PublicFrame } from './LandingPage.jsx';
import { LEGAL_UPDATED } from '../lib/legalContent.jsx';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mkt-mint';

/**
 * صفحة عامة لنص قانوني (الشروط أو الخصوصية) بإطار صفحة التعريف — بلا تسجيل دخول.
 * عمود واحد بعرض القراءة (max-w-measure)، وفهرس جانبي للأقسام فوق ١٠٢٤ بكسل يختفي تحتها.
 * النصوص من lib/legalContent.jsx كما كتبها المالك؛ هذه الصفحة شكلها وحده.
 */
export default function LegalPage({ doc }) {
  // التنقّل داخل التطبيق يُبقي موضع التمرير السابق: الصفحة تبدأ من أعلاها، إلا إن طُلب قسم بعينه (#...).
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [doc]);

  const headingId = (section) => `section-${section.id}`;

  return (
    <PublicFrame>
      {/* break-words: اسم أو بريد طويل بلا مسافة في النص لا يمدّ الصفحة على ٣٦٠. */}
      <main className="mx-auto w-full max-w-6xl break-words px-5 py-12">
        <div className="lg:flex lg:items-start lg:gap-12">
          <nav aria-label="فهرس الأقسام" className="hidden lg:sticky lg:top-6 lg:block lg:w-sidebar lg:shrink-0">
            <p className="text-sm font-semibold text-mkt-paper">{doc.title}</p>
            <ol className="mt-3 flex flex-col gap-2 border-s border-mkt-line ps-4 text-sm">
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${headingId(section)}`} className={`rounded-sm text-mkt-muted transition-colors hover:text-mkt-paper ${focusRing}`}>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 max-w-measure flex-1">
            <h1 className="font-display text-3xl font-semibold text-mkt-paper">{doc.title}</h1>
            <p className="mt-2 text-sm text-mkt-muted">{LEGAL_UPDATED}</p>

            {doc.sections.map((section) => (
              <section key={section.id} aria-labelledby={headingId(section)} className="mt-10">
                <h2 id={headingId(section)} className="scroll-mt-6 font-display text-xl font-semibold text-mkt-paper">
                  {section.title}
                </h2>
                <div className="mt-3 flex flex-col gap-3 leading-body text-mkt-paper [&_li]:mt-2 [&_li_p]:mt-2 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:ps-5">
                  {section.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
    </PublicFrame>
  );
}
