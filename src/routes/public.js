'use strict';
const router = require('express').Router();
const db = require('../db/knex');
const { wrap } = require('../lib/helpers');

// --- Accueil (hero Three.js) ---
router.get('/', wrap(async (req, res) => {
  const [membersCount] = await db('members').where({ status: 'active' }).count({ c: '*' });
  const [staffCount] = await db('members')
    .join('ranks', 'members.rank_id', 'ranks.id')
    .where('members.status', 'active').andWhere('ranks.is_staff', true)
    .count({ c: '*' });

  res.render('public/home', {
    title: `${res.locals.site.name} — ${res.locals.site.tagline}`,
    bodyClass: 'page-home',
    stats: {
      members: Number(membersCount.c) || 0,
      staff: Number(staffCount.c) || 0,
    },
  });
}));

// --- Notre histoire ---
router.get('/histoire', (req, res) => {
  res.render('public/histoire', { title: 'Notre histoire' });
});

// --- Le code ---
router.get('/le-code', (req, res) => {
  res.render('public/code', { title: 'Le code' });
});

// --- La famille ---
router.get('/famille', wrap(async (req, res) => {
  const members = await db('members')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('members.status', 'active')
    .andWhere('members.public_listed', true)
    .orderBy([{ column: 'ranks.level', order: 'desc' }, { column: 'members.rp_name', order: 'asc' }])
    .select('members.id', 'members.rp_name', 'members.bio', 'members.origin',
            'ranks.name as rank_name', 'ranks.color as rank_color');

  res.render('public/famille', { title: 'La famille', members, total: members.length });
}));

// --- Anciennes adresses, conservees pour les liens deja partages ---
router.get('/serveur', (req, res) => res.redirect(301, '/histoire'));
router.get('/reglement', (req, res) => res.redirect(301, '/le-code'));
router.get('/effectifs', (req, res) => res.redirect(301, '/famille'));

// --- Rejoindre ---
router.get('/rejoindre', (req, res) => {
  res.render('public/rejoindre', { title: 'Nous rejoindre' });
});

module.exports = router;
