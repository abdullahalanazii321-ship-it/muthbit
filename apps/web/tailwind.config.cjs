'use strict';

/** الهوية كلها من @muthbit/design — لا يُضاف هنا لون ولا خط ولا مسافة. */
module.exports = {
  presets: [require('@muthbit/design/tailwind.preset.cjs')],
  content: ['./index.html', './src/**/*.{js,jsx}']
};
