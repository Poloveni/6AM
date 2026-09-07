'use strict';
const knexLib = require('knex');
const config = require('../config');

/**
 * Connexion EN LECTURE SEULE a la base du bot Discord "roxwood-network-famille".
 *
 * Le bot reste le seul a ecrire : le site ne fait que lire, pour ne jamais
 * desynchroniser les messages que le bot tient a jour dans Discord. Utiliser
 * un utilisateur PostgreSQL sans droit d'ecriture (voir README) : la garantie
 * vient du serveur, pas de la politesse de ce fichier.
 *
 * Tout est optionnel : sans BOT_DATABASE_URL, `disponible()` renvoie false et
 * les pages affichent un encart "bot non connecte" au lieu de casser.
 */

let db = null;
let etat = { configure: false, joignable: null, erreur: null, verifieA: 0 };

if (config.bot.url) {
  etat.configure = true;
  db = knexLib({
    client: 'pg',
    connection: config.bot.ssl
      ? { connectionString: config.bot.url, ssl: { rejectUnauthorized: false } }
      : config.bot.url,
    pool: { min: 0, max: 4 },
    acquireConnectionTimeout: 8000,
  });
}

const TTL = 30 * 1000;

/** Le pont est-il utilisable ? (mise en cache 30 s pour ne pas sonder a chaque page) */
async function disponible() {
  if (!db) return false;
  if (etat.joignable !== null && Date.now() - etat.verifieA < TTL) return etat.joignable;
  try {
    await db.raw('select 1');
    etat = { ...etat, joignable: true, erreur: null, verifieA: Date.now() };
  } catch (err) {
    etat = { ...etat, joignable: false, erreur: err.message, verifieA: Date.now() };
    console.warn('[bot] base injoignable :', err.message);
  }
  return etat.joignable;
}

function diagnostic() {
  return {
    configure: etat.configure,
    joignable: etat.joignable,
    erreur: etat.erreur,
  };
}

/**
 * Execute une lecture en absorbant toute panne du bot : le site ne doit
 * jamais tomber parce que la base du bot est arretee ou en migration.
 */
async function lire(nom, fn, defaut) {
  if (!(await disponible())) return defaut;
  try {
    return await fn(db);
  } catch (err) {
    console.warn(`[bot] lecture "${nom}" impossible :`, err.message);
    return defaut;
  }
}

module.exports = { db, disponible, diagnostic, lire };
