'use strict';
const path = require('path');
const config = require('./src/config');

const connection = config.db.url
  ? (config.db.ssl
      ? { connectionString: config.db.url, ssl: { rejectUnauthorized: false } }
      : config.db.url)
  : {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      ...(config.db.client === 'mysql2' ? { charset: 'utf8mb4', timezone: 'Z' } : {}),
      ...(config.db.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    };

/** @type {import('knex').Knex.Config} */
const base = {
  client: config.db.client,
  connection,
  pool: { min: config.db.poolMin, max: config.db.poolMax },
  migrations: {
    directory: path.join(__dirname, 'src', 'db', 'migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.join(__dirname, 'src', 'db', 'seeds'),
  },
  ...(config.db.client === 'mysql2' ? {} : { searchPath: ['public'] }),
};

module.exports = {
  development: base,
  production: base,
  test: base,
  ...base,
};
