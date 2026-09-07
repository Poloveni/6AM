'use strict';
const pont = require('../db/bot');

/**
 * Lecture des donnees du bot Discord.
 *
 * Rappel de fonctionnement, verifie dans le code du bot :
 *  - la table `stats` contient la SEMAINE EN COURS ; le bot la vide
 *    entierement (`stat.deleteMany`) chaque dimanche a 19h00 heure de Paris ;
 *  - `settings.last_weekly_reset` porte la date (en millisecondes) du dernier
 *    reset effectue ;
 *  - la paie vaut, par categorie, `count x salary_rates.amount`.
 * Les chiffres affiches ici sont donc les memes que ceux de Discord.
 */

const { ACTIVITES, CATEGORIES, libelleActivite, categorieDe } = require('./bot-activites');


// ---------------------------------------------------------------- semaine
/** Debut de la semaine en cours et prochain reset (dimanche 19h, Europe/Paris). */
async function semaine() {
  const ligne = await pont.lire('reset', (db) =>
    db('settings').where({ key: 'last_weekly_reset' }).first('value'), null);

  const debut = ligne && Number(ligne.value) ? new Date(Number(ligne.value)) : null;

  // Prochain dimanche 19h heure de Paris, exprime en heure locale du serveur.
  const parisNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const suivant = new Date(parisNow);
  suivant.setHours(19, 0, 0, 0);
  suivant.setDate(suivant.getDate() + ((7 - suivant.getDay()) % 7));
  if (suivant <= parisNow) suivant.setDate(suivant.getDate() + 7);
  const decalage = new Date().getTime() - parisNow.getTime();

  return { debut, prochain: new Date(suivant.getTime() + decalage) };
}

// ---------------------------------------------------------------- quotas
async function objectifs() {
  const rows = await pont.lire('objectifs', (db) => db('quota_targets').select('*'), []);
  return Object.fromEntries(rows.map((r) => [r.quota_type, Number(r.weekly_target)]));
}

async function taux() {
  const rows = await pont.lire('taux', (db) => db('salary_rates').select('*'), []);
  return Object.fromEntries(rows.map((r) => [r.quota_type, Number(r.amount)]));
}

/**
 * Semaine en cours par membre Discord :
 *   Map discordId -> { parCategorie, parAction, salaire }
 */
async function activiteParMembre() {
  const [stats, rates] = await Promise.all([
    pont.lire('stats', (db) => db('stats').select('user_id', 'action', 'count'), []),
    taux(),
  ]);

  const parMembre = new Map();
  for (const s of stats) {
    const id = String(s.user_id);
    if (!parMembre.has(id)) parMembre.set(id, { parCategorie: {}, parAction: {}, salaire: 0 });
    const m = parMembre.get(id);
    const n = Number(s.count) || 0;
    m.parAction[s.action] = (m.parAction[s.action] || 0) + n;
    const cat = categorieDe(s.action);
    if (cat) m.parCategorie[cat] = (m.parCategorie[cat] || 0) + n;
  }
  for (const m of parMembre.values()) {
    m.salaire = Object.entries(rates)
      .reduce((somme, [cat, montant]) => somme + (m.parCategorie[cat] || 0) * montant, 0);
  }
  return parMembre;
}

// ---------------------------------------------------------------- coffre
/** Stock courant, regroupe comme dans le message "Stock Général" du bot. */
async function coffre() {
  const [stocks, items] = await Promise.all([
    pont.lire('stocks', (db) => db('stocks').select('item', 'quantite'), []),
    pont.lire('items', (db) => db('items').select('name', 'stock_group', 'display_order', 'visible_stock'), []),
  ]);
  const parNom = Object.fromEntries(items.map((i) => [i.name, i]));

  const groupes = new Map();
  for (const s of stocks) {
    const item = parNom[s.item];
    if (item && item.visible_stock === false) continue;
    const nom = (item && item.stock_group) || s.item;
    if (!groupes.has(nom)) groupes.set(nom, { nom, total: 0, ordre: item ? item.display_order : 999, details: [] });
    const g = groupes.get(nom);
    g.total += Number(s.quantite) || 0;
    g.details.push({ item: s.item, quantite: Number(s.quantite) || 0 });
  }
  return [...groupes.values()].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom));
}

async function mouvements(limite = 25) {
  return pont.lire('mouvements', (db) => db('stock_history')
    .orderBy('timestamp', 'desc').limit(limite)
    .select('timestamp', 'joueur', 'action', 'item', 'quantite', 'stock_avant', 'stock_apres'), []);
}

// ---------------------------------------------------------------- divers
async function cooldowns() {
  return pont.lire('cooldowns', (db) => db('cooldowns')
    .where('expires_at', '>', new Date())
    .orderBy('expires_at', 'asc')
    .select('user_id', 'action', 'expires_at'), []);
}

async function taxes() {
  return pont.lire('taxes', (db) => db('taxes')
    .where({ actif: true }).orderBy('echeance', 'asc')
    .select('id', 'nom', 'type', 'telephone', 'echeance', 'paye'), []);
}

async function armurerie() {
  return pont.lire('armurerie', (db) => db('armurerie')
    .orderBy([{ column: 'statut' }, { column: 'nom' }])
    .select('id', 'nom', 'reference', 'statut', 'pretee_a', 'type'), []);
}

async function ventesMunitions(depuis) {
  return pont.lire('munitions', (db) => db('munitions_ventes')
    .where('timestamp', '>=', depuis).orderBy('timestamp', 'desc')
    .select('timestamp', 'vendeur_id', 'vendeur_username', 'acheteur_id', 'quantite', 'prix'), []);
}

async function vehiculesSortis() {
  return pont.lire('vehicules', (db) => db('vehicules')
    .whereNotNull('joueur').orderBy('timestamp', 'desc')
    .select('plaque', 'modele', 'discord_id', 'joueur', 'timestamp'), []);
}

async function fourrieres(limite = 20) {
  return pont.lire('fourrieres', (db) => db('fourrieres')
    .orderBy('timestamp', 'desc').limit(limite)
    .select('discord_id', 'joueur', 'plaque', 'modele', 'timestamp'), []);
}

async function ventesEnAttente() {
  return pont.lire('ventes', (db) => db('pending_sales')
    .where({ statut: 'en_attente' }).orderBy('timestamp', 'desc')
    .select('joueur', 'discord_id', 'item', 'quantite', 'timestamp', 'montant'), []);
}

/** Correspondance pseudo en jeu -> identifiant Discord, tenue par le bot. */
async function correspondances() {
  const rows = await pont.lire('mapping', (db) => db('user_mapping').select('game_name', 'discord_id'), []);
  return Object.fromEntries(rows.map((r) => [String(r.discord_id), r.game_name]));
}

module.exports = {
  ACTIVITES, CATEGORIES, libelleActivite, categorieDe,
  semaine, objectifs, taux, activiteParMembre,
  coffre, mouvements, cooldowns, taxes, armurerie, ventesMunitions,
  vehiculesSortis, fourrieres, ventesEnAttente, correspondances,
  disponible: pont.disponible, diagnostic: pont.diagnostic,
};
