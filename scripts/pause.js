#!/usr/bin/env node
'use strict';
/**
 * Ouvre ou ferme le site sans passer par l'interface.
 *
 *   docker compose exec web node scripts/pause.js on      # met le site en pause
 *   docker compose exec web node scripts/pause.js off     # rouvre le site
 *   docker compose exec web node scripts/pause.js etat    # affiche l'etat courant
 *   docker compose exec web node scripts/pause.js on "Retour a 20h."
 *
 * C'est la porte de sortie : la page de pause bloque tout le site, espace
 * membres compris, donc on ne peut pas rouvrir depuis le navigateur.
 */
const db = require('../src/db/knex');
const settings = require('../src/lib/settings');
const config = require('../src/config');

const ACTIONS = { on: 'on', off: 'off', etat: null, statut: null, status: null };

async function main() {
  const action = String(process.argv[2] || '').toLowerCase();
  const message = process.argv[3];

  if (!(action in ACTIONS)) {
    console.error('Usage : node scripts/pause.js on|off|etat ["message facultatif"]');
    process.exitCode = 1;
    return;
  }

  const reglages = await settings.all(true);
  const forcage = String(config.maintenance || '').trim().toLowerCase();

  if (action === 'etat' || action === 'statut' || action === 'status') {
    console.log('reglage en base :', reglages.maintenance === 'on' ? 'EN PAUSE' : 'ouvert');
    if (forcage) {
      console.log('variable MAINTENANCE :', forcage, '(elle a la priorite sur la base)');
    }
    if (reglages.maintenance_message) {
      console.log('message affiche  :', reglages.maintenance_message);
    }
    return;
  }

  await settings.set('maintenance', ACTIONS[action]);
  if (message !== undefined) {
    await settings.set('maintenance_message', String(message).slice(0, 400));
  }
  settings.invalidate();

  console.log(action === 'on' ? 'Site mis en pause.' : 'Site rouvert.');
  if (forcage) {
    console.log(
      `Attention : MAINTENANCE=${forcage} est defini dans le .env et l'emporte sur ce reglage. ` +
      'Videz cette variable puis relancez le conteneur pour que la base decide.'
    );
  }
}

main()
  .catch((err) => { console.error('Echec :', err.message); process.exitCode = 1; })
  .finally(() => db.destroy());
