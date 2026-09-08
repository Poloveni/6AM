'use strict';
const config = require('../config');
const settings = require('../lib/settings');

// Chemins toujours joignables, meme site en pause : la page de pause a besoin
// de ses fichiers statiques, et la sonde de sante ne doit jamais mentir.
const OUVERTS = [/^\/static\//, /^\/healthz$/, /^\/favicon\.ico$/];

// Priorite : la variable d'environnement l'emporte sur le reglage en base.
//   MAINTENANCE=on   -> pause forcee
//   MAINTENANCE=off  -> site force ouvert (porte de sortie si la base repond mal)
//   absente ou vide  -> c'est le reglage "maintenance" en base qui decide
function forcage() {
  const v = String(config.maintenance || '').trim().toLowerCase();
  if (['on', '1', 'true', 'oui'].includes(v)) return true;
  if (['off', '0', 'false', 'non'].includes(v)) return false;
  return null;
}

async function enPause() {
  const force = forcage();
  if (force !== null) return force;
  try {
    const reglages = await settings.all();
    return String(reglages.maintenance || '').toLowerCase() === 'on';
  } catch (err) {
    // Base injoignable : on ne met pas le site en pause pour autant, l'erreur
    // 500 habituelle est plus honnete qu'une fausse maintenance.
    console.warn('[pause] reglage illisible :', err.message);
    return false;
  }
}

module.exports = async function pause(req, res, next) {
  if (OUVERTS.some((r) => r.test(req.path))) return next();
  if (!(await enPause())) return next();

  const message = (res.locals.settings && res.locals.settings.maintenance_message) || '';
  res.status(503);
  res.set('Retry-After', '3600');
  res.set('Cache-Control', 'no-store');
  return res.render('public/pause', {
    title: 'Site temporairement indisponible',
    bodyClass: 'page-pause',
    plein: true,
    message,
  });
};

module.exports.enPause = enPause;
