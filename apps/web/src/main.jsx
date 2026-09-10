// ترتيب هذين السطرين مقصود — لا تعكسه:
// ١) tokens.css يبدأ بـ @import لخطوط Google، وقاعدة @import يجب أن تسبق كل CSS آخر وإلا سقطت الخطوط في البناء.
// ٢) استيراده من JavaScript (لا من @import داخل CSS) هو ما يُحلّ خريطة exports في حزمة @muthbit/design.
import '@muthbit/design/tokens.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './lib/session.js';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>
);
