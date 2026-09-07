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

// --- Presentation du serveur ---
router.get('/serveur', (req, res) => {
  res.render('public/serveur', { title: 'Le serveur' });
});

// --- Reglement ---
router.get('/reglement', (req, res) => {
  res.render('public/reglement', { title: 'Reglement' });
});

// --- Effectifs publics ---
router.get('/effectifs', wrap(async (req, res) => {
  const rows = await db('members')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('members.status', 'active')
    .andWhere('members.public_listed', true)
    .orderBy([{ column: 'ranks.level', order: 'desc' }, { column: 'members.rp_name', order: 'asc' }])
    .select('members.id', 'members.rp_name', 'ranks.name as rank_name', 'ranks.color as rank_color', 'ranks.level as rank_level');

  const groups = [];
  for (const row of rows) {
    const key = row.rank_name || 'Sans grade';
    let group = groups.find((g) => g.name === key);
    if (!group) { group = { name: key, color: row.rank_color || '#4a6a8f', members: [] }; groups.push(group); }
    group.members.push(row);
  }

  res.render('public/effectifs', { title: 'Effectifs', groups, total: rows.length });
}));

// --- Rejoindre ---
router.get('/rejoindre', (req, res) => {
  res.render('public/rejoindre', { title: 'Nous rejoindre' });
});

module.exports = router;
