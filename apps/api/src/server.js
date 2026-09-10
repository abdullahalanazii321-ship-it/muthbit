'use strict';
const env = require('./config/env');
const createApp = require('./app');
const db = require('./db/knex');

const app = createApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[مثبت] الواجهة البرمجية تعمل على المنفذ ${env.port} — البيئة: ${env.env}`);
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[مثبت] إيقاف الخادم (${signal})…`);
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
