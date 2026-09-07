'use strict';
const router = require('express').Router();
const db = require('../db/knex');
const bot = require('../lib/bot');
const { wrap } = require('../lib/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

/** Fiches d'effectif indexees par identifiant Discord. */
async function effectifsParDiscord() {
  const rows = await db('members')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .whereNotNull('members.discord_id')
    .select('members.id', 'members.rp_name', 'members.discord_id', 'members.status',
            'ranks.name as rank_name', 'ranks.color as rank_color');
  return new Map(rows.map((r) => [String(r.discord_id), r]));
}

/** Nom a afficher pour un identifiant Discord : fiche du site, sinon pseudo en jeu. */
function nommer(discordId, fiches, jeu) {
  const fiche = fiches.get(String(discordId));
  if (fiche) return { nom: fiche.rp_name, grade: fiche.rank_name, couleur: fiche.rank_color, memberId: fiche.id };
  return { nom: jeu[String(discordId)] || 'Non relié', grade: null, couleur: null, memberId: null };
}

// ─────────────────────────────────────────────────────── Ma semaine
router.get('/ma-semaine', wrap(async (req, res) => {
  const dispo = await bot.disponible();
  const base = { title: 'Ma semaine', bodyClass: 'page-app', dispo, diag: bot.diagnostic() };

  if (!dispo || !req.user.member_id) {
    return res.render('app/organisation/ma-semaine', {
      ...base, semaine: null, mien: null, objectifs: {}, taux: {}, cooldowns: [], ventes: [], armes: [],
    });
  }

  const fiche = await db('members').where({ id: req.user.member_id }).first('discord_id', 'rp_name');
  const discordId = fiche && fiche.discord_id ? String(fiche.discord_id) : null;

  const [semaine, objectifs, taux, parMembre, cds, ventes, armes] = await Promise.all([
    bot.semaine(), bot.objectifs(), bot.taux(), bot.activiteParMembre(),
    bot.cooldowns(), bot.ventesEnAttente(), bot.armurerie(),
  ]);

  res.render('app/organisation/ma-semaine', {
    ...base,
    semaine,
    discordId,
    mien: discordId ? parMembre.get(discordId) || { parCategorie: {}, parAction: {}, salaire: 0 } : null,
    objectifs, taux,
    cooldowns: discordId ? cds.filter((c) => String(c.user_id) === discordId) : [],
    ventes: discordId ? ventes.filter((v) => String(v.discord_id) === discordId) : [],
    armes: armes.filter((a) => a.statut === 'pretee' && String(a.pretee_a) === discordId),
  });
}));

// ─────────────────────────────────────────────────────── Tableau de bord
router.get('/', requireRole('staff'), wrap(async (req, res) => {
  const dispo = await bot.disponible();
  const base = { title: 'Organisation', bodyClass: 'page-app', dispo, diag: bot.diagnostic() };
  if (!dispo) {
    return res.render('app/organisation/index', {
      ...base, semaine: null, classement: [], objectifs: {}, taux: {},
      coffre: [], mouvements: [], sansDeclaration: [], totaux: { salaire: 0, membres: 0 },
    });
  }

  const [semaine, objectifs, taux, parMembre, coffre, mouvements, fiches, jeu] = await Promise.all([
    bot.semaine(), bot.objectifs(), bot.taux(), bot.activiteParMembre(),
    bot.coffre(), bot.mouvements(20), effectifsParDiscord(), bot.correspondances(),
  ]);

  const classement = [...parMembre.entries()]
    .map(([discordId, d]) => ({ discordId, ...d, ...nommer(discordId, fiches, jeu) }))
    .sort((a, b) => b.salaire - a.salaire || b.parCategorie.vente - a.parCategorie.vente);

  // Membres actifs du site qui n'ont rien declare cette semaine
  const sansDeclaration = [...fiches.values()]
    .filter((f) => f.status === 'active' && !parMembre.has(String(f.discord_id)));

  res.render('app/organisation/index', {
    ...base, semaine, classement, objectifs, taux, coffre, mouvements, sansDeclaration,
    totaux: {
      salaire: classement.reduce((s, m) => s + m.salaire, 0),
      membres: classement.length,
    },
  });
}));

// ─────────────────────────────────────────────────────── Taxes
router.get('/taxes', requireRole('staff'), wrap(async (req, res) => {
  const dispo = await bot.disponible();
  const lignes = dispo ? await bot.taxes() : [];

  const TYPES_FIXES = ['sporex', 'heroine', 'vente', 'fertilisant'];
  const maintenant = Date.now();
  const enrichies = lignes.map((t) => ({
    ...t,
    enRetard: !t.paye && new Date(t.echeance).getTime() < maintenant,
    zone: !TYPES_FIXES.includes(t.type),
  }));

  const groupes = new Map();
  for (const t of enrichies) {
    if (!groupes.has(t.type)) groupes.set(t.type, { type: t.type, zone: t.zone, lignes: [], aPayer: 0, enRetard: 0 });
    const g = groupes.get(t.type);
    g.lignes.push(t);
    if (!t.paye) g.aPayer += 1;
    if (t.enRetard) g.enRetard += 1;
  }

  res.render('app/organisation/taxes', {
    title: 'Taxes & racket', bodyClass: 'page-app', dispo, diag: bot.diagnostic(),
    groupes: [...groupes.values()].sort((a, b) => Number(a.zone) - Number(b.zone) || a.type.localeCompare(b.type)),
    total: enrichies.length,
    aPayer: enrichies.filter((t) => !t.paye).length,
    enRetard: enrichies.filter((t) => t.enRetard).length,
  });
}));

// ─────────────────────────────────────────────────────── Armurerie
router.get('/armurerie', wrap(async (req, res) => {
  const dispo = await bot.disponible();
  const base = { title: 'Armurerie', bodyClass: 'page-app', dispo, diag: bot.diagnostic() };
  if (!dispo) return res.render('app/organisation/armurerie', { ...base, armes: [], parStatut: {}, ventes: [], fiches: new Map(), jeu: {} });

  const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [armes, ventes, fiches, jeu] = await Promise.all([
    bot.armurerie(), bot.ventesMunitions(depuis), effectifsParDiscord(), bot.correspondances(),
  ]);

  const parStatut = armes.reduce((acc, a) => {
    acc[a.statut] = (acc[a.statut] || 0) + 1;
    return acc;
  }, {});

  res.render('app/organisation/armurerie', {
    ...base,
    armes: armes.map((a) => ({ ...a, porteur: a.pretee_a ? nommer(a.pretee_a, fiches, jeu).nom : null })),
    parStatut,
    ventes: ventes.map((v) => ({
      ...v,
      vendeur: nommer(v.vendeur_id, fiches, jeu).nom || v.vendeur_username,
      acheteur: nommer(v.acheteur_id, fiches, jeu).nom,
    })),
  });
}));

// ─────────────────────────────────────────────────────── Vehicules
router.get('/vehicules', requireRole('staff'), wrap(async (req, res) => {
  const dispo = await bot.disponible();
  const base = { title: 'Véhicules', bodyClass: 'page-app', dispo, diag: bot.diagnostic() };
  if (!dispo) return res.render('app/organisation/vehicules', { ...base, sortis: [], fourrieres: [] });

  const [sortis, four, fiches, jeu] = await Promise.all([
    bot.vehiculesSortis(), bot.fourrieres(20), effectifsParDiscord(), bot.correspondances(),
  ]);

  res.render('app/organisation/vehicules', {
    ...base,
    sortis: sortis.map((v) => ({ ...v, porteur: v.discord_id ? nommer(v.discord_id, fiches, jeu).nom : v.joueur })),
    fourrieres: four.map((f) => ({ ...f, porteur: f.discord_id ? nommer(f.discord_id, fiches, jeu).nom : f.joueur })),
  });
}));

module.exports = router;
