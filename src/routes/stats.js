'use strict';
const router = require('express').Router();
const db = require('../db/knex');
const { wrap, toDateOnly } = require('../lib/helpers');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const RANGES = { 7: '7 jours', 30: '30 jours', 90: '90 jours' };

router.get('/', wrap(async (req, res) => {
  const days = RANGES[req.query.periode] ? parseInt(req.query.periode, 10) : 30;
  const start = new Date(Date.now() - (days - 1) * 24 * 3600 * 1000);
  const startDay = toDateOnly(start);

  // On agrege cote applicatif : aucune fonction de date specifique
  // a Postgres ou MySQL, donc strictement portable.
  const rows = await db('activities')
    .leftJoin('members', 'activities.member_id', 'members.id')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('activities.occurred_on', '>=', startDay)
    .select(
      'activities.occurred_on', 'activities.minutes', 'activities.actions', 'activities.amount',
      'activities.member_id', 'members.rp_name', 'ranks.name as rank_name', 'ranks.color as rank_color'
    );

  // --- Serie journaliere ---
  const byDay = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = toDateOnly(new Date(start.getTime() + i * 24 * 3600 * 1000));
    byDay.set(d, { day: d, minutes: 0, actions: 0, amount: 0 });
  }
  for (const r of rows) {
    const key = toDateOnly(r.occurred_on);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.minutes += Number(r.minutes) || 0;
    bucket.actions += Number(r.actions) || 0;
    bucket.amount += Number(r.amount) || 0;
  }
  const series = [...byDay.values()];

  // --- Classement des membres ---
  const byMember = new Map();
  for (const r of rows) {
    if (!r.member_id) continue;
    if (!byMember.has(r.member_id)) {
      byMember.set(r.member_id, {
        id: r.member_id, name: r.rp_name || 'Inconnu',
        rank: r.rank_name, color: r.rank_color || '#4a6a8f',
        minutes: 0, actions: 0, amount: 0,
      });
    }
    const m = byMember.get(r.member_id);
    m.minutes += Number(r.minutes) || 0;
    m.actions += Number(r.actions) || 0;
    m.amount += Number(r.amount) || 0;
  }
  const ranking = [...byMember.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 15);

  // --- Repartition par grade ---
  const rankRows = await db('members')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('members.status', 'active')
    .select('ranks.name', 'ranks.color', 'ranks.level')
    .count({ c: 'members.id' })
    .groupBy('ranks.name', 'ranks.color', 'ranks.level')
    .orderBy('ranks.level', 'desc');
  const distribution = rankRows.map((r) => ({
    name: r.name || 'Sans grade',
    color: r.color || '#5b6b7d',
    count: Number(r.c) || 0,
  }));

  const totals = series.reduce((a, d) => ({
    minutes: a.minutes + d.minutes,
    actions: a.actions + d.actions,
    amount: a.amount + d.amount,
  }), { minutes: 0, actions: 0, amount: 0 });

  res.render('app/stats', {
    title: 'Statistiques',
    bodyClass: 'page-app',
    days, ranges: RANGES, series, ranking, distribution, totals,
    activeMembers: byMember.size,
  });
}));

module.exports = router;
