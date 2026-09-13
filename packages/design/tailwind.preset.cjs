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
        'signal-soft': 'var(--mb-signal-soft)',
        'logo-accent': 'var(--mb-logo-accent)',
        // الصفحة العامة وحدها — داكنة ثابتة لا تتبع وضع النظام.
        'mkt-ground': 'var(--mb-mkt-ground)',
        'mkt-ground-2': 'var(--mb-mkt-ground-2)',
        'mkt-surface': 'var(--mb-mkt-surface)',
        'mkt-surface-2': 'var(--mb-mkt-surface-2)',
        'mkt-line': 'var(--mb-mkt-line)',
        'mkt-line-strong': 'var(--mb-mkt-line-strong)',
        'mkt-mint': 'var(--mb-mkt-mint)',
        'mkt-paper': 'var(--mb-mkt-paper)',
        'mkt-muted': 'var(--mb-mkt-muted)',
        'mkt-sand': 'var(--mb-mkt-sand)'
      },
      fontFamily: {
        display: ['Noto Kufi Arabic', 'Archivo', 'system-ui', 'sans-serif'],
        body: ['IBM Plex Sans Arabic', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'IBM Plex Sans Arabic', 'ui-monospace', 'monospace']
      },
      lineHeight: { body: 'var(--mb-leading-body)' },
      borderRadius: { DEFAULT: '6px', sm: '4px' },
      maxWidth: { measure: '66ch' }
    }
  },
  plugins: []
};
