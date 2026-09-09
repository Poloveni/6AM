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
 *  - `settings.type_groupe` porte le tier de l'organisation, qui commande les
 *    labos accessibles, les plafonds de braquage et les zones taxables ;
 *  - la paie vaut, par categorie, `count x salary_rates.amount` ;
 *  - `stocks` est le total tous coffres confondus, `coffre_stocks` le detail
 *    par salon de log de coffre. Les deux sont ecrits ensemble par le bot.
 * Les chiffres affiches ici sont donc les memes que ceux de Discord.
 *
 * Ce module ne fait que LIRE : la connexion est ouverte avec un utilisateur
 * PostgreSQL en lecture seule (voir README, "Pont vers le bot Discord").
 */

const A = require('./bot-activites');
const { ACTIVITES, CATEGORIES, libelleActivite, categorieDe } = A;

const SEMAINE_MS = 7 * 24 * 3600 * 1000;


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

// ---------------------------------------------------------- configuration
/**
 * Type d'organisation courant (`/config type-groupe`).
 * Renvoie la valeur par defaut du bot tant qu'aucun choix n'a ete fait.
 */
async function typeGroupe() {
  const ligne = await pont.lire('type_groupe', (db) =>
    db('settings').where({ key: 'type_groupe' }).first('value'), null);
  const valeur = ligne && ligne.value ? String(ligne.value) : null;
  return valeur && A.TIERS[valeur] ? valeur : A.TIER_DEFAUT;
}

/** Salons de log de coffre suivis (`/config channel add-log-coffre`). */
async function salonsCoffres() {
  const rows = await pont.lire('salons', (db) =>
    db('channels').where({ role: 'logs_coffres' }).select('channel_id'), []);
  return rows.map((r) => String(r.channel_id));
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

/**
 * Braquages des sept derniers jours (fenetre glissante tenue par le bot dans
 * la table `braquages`, independante du reset hebdomadaire des quotas).
 *
 * Renvoie { parAction, parMembre } :
 *   parAction  action -> total
 *   parMembre  Map discordId -> { action -> compte }
 */
async function braquagesSemaine() {
  const depuis = new Date(Date.now() - SEMAINE_MS);
  const rows = await pont.lire('braquages', (db) => db('braquages')
    .where('timestamp', '>=', depuis)
    .select('user_id', 'action'), []);

  const parAction = {};
  const parMembre = new Map();
  for (const r of rows) {
    const id = String(r.user_id);
    parAction[r.action] = (parAction[r.action] || 0) + 1;
    if (!parMembre.has(id)) parMembre.set(id, {});
    const m = parMembre.get(id);
    m[r.action] = (m[r.action] || 0) + 1;
  }
  return { parAction, parMembre };
}

// ---------------------------------------------------------------- coffre
/** Items suivis, indexes par nom. */
async function items() {
  const rows = await pont.lire('items', (db) => db('items')
    .select('name', 'stock_group', 'display_order', 'visible_stock', 'vente', 'labo_lie'), []);
  return Object.fromEntries(rows.map((i) => [i.name, i]));
}

/** Regroupe une liste { item, quantite } comme le message "Stock Général". */
function regrouper(stocks, parNom, tier) {
  const groupes = new Map();
  for (const s of stocks) {
    const item = parNom[s.item];
    if (item && item.visible_stock === false) continue;
    const nom = (item && item.stock_group) || s.item;
    if (!groupes.has(nom)) {
      groupes.set(nom, {
        nom, total: 0, ordre: item ? item.display_order : 999,
        production: false, details: [],
      });
    }
    const g = groupes.get(nom);
    const q = Number(s.quantite) || 0;
    g.total += q;
    // Une drogue dont le labo est actif pour le tier courant est produite en
    // interne : le bot la classe en "Drogue de production", pas "a vendre".
    if (item && item.labo_lie && A.activiteActive(item.labo_lie, tier)) g.production = true;
    g.details.push({ item: s.item, quantite: q });
  }
  return [...groupes.values()].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom));
}

/** Stock courant total, regroupe comme dans le message "Stock Général". */
async function coffre() {
  const [stocks, parNom, tier] = await Promise.all([
    pont.lire('stocks', (db) => db('stocks').select('item', 'quantite'), []),
    items(),
    typeGroupe(),
  ]);
  return regrouper(stocks, parNom, tier);
}

/**
 * Detail du stock par coffre (un salon `logs_coffres`).
 * Renvoie [{ salon, groupes, total }], salons vides compris.
 */
async function coffreParSalon() {
  const [lignes, parNom, tier, salons] = await Promise.all([
    pont.lire('coffres', (db) => db('coffre_stocks')
      .where('quantite', '>', 0)
      .select('channel_id', 'item', 'quantite'), []),
    items(),
    typeGroupe(),
    salonsCoffres(),
  ]);

  const parSalon = new Map(salons.map((id) => [id, []]));
  for (const l of lignes) {
    const id = String(l.channel_id);
    if (!parSalon.has(id)) parSalon.set(id, []);
    parSalon.get(id).push({ item: l.item, quantite: l.quantite });
  }

  return [...parSalon.entries()].map(([salon, stocks]) => {
    const groupes = regrouper(stocks, parNom, tier);
    return { salon, groupes, total: groupes.reduce((s, g) => s + g.total, 0) };
  }).sort((a, b) => b.total - a.total);
}

async function mouvements(limite = 25) {
  return pont.lire('mouvements', (db) => db('stock_history')
    .orderBy('timestamp', 'desc').limit(limite)
    .select('timestamp', 'joueur', 'action', 'item', 'quantite',
            'stock_avant', 'stock_apres', 'channel_id'), []);
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

/**
 * Journal des declarations de la semaine en cours, hors lignes supprimees
 * par un administrateur (`transactions.deleted`). Complement de `stats`, qui
 * ne garde que des compteurs : ici on a le detail horodate.
 */
async function declarations(limite = 40) {
  return pont.lire('declarations', (db) => db('transactions')
    .where({ deleted: false })
    .orderBy('timestamp', 'desc').limit(limite)
    .select('user_id', 'username', 'action', 'quantite', 'type', 'timestamp'), []);
}

/** Correspondance pseudo en jeu -> identifiant Discord, tenue par le bot. */
async function correspondances() {
  const rows = await pont.lire('mapping', (db) => db('user_mapping').select('game_name', 'discord_id'), []);
  return Object.fromEntries(rows.map((r) => [String(r.discord_id), r.game_name]));
}

module.exports = {
  ACTIVITES, CATEGORIES, libelleActivite, categorieDe,
  semaine, typeGroupe, salonsCoffres,
  objectifs, taux, activiteParMembre, braquagesSemaine,
  coffre, coffreParSalon, mouvements, declarations,
  cooldowns, taxes, armurerie, ventesMunitions,
  vehiculesSortis, fourrieres, ventesEnAttente, correspondances,
  disponible: pont.disponible, diagnostic: pont.diagnostic,
};
