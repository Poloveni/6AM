'use strict';

/**
 * Deux champs publics sur les fiches d'effectif :
 *  - bio    : presentation affichee sur la page publique de la famille
 *  - origin : ville ou pays d'origine du personnage
 *
 * Le champ "notes" existant reste ce qu'il est : une note interne,
 * jamais publiee.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('members', (t) => {
    t.text('bio').nullable();
    t.string('origin', 60).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('members', (t) => {
    t.dropColumn('bio');
    t.dropColumn('origin');
  });
};
