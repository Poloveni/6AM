'use strict';
const crypto = require('crypto');

/**
 * CSRF minimal par jeton de session (double submit).
 * Expose res.locals.csrfToken pour les formulaires.
 */
function csrf(req, res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sent = req.body?._csrf || req.get('x-csrf-token');
  if (!sent || sent !== req.session.csrfToken) {
    return res.status(403).render('errors/403', {
      title: 'Session expiree',
      message: 'Jeton de securite invalide. Rechargez la page et reessayez.',
    });
  }
  next();
}

/** Messages flash simples stockes en session. */
function flash(req, res, next) {
  res.locals.flash = req.session?.flash || null;
  if (req.session) delete req.session.flash;
  req.flash = (type, message) => {
    if (req.session) req.session.flash = { type, message };
  };
  next();
}

module.exports = { csrf, flash };
