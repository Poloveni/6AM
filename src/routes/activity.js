'use strict';
const router = require('express').Router();
const db = require('../db/knex');
const { wrap, toDateOnly, roleAtLeast } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const isStaff = roleAtLeast(req.user.role, 'staff');
  const filterMember = isStaff && req.query.membre ? parseInt(req.query.membre, 10) : null;

  let query = db('activities')
    .leftJoin('members', 'activities.member_id', 'members.id')
    .orderBy('activities.occurred_on', 'desc')
    .orderBy('activities.id', 'desc')
    .limit(200)
    .select('activities.*', 'members.rp_name');

  if (!isStaff) {
    query = query.where('activities.member_id', req.user.member_id || -1);
  } else if (filterMember) {
    query = query.where('activities.member_id', filterMember);
  }

  const entries = await query;
  const members = isStaff
    ? await db('members').where({ status: 'active' }).orderBy('rp_name').select('id', 'rp_name')
    : [];

  res.render('app/activite', {
    title: 'Activite',
    bodyClass: 'page-app',
    entries, members, isStaff, filterMember,
    today: toDateOnly(new Date()),
  });
}));

router.post('/', wrap(async (req, res) => {
  const isStaff = roleAtLeast(req.user.role, 'staff');
  let memberId = req.user.member_id;
  if (isStaff && req.body.member_id) memberId = parseInt(req.body.member_id, 10);

  if (!memberId) {
    req.flash('error', 'Aucune fiche effectif liee a votre compte.');
    return res.redirect('/espace/activite');
  }

  const hours = Math.max(0, parseFloat(String(req.body.hours || '0').replace(',', '.')) || 0);
  await db('activities').insert({
    member_id: memberId,
    occurred_on: toDateOnly(req.body.occurred_on) || toDateOnly(new Date()),
    minutes: Math.round(hours * 60),
    actions: Math.max(0, parseInt(req.body.actions, 10) || 0),
    amount: Math.max(0, parseInt(req.body.amount, 10) || 0),
    note: String(req.body.note || '').slice(0, 1000) || null,
    created_by: req.user.id,
  });

  req.flash('success', 'Activite enregistree.');
  res.redirect('/espace/activite');
}));

router.post('/:id/supprimer', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const entry = await db('activities').where({ id }).first();
  if (!entry) return res.redirect('/espace/activite');

  const isStaff = roleAtLeast(req.user.role, 'staff');
  if (!isStaff && entry.member_id !== req.user.member_id) {
    return res.status(403).render('errors/403', { title: 'Acces refuse' });
  }

  await db('activities').where({ id }).del();
  req.flash('success', 'Entree supprimee.');
  res.redirect('/espace/activite');
}));

module.exports = router;
