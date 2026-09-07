'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/knex');
const { wrap, toDateOnly } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const sinceDay = toDateOnly(since);

  const [active] = await db('members').where({ status: 'active' }).count({ c: '*' });
  const [onLeave] = await db('members').where({ status: 'leave' }).count({ c: '*' });

  const rows = await db('activities').where('occurred_on', '>=', sinceDay)
    .select('minutes', 'actions', 'amount', 'member_id');

  const totals = rows.reduce((acc, r) => {
    acc.minutes += Number(r.minutes) || 0;
    acc.actions += Number(r.actions) || 0;
    acc.amount += Number(r.amount) || 0;
    return acc;
  }, { minutes: 0, actions: 0, amount: 0 });

  const mine = req.user.member_id
    ? rows.filter((r) => r.member_id === req.user.member_id).reduce((acc, r) => {
        acc.minutes += Number(r.minutes) || 0;
        acc.actions += Number(r.actions) || 0;
        acc.amount += Number(r.amount) || 0;
        return acc;
      }, { minutes: 0, actions: 0, amount: 0 })
    : null;

  // Repartition des effectifs par grade — remplit le bas de page avec du concret
  const repartition = await db('members')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('members.status', 'active')
    .groupBy('ranks.name', 'ranks.color', 'ranks.level')
    .orderBy('ranks.level', 'desc')
    .select('ranks.name', 'ranks.color')
    .count({ c: 'members.id' });

  // Classement des membres les plus actifs sur la periode
  const parMembre = new Map();
  for (const r of rows) {
    if (!r.member_id) continue;
    if (!parMembre.has(r.member_id)) parMembre.set(r.member_id, { minutes: 0, actions: 0, amount: 0 });
    const m = parMembre.get(r.member_id);
    m.minutes += Number(r.minutes) || 0;
    m.actions += Number(r.actions) || 0;
    m.amount += Number(r.amount) || 0;
  }
  const fiches = parMembre.size
    ? await db('members').whereIn('id', [...parMembre.keys()]).select('id', 'rp_name')
    : [];
  const nomsParId = Object.fromEntries(fiches.map((f) => [f.id, f.rp_name]));
  const top = [...parMembre.entries()]
    .map(([id, v]) => ({ id, nom: nomsParId[id] || 'Fiche supprimée', ...v }))
    .sort((a, b) => b.minutes - a.minutes || b.amount - a.amount)
    .slice(0, 5);

  const events = await db('member_events')
    .leftJoin('members', 'member_events.member_id', 'members.id')
    .orderBy('member_events.created_at', 'desc')
    .limit(8)
    .select('member_events.*', 'members.rp_name');

  res.render('app/dashboard', {
    title: 'Tableau de bord',
    bodyClass: 'page-app',
    kpi: { active: Number(active.c) || 0, onLeave: Number(onLeave.c) || 0, ...totals },
    mine,
    events,
    repartition: repartition.map((r) => ({
      nom: r.name || 'Sans grade',
      couleur: r.color || '#5b6b7d',
      total: Number(r.c) || 0,
    })),
    top,
  });
}));

router.get('/mon-compte', wrap(async (req, res) => {
  res.render('app/compte', { title: 'Mon compte', bodyClass: 'page-app', error: null, success: null });
}));

router.post('/mon-compte', wrap(async (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  const confirm = String(req.body.confirm_password || '');

  const render = (error, success) => res.render('app/compte', {
    title: 'Mon compte', bodyClass: 'page-app', error, success,
  });

  if (next.length < 10) return render('Le nouveau mot de passe doit faire au moins 10 caracteres.', null);
  if (next !== confirm) return render('La confirmation ne correspond pas.', null);

  const row = await db('users').where({ id: req.user.id }).first('password_hash');
  if (!row || !(await bcrypt.compare(current, row.password_hash))) {
    return render('Mot de passe actuel incorrect.', null);
  }

  await db('users').where({ id: req.user.id }).update({
    password_hash: await bcrypt.hash(next, 12),
    updated_at: new Date(),
  });
  return render(null, 'Mot de passe mis a jour.');
}));

module.exports = router;
