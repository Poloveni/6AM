'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db/knex');
const config = require('../config');
const { wrap } = require('../lib/helpers');
const oauth = require('../lib/discord-oauth');

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de tentatives. Reessayez dans quelques minutes.',
});

const discordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Ouvre la session et redirige, apres regeneration du cookie. */
function ouvrirSession(req, res, userId, defaut = '/espace') {
  const returnTo = req.session.returnTo || defaut;
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve(res.redirect(returnTo))));
    });
  });
}

// ==========================================================================
//  Page de connexion — Discord uniquement
// ==========================================================================
router.get('/connexion', (req, res) => {
  if (req.user) return res.redirect('/espace');
  res.render('public/connexion', {
    title: 'Connexion',
    bodyClass: 'page-auth',
    discordActif: oauth.actif(),
    erreur: req.query.erreur || null,
  });
});

// ==========================================================================
//  Connexion par Discord
// ==========================================================================
router.get('/connexion/discord', discordLimiter, (req, res) => {
  if (req.user) return res.redirect('/espace');
  if (!oauth.actif()) return res.redirect('/connexion?erreur=indisponible');

  // Jeton anti-rejeu : il fait le lien entre le depart et le retour.
  const etat = oauth.nouvelEtat();
  req.session.discordEtat = etat;
  req.session.save(() => res.redirect(oauth.urlAutorisation(etat)));
});

router.get('/connexion/discord/retour', discordLimiter, wrap(async (req, res) => {
  const attendu = req.session.discordEtat;
  delete req.session.discordEtat;

  const echec = (code) => res.redirect(`/connexion?erreur=${code}`);

  if (!oauth.actif()) return echec('indisponible');
  // Refus de l'utilisateur sur l'ecran Discord, ou etat qui ne correspond pas.
  if (req.query.error) return echec('refus');
  if (!req.query.code || !req.query.state || req.query.state !== attendu) return echec('etat');

  let jeton = null;
  try {
    jeton = await oauth.echangerCode(String(req.query.code));
    const [profil, membre] = await Promise.all([
      oauth.profil(jeton),
      oauth.membreDuServeur(jeton),
    ]);

    if (!membre) return echec('serveur');
    if (!profil || !profil.id) return echec('profil');

    const userId = await raccorderCompte(profil, membre);
    if (!userId) return echec('desactive');

    await db('users').where({ id: userId }).update({ last_login_at: new Date() });
    return await ouvrirSession(req, res, userId);
  } catch (err) {
    console.warn('[discord] connexion impossible :', err.message);
    return echec('technique');
  } finally {
    if (jeton) oauth.revoquer(jeton);
  }
}));

/**
 * Retrouve ou cree le compte du site correspondant a ce Discord.
 * Renvoie l'identifiant du compte, ou null s'il est desactive.
 *
 * Ordre de recherche :
 *   1. un compte deja relie a cet identifiant Discord ;
 *   2. une fiche effectif portant cet identifiant Discord, dont on relie
 *      le compte existant ou pour laquelle on cree le compte ;
 *   3. sinon, creation d'un compte simple au role "membre".
 */
async function raccorderCompte(profil, membre) {
  const discordId = String(profil.id);
  const pseudo = String(profil.global_name || profil.username || 'membre').slice(0, 80);
  const avatar = profil.avatar ? String(profil.avatar).slice(0, 120) : null;
  const maintenant = new Date();

  const existant = await db('users').where({ discord_id: discordId }).first();
  if (existant) {
    if (!existant.is_active) return null;
    await db('users').where({ id: existant.id }).update({
      discord_username: pseudo, discord_avatar: avatar, updated_at: maintenant,
    });
    return existant.id;
  }

  // Fiche effectif deja renseignee avec cet identifiant Discord ?
  const fiche = await db('members').where({ discord_id: discordId }).first();

  if (fiche) {
    const compteFiche = await db('users').where({ member_id: fiche.id }).first();
    if (compteFiche) {
      if (!compteFiche.is_active) return null;
      await db('users').where({ id: compteFiche.id }).update({
        discord_id: discordId, discord_username: pseudo, discord_avatar: avatar,
        discord_linked_at: maintenant, updated_at: maintenant,
      });
      return compteFiche.id;
    }
  }

  const identifiant = await identifiantLibre(membre && membre.nick ? membre.nick : pseudo);

  // db.insertId gere la difference entre RETURNING (pg) et insertId (MariaDB).
  return db.insertId('users', {
    username: identifiant,
    email: null,
    password_hash: null,
    role: 'member',
    member_id: fiche ? fiche.id : null,
    is_active: true,
    discord_id: discordId,
    discord_username: pseudo,
    discord_avatar: avatar,
    discord_linked_at: maintenant,
  });
}

/** Un nom d'utilisateur unique, derive du pseudo Discord. */
async function identifiantLibre(base) {
  const propre = String(base)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 50) || 'membre';

  for (let i = 0; i < 40; i++) {
    const essai = i === 0 ? propre : `${propre}-${i}`;
    const pris = await db('users').where({ username: essai }).first();
    if (!pris) return essai;
  }
  return `membre-${Date.now().toString(36)}`;
}

// ==========================================================================
//  Connexion de secours par mot de passe
//  Volontairement absente de la page de connexion : elle sert quand Discord
//  est indisponible ou que l'application OAuth est mal configuree.
// ==========================================================================
router.get('/connexion/secours', (req, res) => {
  if (req.user) return res.redirect('/espace');
  res.render('public/connexion-secours', {
    title: 'Connexion de secours', bodyClass: 'page-auth', error: null, identifier: '',
  });
});

router.post('/connexion', loginLimiter, wrap(async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const fail = () => res.status(401).render('public/connexion-secours', {
    title: 'Connexion de secours',
    bodyClass: 'page-auth',
    error: 'Identifiants incorrects.',
    identifier: req.body.identifier || '',
  });

  if (!identifier || !password) return fail();

  const user = await db('users')
    .where(db.raw('LOWER(email) = ?', [identifier]))
    .orWhere(db.raw('LOWER(username) = ?', [identifier]))
    .first();

  // password_hash est vide pour les comptes ouverts par Discord : ils ne
  // peuvent pas passer par ce formulaire.
  if (!user || !user.is_active || !user.password_hash) return fail();
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return fail();

  await db('users').where({ id: user.id }).update({ last_login_at: new Date() });
  try {
    return await ouvrirSession(req, res, user.id);
  } catch (err) {
    return fail();
  }
}));

router.post('/deconnexion', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(config.session.name);
    res.redirect('/');
  });
});

module.exports = router;
