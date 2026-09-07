'use strict';
const db = require('../db/knex');

let cache = null;
let cachedAt = 0;
const TTL = 30 * 1000;

async function all(force = false) {
  if (!force && cache && Date.now() - cachedAt < TTL) return cache;
  const rows = await db('settings').select('key', 'value');
  cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cachedAt = Date.now();
  return cache;
}

async function set(key, value) {
  const existing = await db('settings').where({ key }).first();
  if (existing) {
    await db('settings').where({ key }).update({ value, updated_at: new Date() });
  } else {
    await db('settings').insert({ key, value, updated_at: new Date() });
  }
  cache = null;
}

function invalidate() { cache = null; }

module.exports = { all, set, invalidate };
