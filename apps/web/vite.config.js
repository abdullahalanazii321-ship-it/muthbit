import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// المنفذ مثبّت عمداً: CORS_ORIGIN في apps/api/.env يسمح بـ http://localhost:5173 وحده.
// لو انزاح المنفذ لرُفض كل نداء، فالأفضل أن يفشل التشغيل صراحةً بدل أن ينتقل لمنفذ آخر.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true }
});
