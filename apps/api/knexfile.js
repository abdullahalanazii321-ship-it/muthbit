'use strict';
require('dotenv').config();

const connection = process.env.DATABASE_URL || 'postgres://muthbit:muthbit_dev@127.0.0.1:5432/muthbit_dev';
const ssl = String(process.env.PGSSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : false;

/** @type {import('knex').Knex.Config} */
const base = {
  client: 'pg',
  connection: ssl ? { connectionString: connection, ssl } : connection,
  pool: { min: 0, max: 10 },
  migrations: { directory: './src/db/migrations', tableName: 'knex_migrations' },
  seeds: { directory: './src/db/seeds' }
};

module.exports = {
  development: base,
  test: base,
  production: { ...base, pool: { min: 2, max: 20 } }
};
