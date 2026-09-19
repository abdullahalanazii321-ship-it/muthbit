import { PASSWORD_RULES, passwordGaps } from '../lib/passwordPolicy.js';

/**
 * قائمة شروط كلمة المرور، تتحدّث مع كل حرف يُكتب.
 *
 * العلامة تتغيّر مع اللون لا اللون وحده: ✓ للمحقّق و ○ لغيره — فمن لا يميّز اللونين يرى الفرق.
 * وإلى جانبهما نصّ مخفي، لأن الرمز وحده لا يُنطق في القارئ الآلي.
 *
 * والعدّ وحده في منطقة حيّة: إعلان الشروط الخمسة عند كل ضغطة مفتاح ضجيج يُنفّر منها،
 * وسطر واحد يقول كم تحقّق منها يكفي.
 *
 * راحة للمستخدم لا حماية: الخادم هو الذي يرفض (apps/api/src/utils/password.js).
 */
export default function PasswordRules({ value }) {
  const remaining = passwordGaps(value).length;
  const met = PASSWORD_RULES.length - remaining;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted">كلمة المرور تحتاج:</p>
      <ul className="flex flex-col gap-1">
        {PASSWORD_RULES.map((rule) => {
          const passed = rule.test(value);
          return (
            <li key={rule.code} className={`flex items-start gap-2 ${passed ? 'text-seal' : 'text-muted'}`}>
              <span aria-hidden="true" className="leading-6">
                {passed ? '✓' : '○'}
              </span>
              <span className="leading-6">{rule.label}</span>
              <span className="sr-only">{passed ? '— محقّق' : '— غير محقّق'}</span>
            </li>
          );
        })}
      </ul>
      <p role="status" className="sr-only">
        {`تحقّق ${met} من ${PASSWORD_RULES.length} شروط كلمة المرور.`}
      </p>
    </div>
  );
}
