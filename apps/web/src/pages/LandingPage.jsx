import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';

/**
 * صفحة التعريف العامة على /: يراها الزائر قبل أن يُطلب منه حساب، وصاحب الجلسة لا يراها (App.jsx يحوّله).
 * داكنة ثابتة بألوان --mb-mkt-* في tokens.css لا تتبع وضع النظام، والمنصة خلف الدخول تبقى فاتحة.
 * النصوص من التصميم المعتمد حرفياً — لا تُعاد صياغتها ولا يُضاف إليها.
 * لا Button من المنصة هنا: ألوانه وحلقة تركيزه للأرضية الفاتحة ولا تُقرأ على الداكن.
 */

const container = 'mx-auto w-full max-w-6xl px-5';
const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mkt-mint';
const textLink = `rounded-sm text-mkt-muted transition-colors hover:text-mkt-paper ${focusRing}`;

const SECTION_LINKS = [
  { href: '#features', label: 'المميزات' },
  { href: '#parties', label: 'الأطراف' },
  { href: '#how', label: 'كيف تعمل' }
];

const STATS = [
  { value: 'لا يُعدَّل', label: 'سجل التدقيق' },
  { value: '7 أدوار', label: 'صلاحيات محدّدة' },
  { value: '0', label: 'مورد بلا تحقّق' }
];

const PROBLEMS = [
  {
    icon: 'warning',
    title: 'شراء فوق الصلاحية',
    text: 'موظف يوقّع التزاماً يتجاوز ما يملك، ولا أحد يعلم إلا بعد وصول الفاتورة. الحدّ موجود على الورق فقط، ولا شيء يفرضه لحظة الشراء.'
  },
  {
    icon: 'message',
    title: 'موافقة بلا أثر',
    text: 'القرار يُعطى شفهياً أو في رسالة تُمسح. وعند الخلاف لا يوجد ما يُثبت من وافق، على أي مبلغ، ومتى — فيتحوّل النقاش إلى ذاكرة ضدّ ذاكرة.'
  },
  {
    icon: 'search',
    title: 'مورد لم يتحقّق منه أحد',
    text: 'يُختار لأن أحدهم يعرفه، لا لأن منشأته رُوجعت. أول اختبار حقيقي يأتي بعد الدفع، وهو أغلى وقت يمكن أن يُكتشف فيه الخطأ.'
  }
];

const FEATURES = [
  {
    icon: 'ceiling',
    title: 'سقف لكل مشترٍ',
    text: 'مبلغ للطلب الواحد، وسقف شهري، وفئات مسموحة. ومن لم يُضبط له سقف لا يستطيع الشراء أصلاً — الإغلاق هو الوضع الافتراضي.'
  },
  {
    icon: 'approval',
    title: 'موافقة لا تُتجاوز',
    text: 'تجاوز سقف الطلب يُرفع لصاحب صلاحية أعلى، وتجاوز السقف الشهري يُمنع منعاً قاطعاً. ولا يعتمد أحد طلباً أنشأه بنفسه.'
  },
  {
    icon: 'ledger',
    title: 'سجل لا يُعدَّل',
    text: 'كل حدث يُكتب مرة واحدة ولا يُمسّ بعدها. قاعدة البيانات نفسها ترفض أي تعديل أو حذف — لا اعتماداً على انضباط المستخدمين.'
  },
  {
    icon: 'shield',
    title: 'موردون موثّقون',
    text: 'المورد لا يظهر للشركات ولا يقدّم عرضاً قبل مراجعة منشأته واعتماد فئاته. والعرض الناقص لا يصل المشتري إطلاقاً.'
  }
];

