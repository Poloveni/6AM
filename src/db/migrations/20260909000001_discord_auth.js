'use strict';

/**
 * Connexion par Discord.
 *
 * Un compte cree via Discord n'a ni mot de passe ni adresse email : les deux
 * colonnes deviennent donc facultatives. Les comptes existants ne bougent pas.
 * Ecrit pour rester portable entre PostgreSQL et MariaDB.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('email', 190).nullable().alter();
    t.string('password_hash', 120).nullable().alter();
  });

  await knex.schema.alterTable('users', (t) => {
    t.string('discord_id', 40).nullable();
    t.string('discord_username', 80).nullable();
    t.string('discord_avatar', 120).nullable();
    t.timestamp('discord_linked_at').nullable();
  });

  // Index a part : un compte Discord ne peut ouvrir qu'un seul compte du site.
  // Les valeurs NULL restent autorisees en nombre, sur pg comme sur MySQL.
  await knex.schema.alterTable('users', (t) => {
    t.unique(['discord_id'], { indexName: 'users_discord_id_unique' });
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropUnique(['discord_id'], 'users_discord_id_unique');
  });
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('discord_id');
    t.dropColumn('discord_username');
    t.dropColumn('discord_avatar');
    t.dropColumn('discord_linked_at');
  });
  // On ne remet pas NOT NULL : des comptes Discord sans mot de passe peuvent
  // exister, la contrainte echouerait.
};
