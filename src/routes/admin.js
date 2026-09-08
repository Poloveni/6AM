'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/knex');
const { wrap } = require('../lib/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');
const settings = require('../lib/settings');

router.use(requireAuth, requireRole('admin'));

const ROLE_VALUES = ['member', 'staff', 'admin'];

// ---------- Comptes ----------
router.get('/', wrap(async (req, res) => {
  const users = await db('users')
    .leftJoin('members', 'users.member_id', 'members.id')
    .orderBy('users.username')
    .select('users.id', 'users.username', 'users.email', 'users.role', 'users.is_active',
            'users.last_login_at', 'members.rp_name');
  const members = await db('members').orderBy('rp_name').select('id', 'rp_name');
  res.render('admin/comptes', { title: 'Comptes', bodyClass: 'page-app', users, members, error: null });
}));

router.post('/comptes', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = ROLE_VALUES.includes(req.body.role) ? req.body.role : 'member';
  const memberId = parseInt(req.body.member_id, 10) || null;

  if (!username || !email || password.length < 10) {
    req.flash('error', 'Nom, email et mot de passe (10 caracteres minimum) sont obligatoires.');
    return res.redirect('/espace/administration');
  }
  const exists = await db('users').where({ email }).orWhere({ username }).first();
  if (exists) {
    req.flash('error', 'Ce nom ou cet email est deja utilise.');
    return res.redirect('/espace/administration');
  }

  await db('users').insert({
    username, email, role, member_id: memberId,
    password_hash: await bcrypt.hash(password, 12),
    is_active: true,
  });
  req.flash('success', `Compte ${username} cree.`);
  res.redirect('/espace/administration');
}));

router.post('/comptes/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = await db('users').where({ id }).first();
  if (!target) return res.redirect('/espace/administration');

  const patch = { updated_at: new Date() };
  if (ROLE_VALUES.includes(req.body.role)) patch.role = req.body.role;
  if (req.body.member_id !== undefined) patch.member_id = parseInt(req.body.member_id, 10) || null;
  if (req.body.is_active !== undefined) patch.is_active = req.body.is_active === 'on';
  if (req.body.password) {
    if (String(req.body.password).length < 10) {
      req.flash('error', 'Mot de passe trop court.');
      return res.redirect('/espace/administration');
    }
    patch.password_hash = await bcrypt.hash(String(req.body.password), 12);
  }

  // Un admin ne peut pas se retirer ses propres droits ni se desactiver.
  if (target.id === req.user.id) { delete patch.role; delete patch.is_active; }

  await db('users').where({ id }).update(patch);
  req.flash('success', 'Compte mis a jour.');
  res.redirect('/espace/administration');
}));

// ---------- Grades ----------
router.get('/grades', wrap(async (req, res) => {
  const ranks = await db('ranks').orderBy('level', 'desc');
  res.render('admin/grades', { title: 'Grades', bodyClass: 'page-app', ranks });
}));

router.post('/grades', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.redirect('/espace/administration/grades');
  const exists = await db('ranks').where({ name }).first();
  if (exists) {
    req.flash('error', 'Ce grade existe deja.');
    return res.redirect('/espace/administration/grades');
  }
  await db('ranks').insert({
    name,
    level: parseInt(req.body.level, 10) || 0,
    color: /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : '#4a6a8f',
    is_staff: req.body.is_staff === 'on',
    description: String(req.body.description || '').slice(0, 300) || null,
  });
  req.flash('success', 'Grade cree.');
  res.redirect('/espace/administration/grades');
}));

router.post('/grades/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.body._action === 'delete') {
    await db('members').where({ rank_id: id }).update({ rank_id: null });
    await db('ranks').where({ id }).del();
    req.flash('success', 'Grade supprime.');
    return res.redirect('/espace/administration/grades');
  }
  const current = await db('ranks').where({ id }).first();
  if (!current) return res.redirect('/espace/administration/grades');
  await db('ranks').where({ id }).update({
    name: String(req.body.name || '').trim() || current.name,
    level: parseInt(req.body.level, 10) || 0,
    color: /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : '#4a6a8f',
    is_staff: req.body.is_staff === 'on',
    description: String(req.body.description || '').slice(0, 300) || null,
    updated_at: new Date(),
  });
  req.flash('success', 'Grade mis a jour.');
  res.redirect('/espace/administration/grades');
}));

// ---------- Contenu du site ----------
router.get('/contenu', wrap(async (req, res) => {
  res.render('admin/contenu', {
    title: 'Contenu du site',
    bodyClass: 'page-app',
    values: await settings.all(true),
  });
}));

router.post('/contenu', wrap(async (req, res) => {
  const keys = ['home_headline', 'home_subline', 'about_text', 'rules_text', 'maintenance_message'];
  for (const key of keys) {
    if (req.body[key] !== undefined) {
      await settings.set(key, String(req.body[key]).slice(0, 8000));
    }
  }
  // Case a cocher : absente du corps de requete quand elle n'est pas cochee.
  await settings.set('maintenance', req.body.maintenance === 'on' ? 'on' : 'off');

  req.flash('success', 'Contenu enregistre.');
  res.redirect('/espace/administration/contenu');
}));

module.exports = router;