const PARTIES = [
  {
    icon: 'company',
    title: 'الشركات المشترية',
    points: [
      'سقوف إنفاق تُضبط لكل موظف على حدة',
      'مقارنة العروض بسعر وضمان ومدة تسليم',
      'سجل كامل يصلح للمراجعة الداخلية والخارجية'
    ]
  },
  {
    icon: 'supplier',
    title: 'الموردون',
    points: [
      'طلبات حقيقية في فئاتك المعتمدة وحدها',
      'منافسة على السعر والضمان لا على المعرفة',
      'حالة عرضك ظاهرة لك دائماً: مُقدَّم، أو مُختار، أو مسحوب'
    ]
  },
  {
    icon: 'audit',
    title: 'المالية والمراجعة',
    points: [
      'اعتماد أو رفض بسبب مكتوب يبقى في السجل',
      'المنصة توقف تجاوز السقف الشهري لحظة القرار، وتقول المبلغ والسقف بالرقم',
      'تتبّع كل مبلغ إلى الطلب والعرض والقرار'
    ]
  }
];

const STEPS = [
  { title: 'المشتري يطلب', text: 'يكتب الصنف والكمية والفئة. المنصة تتحقّق من سقفه قبل أن تقبل الطلب.' },
  { title: 'الموردون يعرضون', text: 'يصل الطلب لموردي الفئة الموثّقين، ويقدّم كل واحد سعره وضمانه ومدته.' },
  { title: 'المعتمِد يقرّر', text: 'يُختار العرض ويُرفع للاعتماد. صاحب الطلب لا يعتمده، والسبب يُكتب.' },
  { title: 'أمر الشراء يصدر', text: 'يصدر بمرجع دائم، ويبقى الطريق كاملاً من الطلب إليه مقروءاً في السجل.' }
];

