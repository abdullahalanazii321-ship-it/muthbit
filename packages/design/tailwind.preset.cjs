'use strict';

/**
 * إعداد Tailwind المشترك لهوية مثبت.
 * تستورده كل واجهة في المنصة:
 *   // tailwind.config.cjs
 *   module.exports = { presets: [require('@muthbit/design/tailwind.preset.cjs')], content: [...] };
 *
 * الألوان تشير إلى متغيرات CSS في tokens.css، فيعمل الوضعان الفاتح والداكن
 * دون كتابة أي لون مرتين.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        ground: 'var(--mb-ground)',
        surface: 'var(--mb-surface)',
        'surface-2': 'var(--mb-surface-2)',
        ink: 'var(--mb-ink)',
        muted: 'var(--mb-muted)',
        line: 'var(--mb-line)',
        'line-strong': 'var(--mb-line-strong)',
        seal: 'var(--mb-seal)',
        'seal-soft': 'var(--mb-seal-soft)',
        signal: 'var(--mb-signal)',
        'signal-soft': 'var(--mb-signal-soft)'
      },
      fontFamily: {
        display: ['Noto Kufi Arabic', 'Archivo', 'system-ui', 'sans-serif'],
        body: ['IBM Plex Sans Arabic', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'IBM Plex Sans Arabic', 'ui-monospace', 'monospace']
      },
      borderRadius: { DEFAULT: '6px', sm: '4px' },
      maxWidth: { measure: '66ch' }
    }
  },
  plugins: []
};
