'use strict';
const router = require('express').Router();
const db = require('../db/knex');
const { wrap } = require('../lib/helpers');

// --- Page d'entree : emblème et bouton Entrer ---
router.get('/', (req, res) => {
  res.render('public/entree', {
    title: res.locals.site.name,
    bodyClass: 'page-entree',
    plein: true,          // ni en-tete ni pied de page
  });
});

// --- Accueil : page unique, toutes les sections ---
router.get('/accueil', wrap(async (req, res) => {
  const members = await db('members')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('members.status', 'active')
    .andWhere('members.public_listed', true)
    .orderBy([{ column: 'ranks.level', order: 'desc' }, { column: 'members.rp_name', order: 'asc' }])
    .select('members.id', 'members.rp_name', 'members.bio', 'members.origin',
            'ranks.name as rank_name', 'ranks.color as rank_color');

  res.render('public/home', {
    title: `${res.locals.site.name} — ${res.locals.site.tagline}`,
    bodyClass: 'page-home',
    members,
  });
}));

// --- Anciennes pages : tout vit desormais sur l'accueil ---
const ANCRES = {
  '/histoire': '/accueil#histoire',
  '/serveur': '/accueil#histoire',
  '/le-code': '/accueil#code',
  '/reglement': '/accueil#code',
  '/famille': '/accueil#famille',
  '/effectifs': '/accueil#famille',
  '/rejoindre': '/accueil#rejoindre',
  '/projets': '/accueil#projets',
};
for (const [depuis, vers] of Object.entries(ANCRES)) {
  router.get(depuis, (req, res) => res.redirect(301, vers));
}

module.exports = router;
