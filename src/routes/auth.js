'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db/knex');
const { wrap } = require('../lib/helpers');

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de tentatives. Reessayez dans quelques minutes.',
});

router.get('/connexion', (req, res) => {
  if (req.user) return res.redirect('/espace');
  res.render('public/connexion', { title: 'Connexion', bodyClass: 'page-auth', error: null, identifier: '' });
});

router.post('/connexion', loginLimiter, wrap(async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const fail = () => res.status(401).render('public/connexion', {
    title: 'Connexion',
    bodyClass: 'page-auth',
    error: 'Identifiants incorrects.',
    identifier: req.body.identifier || '',
  });

  if (!identifier || !password) return fail();

  const user = await db('users')
    .where(db.raw('LOWER(email) = ?', [identifier]))
    .orWhere(db.raw('LOWER(username) = ?', [identifier]))
    .first();

  if (!user || !user.is_active) return fail();
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return fail();

  await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

  const returnTo = req.session.returnTo || '/espace';
  req.session.regenerate((err) => {
    if (err) return fail();
    req.session.userId = user.id;
    req.session.save(() => res.redirect(returnTo));
  });
}));

router.post('/deconnexion', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(require('../config').session.name);
    res.redirect('/');
  });
});

module.exports = router;
