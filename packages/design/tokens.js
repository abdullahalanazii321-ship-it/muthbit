'use strict';

/** نفس توكنز tokens.css بصيغة JavaScript — للرسوم البيانية وأي شيء يحتاج القيمة لا المتغيّر. */
const light = {
  ground: '#EDEFEC',
  surface: '#FFFFFF',
  surface2: '#E4E8E4',
  ink: '#10201D',
  muted: '#5C6B66',
  line: '#D2D9D4',
  lineStrong: '#B7C2BC',
  seal: '#0B4F4A',
  sealSoft: '#DDE9E4',
  signal: '#B2551B',
  signalSoft: '#F0E3D8',
  logoAccent: '#12857A'
};

const dark = {
  ground: '#0B1210',
  surface: '#121C19',
  surface2: '#182421',
  ink: '#E7EDE9',
  muted: '#94A39D',
  line: '#22302B',
  lineStrong: '#33443E',
  seal: '#54C3A8',
  sealSoft: '#16302A',
  signal: '#E19257',
  signalSoft: '#2C2118',
  logoAccent: '#3FC4B2'
};

const fonts = {
  display: "'Noto Kufi Arabic', 'Archivo', system-ui, sans-serif",
  body: "'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
  mono: "'IBM Plex Mono', 'IBM Plex Sans Arabic', ui-monospace, monospace"
};

/** دلالات الحالات — تُستخدم في الشارات حتى لا تُخترع ألوان جديدة في كل شاشة. */
const status = {
  draft: 'muted',
  sourcing: 'muted',
  pending_approval: 'seal',
  approved: 'seal',
  ordered: 'seal',
  delivered: 'seal',
  closed: 'muted',
  rejected: 'signal',
  cancelled: 'signal',
  over_ceiling: 'signal',
  incomplete_offer: 'signal'
};

module.exports = { light, dark, fonts, status };
