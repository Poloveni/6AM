'use strict';
const db = require('../db/knex');
const { roleAtLeast, wrap } = require('../lib/helpers');

/** Charge l'utilisateur de session sur req.user / res.locals.user. */
const loadUser = wrap(async (req, res, next) => {
  res.locals.user = null;
  if (!req.session || !req.session.userId) return next();

  const user = await db('users')
    .leftJoin('members', 'users.member_id', 'members.id')
    .leftJoin('ranks', 'members.rank_id', 'ranks.id')
    .where('users.id', req.session.userId)
    .first(
      'users.id', 'users.username', 'users.email', 'users.role',
      'users.member_id', 'users.is_active',
      'members.rp_name as rp_name', 'members.status as member_status',
      'ranks.name as rank_name', 'ranks.color as rank_color'
    );

  if (!user || !user.is_active) {
    req.session.destroy(() => {});
    return next();
  }
  req.user = user;
  res.locals.user = user;
  next();
});

/** Exige une session valide. */
function requireAuth(req, res, next) {
  if (req.user) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect('/connexion');
}

/** Exige un role minimum : requireRole('staff'). */
function requireRole(min) {
  return (req, res, next) => {
    if (!req.user) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/connexion');
    }
    if (!roleAtLeast(req.user.role, min)) {
      return res.status(403).render('errors/403', { title: 'Acces refuse' });
    }
    next();
  };
}

module.exports = { loadUser, requireAuth, requireRole };
