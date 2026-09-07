'use strict';
const router = require('express').Router();
const db = require('../db/knex');
const { wrap, toDateOnly, EVENT_LABELS } = require('../lib/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');
const discord = require('../lib/discord');

router.use(requireAuth);

const STATUSES = ['active', 'leave', 'fired', 'resigned'];

async function logEvent(memberId, type, { fromRank = null, toRank = null, reason = null, actor = null } = {}) {
  await db('member_events').insert({
    member_id: memberId,
    type,
    from_rank_id: fromRank,
    to_rank_id: toRank,
    reason: reason || null,
    actor_user_id: actor || null,
    created_at: new Date(),
  });
}

// --- Liste ---
router.get('/', wrap(async (req, res) => {
  const status = STATUSES.includes(req.query.statut) ? req.query.statut : 'active';
  const search = String(req.query.q || '').trim();

  let query = db('members')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('members.status', status)
    .orderBy([{ column: 'ranks.level', order: 'desc' }, { column: 'members.rp_name', order: 'asc' }])
    .select('members.*', 'ranks.name as rank_name', 'ranks.color as rank_color');

  if (search) {
    const like = `%${search.toLowerCase()}%`;
    query = query.where((qb) => {
      qb.whereRaw('LOWER(members.rp_name) LIKE ?', [like])
        .orWhereRaw('LOWER(COALESCE(members.discord_tag, \'\')) LIKE ?', [like]);
    });
  }

  const members = await query;
  const counts = await db('members').select('status').count({ c: '*' }).groupBy('status');

  res.render('app/effectifs/index', {
    title: 'Effectifs',
    bodyClass: 'page-app',
    members, status, search,
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.c)])),
  });
}));

// --- Formulaire de creation ---
router.get('/nouveau', requireRole('staff'), wrap(async (req, res) => {
  const ranks = await db('ranks').orderBy('level', 'desc');
  res.render('app/effectifs/form', {
    title: 'Nouvelle recrue',
    bodyClass: 'page-app',
    ranks,
    member: { status: 'active', public_listed: true, hired_at: toDateOnly(new Date()) },
    isNew: true,
    error: null,
  });
}));

router.post('/nouveau', requireRole('staff'), wrap(async (req, res) => {
  const rpName = String(req.body.rp_name || '').trim();
  if (!rpName) {
    const ranks = await db('ranks').orderBy('level', 'desc');
    return res.status(400).render('app/effectifs/form', {
      title: 'Nouvelle recrue', bodyClass: 'page-app', ranks,
      member: req.body, isNew: true, error: 'Le nom RP est obligatoire.',
    });
  }

  const rankId = parseInt(req.body.rank_id, 10) || null;
  await db('members').insert({
    rp_name: rpName,
    discord_id: String(req.body.discord_id || '').trim() || null,
    discord_tag: String(req.body.discord_tag || '').trim() || null,
    phone: String(req.body.phone || '').trim() || null,
    rank_id: rankId,
    status: 'active',
    hired_at: toDateOnly(req.body.hired_at) || toDateOnly(new Date()),
    notes: String(req.body.notes || '').slice(0, 2000) || null,
    public_listed: req.body.public_listed === 'on',
  });

  const member = await db('members').where({ rp_name: rpName }).orderBy('id', 'desc').first();
  await logEvent(member.id, 'hired', { toRank: rankId, actor: req.user.id, reason: 'Embauche' });

  const rank = rankId ? await db('ranks').where({ id: rankId }).first() : null;
  discord.notify({
    title: 'Nouvelle recrue',
    description: `**${rpName}** rejoint les effectifs.`,
    color: 0x3fa77a,
    fields: [{ name: 'Grade', value: rank ? rank.name : 'Non defini', inline: true }],
  });

  req.flash('success', `${rpName} a ete ajoute aux effectifs.`);
  res.redirect(`/espace/effectifs/${member.id}`);
}));

// --- Fiche ---
router.get('/:id', wrap(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return next();

  const member = await db('members')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('members.id', id)
    .first('members.*', 'ranks.name as rank_name', 'ranks.color as rank_color', 'ranks.level as rank_level');
  if (!member) return next();

  const events = await db('member_events')
    .leftJoin('users', 'member_events.actor_user_id', 'users.id')
    .where('member_events.member_id', id)
    .orderBy('member_events.created_at', 'desc')
    .select('member_events.*', 'users.username as actor_name');

  const ranksById = Object.fromEntries((await db('ranks').select('id', 'name')).map((r) => [r.id, r.name]));

  const since = toDateOnly(new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const acts = await db('activities').where({ member_id: id }).andWhere('occurred_on', '>=', since)
    .select('minutes', 'actions', 'amount');
  const totals = acts.reduce((a, r) => ({
    minutes: a.minutes + (Number(r.minutes) || 0),
    actions: a.actions + (Number(r.actions) || 0),
    amount: a.amount + (Number(r.amount) || 0),
  }), { minutes: 0, actions: 0, amount: 0 });

  const ranks = await db('ranks').orderBy('level', 'desc');

  res.render('app/effectifs/show', {
    title: member.rp_name,
    bodyClass: 'page-app',
    member, events, ranksById, totals, ranks, EVENT_LABELS,
  });
}));

