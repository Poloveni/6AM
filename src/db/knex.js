'use strict';
const knexLib = require('knex');
const knexConfig = require('../../knexfile');
const config = require('../config');

const db = knexLib(knexConfig[config.env] || knexConfig.development);

/**
 * Insertion portable Postgres / MariaDB : renvoie l'id cree.
 * (MySQL ne supporte pas RETURNING, Postgres ne renvoie pas insertId.)
 */
db.insertId = async function insertId(table, data) {
  if (config.db.client === 'pg') {
    const rows = await db(table).insert(data).returning('id');
    const row = rows[0];
    return typeof row === 'object' ? row.id : row;
  }
  const result = await db(table).insert(data);
  return Array.isArray(result) ? result[0] : result;
};

module.exports = db;