const RULES = [
  { title: 'تجاوز سقف الطلب', text: 'يُرفع لصاحب صلاحية أعلى، لا يُمنع.' },
  { title: 'تجاوز السقف الشهري', text: 'يُمنع. لا أحد يعتمد فوق ميزانية الشهر.' },
  { title: 'فئة غير مسموحة', text: 'يُمنع. السقف لا يمتدّ خارج فئاته.' }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-mkt-ground text-mkt-paper">
      <SiteHeader />
      <main>
        <Hero />
        <Problems />
        <Features />
        <Parties />
        <HowItWorks />
        <FinalCall />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ───────────────────────────── الشريط العلوي ───────────────────────────── */

function SiteHeader() {
  return (
    <header className="border-b border-mkt-line">
      <div className={`${container} flex items-center justify-between gap-6 py-4`}>
        <Brand />
        <nav aria-label="أقسام الصفحة" className="flex items-center gap-6">
          {/* تحت 720 بكسل تختفي روابط الأقسام ويبقى زر الدخول وحده. */}
          <ul className="hidden items-center gap-6 text-sm font-medium min-[720px]:flex">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={textLink}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            to="/login"
            className={`rounded border border-mkt-line-strong px-4 py-2 text-sm font-medium text-mkt-paper transition-colors hover:border-mkt-mint ${focusRing}`}
          >
            تسجيل الدخول
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** القفلة الأفقية كما في شريط المنصة: الرمز ثم الاسم، و aria-hidden على الرمز لأن الاسم مكتوب بجانبه. */
function Brand() {
  return (
    <Link
      to="/"
      className={`flex items-center gap-2 rounded-sm font-display text-lg font-semibold text-mkt-paper ${focusRing}`}
    >
      <Logo size={30} onDark aria-hidden="true" />
      مثبت
    </Link>
  );
}

/* ───────────────────────────── ١ · الواجهة الأولى ───────────────────────────── */

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className={`${container} grid items-center gap-12 py-16 sm:py-20 min-[900px]:grid-cols-2`}
    >
      <div>
        <Chip>منصة مشتريات موثّقة</Chip>

        <h1 id="hero-title" className="mt-6 font-display text-4xl font-bold leading-snug text-mkt-paper sm:text-5xl">
          <span className="block">الشراء يمرّ</span>
          <span className="block text-mkt-mint">بقواعد شركتك</span>
          <span className="block">لا من حولها.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-mkt-muted">
          مثبت تضع سقف الإنفاق لكل مشترٍ، وتُلزم كل طلب بموافقة من غير صاحبه، وتكتب كل خطوة في سجل لا يقبل التعديل —
          وتفتح الباب لموردين لا يظهرون قبل التحقق منهم.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <CtaLink to="/register?type=company">أنشئ حساب شركتك ←</CtaLink>
          <CtaLink to="/login" variant="outline">
            لديك حساب؟ دخول
          </CtaLink>
        </div>

        {/* dt قبل dd في الترتيب، و flex-col-reverse يُظهر القيمة فوق عنوانها. */}
        <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-mkt-line pt-6">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse gap-1">
              <dt className="text-sm text-mkt-muted">{stat.label}</dt>
              <dd className="font-display text-xl font-semibold text-mkt-paper sm:text-2xl">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <HeroVisual />
    </section>
  );
}

/** الرسم زخرفة لا محتوى: يُخفى عن قارئ الشاشة، ويختفي كلياً تحت 900 بكسل بدل أن ينضغط. */
function HeroVisual() {
  return (
    <div className="hidden min-[900px]:block">
      <div className="relative overflow-hidden rounded-2xl border border-mkt-line bg-gradient-to-b from-mkt-surface to-mkt-ground-2 px-8 py-16">
        <HeroArt />
        {/* start = يمين الصفحة في RTL، و end = يسارها. */}
        <Chip className="absolute start-5 top-5" icon={<LockIcon />}>
          سجل ملحق فقط
        </Chip>
        <Chip className="absolute bottom-5 end-5" icon={<ClipboardIcon />}>
          مبنيّة لإدارة المشتريات
        </Chip>
      </div>
    </div>
  );
}

// إحداثيات SVG فيزيائية لا تنعكس مع RTL: «اليمين» في الوصف هو x الأكبر هنا.
// والسلسلة تبدأ من اليمين كالصفحة: اليمنى والوسطى تمّتا، واليسرى لم تتم بعد.
const TIMELINE = [
  { cx: 330, done: true },
  { cx: 210, done: true },
  { cx: 90, done: false }
];

function HeroArt() {
  return (
    <svg viewBox="0 0 420 356" className="h-auto w-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mb-hero-front-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--mb-mkt-surface-2)" />
          <stop offset="1" stopColor="var(--mb-mkt-surface)" />
        </linearGradient>
      </defs>

      {/* بطاقتان خلفيتان تطلّان من فوق الأمامية */}
      <rect x="90" y="36" width="240" height="190" rx="14" fill="var(--mb-mkt-ground-2)" stroke="var(--mb-mkt-line)" />
      <rect x="75" y="58" width="270" height="190" rx="14" fill="var(--mb-mkt-surface)" stroke="var(--mb-mkt-line)" />

      {/* الأمامية: أكبر وأفتح بتدرّج */}
      <rect
        x="60"
        y="80"
        width="300"
        height="190"
        rx="16"
        fill="url(#mb-hero-front-card)"
        stroke="var(--mb-mkt-line-strong)"
      />

      {/* العنوان والمرجع — أعلى اليمين */}
      <rect x="216" y="104" width="120" height="10" rx="5" fill="var(--mb-mkt-paper)" opacity="0.85" />
      <rect x="264" y="124" width="72" height="8" rx="4" fill="var(--mb-mkt-muted)" opacity="0.75" />

      {/* التفاصيل: ثلاثة أسطر رمادية متدرّجة الطول */}
      <rect x="96" y="156" width="240" height="7" rx="3.5" fill="var(--mb-mkt-muted)" opacity="0.4" />
      <rect x="136" y="174" width="200" height="7" rx="3.5" fill="var(--mb-mkt-muted)" opacity="0.4" />
      <rect x="186" y="192" width="150" height="7" rx="3.5" fill="var(--mb-mkt-muted)" opacity="0.4" />

      {/* المبلغ: كبسولة بحدّ نعناعي وشريط نعناعي بداخلها — أسفل اليمين */}
      <rect
        x="226"
        y="222"
        width="110"
        height="28"
        rx="14"
        fill="var(--mb-mkt-ground-2)"
        stroke="var(--mb-mkt-mint)"
        strokeWidth="1.5"
      />
      <rect x="242" y="233" width="78" height="6" rx="3" fill="var(--mb-mkt-mint)" />

      {/* ختم مثبت مائلاً فوق الحافة اليسرى العليا للأمامية، وخلفه هالة داكنة شفافة تفصله عنها.
          الشعار نفسه (Logo) أحادياً بلون surface على قرص الختم — لا نسخة ثانية من مساراته. */}
      <g transform="rotate(-9 86 94)">
        <circle cx="86" cy="94" r="48" fill="var(--mb-mkt-ground-2)" opacity="0.7" />
        <circle cx="86" cy="94" r="36" fill="var(--mb-seal)" />
        <Logo x="62" y="70" size={48} body="var(--mb-surface)" accent="var(--mb-surface)" aria-hidden="true" />
      </g>

      {/* خط المراحل من اليمين: اليمنى والوسطى تمّتا بعلامة صح، واليسرى مفرّغة لم تتم بعد */}
      <line x1="90" y1="310" x2="330" y2="310" stroke="var(--mb-mkt-line-strong)" strokeWidth="2" />
      {TIMELINE.map(({ cx, done }) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy="310"
            r="12"
            fill={done ? 'var(--mb-mkt-mint)' : 'var(--mb-mkt-ground-2)'}
            stroke="var(--mb-mkt-mint)"
            strokeWidth="2"
          />
          {done && (
            <path
              d={`M${cx - 5} 310.5 l3.5 3.5 l6.5 -7`}
              fill="none"
              stroke="var(--mb-mkt-ground)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <rect x={cx - 22} y="334" width="44" height="6" rx="3" fill="var(--mb-mkt-muted)" opacity="0.4" />
        </g>
      ))}
    </svg>
  );
}

/* ───────────────────────────── ٢ · المشكلة ───────────────────────────── */

function Problems() {
  return (
    <Section id="why" eyebrow="لماذا مثبت" title="ثلاث ثغرات تتكرّر في كل شركة تشتري" lead="لا واحدة منها تُحلّ بجدول إكسل ولا بمجموعة واتساب.">
      <ul className="mt-12 grid gap-5 min-[900px]:grid-cols-3">
        {PROBLEMS.map((item) => (
          <li key={item.title}>
            <Card icon={item.icon} title={item.title}>{item.text}</Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ───────────────────────────── ٣ · المميزات ───────────────────────────── */

function Features() {
  return (
    <Section
      id="features"
      eyebrow="المميزات"
      title="قواعد الشركة تُطبَّق، لا تُشرح"
      lead="من إنشاء الطلب حتى صدور أمر الشراء — كل خطوة محكومة ومكتوبة."
    >
      <ul className="mt-12 grid gap-5 sm:grid-cols-2 min-[900px]:grid-cols-4">
        {FEATURES.map((item) => (
          <li key={item.title}>
            <Card icon={item.icon} title={item.title}>{item.text}</Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ───────────────────────────── ٤ · الأطراف ───────────────────────────── */

function Parties() {
  return (
    <Section
      id="parties"
      eyebrow="الأطراف"
      title="كل دور يرى ما يخصّه، ولا شيء سواه"
      lead="صلاحيات مفصولة تحمي الشركة وتحفظ حقّ المورد في الوقت نفسه."
    >
      <ul className="mt-12 grid gap-5 min-[900px]:grid-cols-3">
        {PARTIES.map((party) => (
          <li key={party.title}>
            <Card icon={party.icon} title={party.title}>
              <ul className="space-y-3">
                {party.points.map((point) => (
                  <li key={point} className="flex gap-3">
                    <CheckIcon />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ───────────────────────────── ٥ · كيف تعمل ───────────────────────────── */

function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="كيف تعمل"
      title="أربع خطوات، ولا خطوة خارج المنصة"
      lead="دورة واحدة يفهمها الجميع، وتنتهي بأمر شراء موثّق."
    >
      <div className="relative mt-12">
        {/* الخط الأفقي يمرّ بمراكز الدوائر: من منتصف العمود الأول إلى منتصف الأخير.
            تحت 900 بكسل يختفي وتصير الخطوات تحت بعضها. */}
        <div aria-hidden="true" className="absolute inset-x-[12.5%] top-5 hidden h-px bg-mkt-line-strong min-[900px]:block" />
        <ol className="relative grid gap-8 min-[900px]:grid-cols-4 min-[900px]:gap-6">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-4 min-[900px]:flex-col min-[900px]:items-center min-[900px]:text-center"
            >
              {/* text-surface على bg-seal كزر المنصة الأساسي: يبقى مقروءاً والختم يتبدّل مع وضع النظام. */}
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-seal font-display font-semibold text-surface">
                {index + 1}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-mkt-paper">{step.title}</h3>
                <p className="mt-2 text-mkt-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <ul className="mt-12 grid gap-5 min-[900px]:grid-cols-3">
        {RULES.map((rule) => (
          <li key={rule.title} className="rounded-xl border border-mkt-line bg-mkt-surface px-5 py-4">
            <p className="font-display font-semibold text-mkt-paper">{rule.title}</p>
            <p className="mt-1 text-sm text-mkt-muted">{rule.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ───────────────────────────── ٦ · الدعوة والتذييل ───────────────────────────── */

function FinalCall() {
  return (
    <section aria-labelledby="cta-title" className="border-t border-mkt-line py-20">
      <div className={container}>
        <div className="rounded-2xl border border-mkt-line-strong bg-gradient-to-b from-mkt-surface-2 to-mkt-surface px-6 py-14 text-center sm:px-12">
          <h2 id="cta-title" className="font-display text-3xl font-bold leading-snug text-mkt-paper sm:text-4xl">
            جاهز تُدخل مشترياتك تحت قواعدك؟
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-mkt-muted">
            أنشئ حساب شركتك اليوم، أو سجّل منشأتك كمورد. المراجعة تسبق التفعيل — ولهذا السبب بالذات يثق بها الطرف الآخر.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaLink to="/register?type=company">أنشئ حساب شركتك ←</CtaLink>
            <CtaLink to="/register?type=supplier" variant="outline">
              سجّل منشأتك كمورد
            </CtaLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-mkt-line bg-mkt-ground-2">
      <div className={`${container} py-12`}>
        <div className="flex flex-col gap-8 min-[720px]:flex-row min-[720px]:items-start min-[720px]:justify-between">
          <div>
            <Brand />
            <p className="mt-3 text-sm text-mkt-muted">منصة مشتريات موثّقة للشركات السعودية</p>
          </div>
          <nav aria-label="روابط التذييل">
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              {SECTION_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={textLink}>
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link to="/register" className={textLink}>
                  إنشاء حساب
                </Link>
              </li>
              <li>
                <Link to="/login" className={textLink}>
                  تسجيل الدخول
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* في RTL أول عنصر في الصف هو الأيمن. */}
        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-mkt-line pt-6 text-sm text-mkt-muted">
          <p>© 2026 مثبت. جميع الحقوق محفوظة.</p>
          <p>صُمّمت في المملكة العربية السعودية</p>
        </div>
      </div>
    </footer>
  );
}

/* ───────────────────────────── قطع مشتركة في الصفحة ───────────────────────────── */

function Section({ id, eyebrow, title, lead, children }) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="border-t border-mkt-line py-20">
      <div className={container}>
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-mkt-mint">{eyebrow}</p>
          <h2 id={titleId} className="mt-3 font-display text-3xl font-bold leading-snug text-mkt-paper sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg text-mkt-muted">{lead}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

/** بطاقة بأيقونة فوق عنوانها. icon مفتاح في CARD_ICONS. */
function Card({ icon, title, children }) {
  return (
    <div className="h-full rounded-xl border border-mkt-line bg-mkt-surface p-6">
      <CardIcon name={icon} />
      <h3 className="mt-4 font-display text-lg font-semibold text-mkt-paper">{title}</h3>
      <div className="mt-3 text-mkt-muted">{children}</div>
    </div>
  );
}

/**
 * مربّع مستدير بخلفية نعناعية شفافة (mkt-line) وحدّ رفيع، بداخله أيقونة خطّية بالنعناعي.
 * المقاس واحد في البطاقات العشر. زخرفة تُخفى عن قارئ الشاشة — العنوان يحمل المعنى.
 */
function CardIcon({ name }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-11 items-center justify-center rounded-lg border border-mkt-line-strong bg-mkt-line"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--mb-mkt-mint)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        className="size-5"
      >
        {CARD_ICONS[name]}
      </svg>
    </span>
  );
}

// أيقونات خطّية مرسومة هنا (stroke لا fill) على شبكة 24×24 — لا مكتبة أيقونات.
const CARD_ICONS = {
  // المشكلة
  warning: (
    <>
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 10v4" />
      <path d="M12 17.25h.01" />
    </>
  ),
  message: (
    <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z" />
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5.5 5.5" />
    </>
  ),
  // المميزات
  ceiling: (
    <>
      <rect x="4" y="14" width="4" height="6" rx="1" />
      <rect x="10" y="9.5" width="4" height="10.5" rx="1" />
      <rect x="16" y="4.5" width="4" height="15.5" rx="1" />
    </>
  ),
  approval: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  ledger: (
    <>
      <path d="M14.5 3h-8A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7.5z" />
      <path d="M14.5 3v4.5H19" />
      <path d="M8.5 12h7M8.5 15h7M8.5 18h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 19.5 6v5.5c0 4.4-3.1 7.9-7.5 9.5-4.4-1.6-7.5-5.1-7.5-9.5V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  // الأطراف
  company: (
    <>
      <path d="M4.5 21V4.5A1.5 1.5 0 0 1 6 3h7.5A1.5 1.5 0 0 1 15 4.5V21" />
      <path d="M15 9.5h3a1.5 1.5 0 0 1 1.5 1.5v10" />
      <path d="M3 21h18" />
      <path d="M8 7.5h3.5M8 11h3.5M8 14.5h3.5" />
    </>
  ),
  supplier: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  audit: (
    <>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
      <rect x="9" y="2.5" width="6" height="4" rx="1" />
      <path d="m9 13.5 2 2 4-4.5" />
    </>
  )
};

const CTA_VARIANTS = {
  mint: 'border-mkt-mint bg-mkt-mint text-mkt-ground hover:opacity-90',
  outline: 'border-mkt-line-strong text-mkt-paper hover:border-mkt-mint'
};

function CtaLink({ to, variant = 'mint', children }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center rounded border px-5 py-3 font-semibold transition ${focusRing} ${CTA_VARIANTS[variant]}`}
    >
      {children}
    </Link>
  );
}

/** كبسولة بخلفية شبه شفافة (mkt-line) وحدّ رفيع. className للموضع وحده. */
function Chip({ icon, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-mkt-line-strong bg-mkt-line px-3 py-1 text-sm font-medium text-mkt-paper ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

const iconProps = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'var(--mb-mkt-mint)',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false'
};

function LockIcon() {
  return (
    <svg {...iconProps} strokeWidth="1.5" className="size-3.5 shrink-0">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg {...iconProps} strokeWidth="1.5" className="size-3.5 shrink-0">
      <rect x="3.5" y="2.5" width="9" height="11.5" rx="1.5" />
      <path d="M6 6h4M6 9h4M6 12h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps} strokeWidth="2" className="mt-1 size-4 shrink-0">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}