// --- Edition ---
router.get('/:id/modifier', requireRole('staff'), wrap(async (req, res, next) => {
  const member = await db('members').where({ id: parseInt(req.params.id, 10) }).first();
  if (!member) return next();
  const ranks = await db('ranks').orderBy('level', 'desc');
  member.hired_at = toDateOnly(member.hired_at);
  res.render('app/effectifs/form', {
    title: `Modifier ${member.rp_name}`, bodyClass: 'page-app',
    ranks, member, isNew: false, error: null,
  });
}));

router.post('/:id/modifier', requireRole('staff'), wrap(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const member = await db('members').where({ id }).first();
  if (!member) return next();

  await db('members').where({ id }).update({
    rp_name: String(req.body.rp_name || member.rp_name).trim(),
    discord_id: String(req.body.discord_id || '').trim() || null,
    discord_tag: String(req.body.discord_tag || '').trim() || null,
    phone: String(req.body.phone || '').trim() || null,
    hired_at: toDateOnly(req.body.hired_at),
    notes: String(req.body.notes || '').slice(0, 2000) || null,
    public_listed: req.body.public_listed === 'on',
    updated_at: new Date(),
  });

  req.flash('success', 'Fiche mise a jour.');
  res.redirect(`/espace/effectifs/${id}`);
}));

// --- Changement de grade ---
router.post('/:id/grade', requireRole('staff'), wrap(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const member = await db('members').where({ id }).first();
  if (!member) return next();

  const newRankId = parseInt(req.body.rank_id, 10) || null;
  const oldRank = member.rank_id ? await db('ranks').where({ id: member.rank_id }).first() : null;
  const newRank = newRankId ? await db('ranks').where({ id: newRankId }).first() : null;

  await db('members').where({ id }).update({ rank_id: newRankId, updated_at: new Date() });

  const promoted = (newRank?.level || 0) >= (oldRank?.level || 0);
  await logEvent(id, promoted ? 'promoted' : 'demoted', {
    fromRank: member.rank_id, toRank: newRankId,
    reason: String(req.body.reason || '').slice(0, 500) || null,
    actor: req.user.id,
  });

  discord.notify({
    title: promoted ? 'Promotion' : 'Retrogradation',
    description: `**${member.rp_name}** : ${oldRank ? oldRank.name : 'sans grade'} → ${newRank ? newRank.name : 'sans grade'}`,
    color: promoted ? 0x3fa77a : 0xc9723f,
  });

  req.flash('success', 'Grade mis a jour.');
  res.redirect(`/espace/effectifs/${id}`);
}));

// --- Changement de statut (conge, licenciement, demission, retour) ---
router.post('/:id/statut', requireRole('staff'), wrap(async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const member = await db('members').where({ id }).first();
  if (!member) return next();

  const status = STATUSES.includes(req.body.status) ? req.body.status : null;
  if (!status) return res.redirect(`/espace/effectifs/${id}`);

  const leaving = ['fired', 'resigned'].includes(status);
  await db('members').where({ id }).update({
    status,
    left_at: leaving ? toDateOnly(new Date()) : null,
    updated_at: new Date(),
  });

  const typeMap = { active: 'returned', leave: 'leave', fired: 'fired', resigned: 'resigned' };
  await logEvent(id, typeMap[status], {
    reason: String(req.body.reason || '').slice(0, 500) || null,
    actor: req.user.id,
  });

  if (leaving) {
    discord.notify({
      title: status === 'fired' ? 'Licenciement' : 'Demission',
      description: `**${member.rp_name}** quitte les effectifs.`,
      color: 0xb64a4a,
      fields: req.body.reason ? [{ name: 'Motif', value: String(req.body.reason).slice(0, 500) }] : [],
    });
  }

  req.flash('success', 'Statut mis a jour.');
  res.redirect(`/espace/effectifs/${id}`);
}));

// --- Note interne ---
router.post('/:id/note', requireRole('staff'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const text = String(req.body.reason || '').trim();
  if (text) {
    await logEvent(id, req.body.type === 'warned' ? 'warned' : 'note', { reason: text.slice(0, 500), actor: req.user.id });
    req.flash('success', 'Note ajoutee a l\'historique.');
  }
  res.redirect(`/espace/effectifs/${id}`);
}));

// --- Suppression definitive (admin) ---
router.post('/:id/supprimer', requireRole('admin'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db('users').where({ member_id: id }).update({ member_id: null });
  await db('members').where({ id }).del();
  req.flash('success', 'Fiche supprimee.');
  res.redirect('/espace/effectifs');
}));

module.exports = router;
