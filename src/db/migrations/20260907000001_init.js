'use strict';

/**
 * Schema initial 6AM.
 * Ecrit en types Knex portables : fonctionne a l'identique sur
 * PostgreSQL et MariaDB/MySQL (aucun type specifique a un moteur).
 */
exports.up = async function up(knex) {
  // --- Grades / rangs -------------------------------------------------
  await knex.schema.createTable('ranks', (t) => {
    t.increments('id').primary();
    t.string('name', 80).notNullable().unique();
    t.integer('level').notNullable().defaultTo(0);      // 0 = plus bas
    t.string('color', 9).notNullable().defaultTo('#4a6a8f');
    t.boolean('is_staff').notNullable().defaultTo(false);
    t.text('description').nullable();
    t.timestamps(true, true);
    t.index(['level'], 'ranks_level_idx');
  });

  // --- Effectifs ------------------------------------------------------
  await knex.schema.createTable('members', (t) => {
    t.increments('id').primary();
    t.string('rp_name', 120).notNullable();
    t.string('discord_id', 40).nullable();
    t.string('discord_tag', 60).nullable();
    t.string('phone', 30).nullable();
    t.integer('rank_id').unsigned().nullable().references('id').inTable('ranks').onDelete('SET NULL');
    t.string('status', 20).notNullable().defaultTo('active'); // active | leave | fired | resigned
    t.date('hired_at').nullable();
    t.date('left_at').nullable();
    t.text('notes').nullable();
    t.boolean('public_listed').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['status'], 'members_status_idx');
    t.index(['rank_id'], 'members_rank_idx');
  });

  // --- Comptes utilisateurs ------------------------------------------
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('username', 60).notNullable().unique();
    t.string('email', 190).notNullable().unique();
    t.string('password_hash', 120).notNullable();
    t.string('role', 20).notNullable().defaultTo('member');  // member | staff | admin
    t.integer('member_id').unsigned().nullable().references('id').inTable('members').onDelete('SET NULL');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('last_login_at').nullable();
    t.timestamps(true, true);
  });

  // --- Historique RH (embauche, promotion, sanction, depart) ----------
  await knex.schema.createTable('member_events', (t) => {
    t.increments('id').primary();
    t.integer('member_id').unsigned().notNullable().references('id').inTable('members').onDelete('CASCADE');
    t.string('type', 30).notNullable();   // hired | promoted | demoted | warned | leave | returned | fired | resigned | note
    t.integer('from_rank_id').unsigned().nullable();
    t.integer('to_rank_id').unsigned().nullable();
    t.text('reason').nullable();
    t.integer('actor_user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['member_id'], 'member_events_member_idx');
    t.index(['created_at'], 'member_events_created_idx');
  });

  // --- Activite (services, actions, chiffre) --------------------------
  await knex.schema.createTable('activities', (t) => {
    t.increments('id').primary();
    t.integer('member_id').unsigned().notNullable().references('id').inTable('members').onDelete('CASCADE');
    t.date('occurred_on').notNullable();
    t.integer('minutes').notNullable().defaultTo(0);   // temps de service
    t.integer('actions').notNullable().defaultTo(0);   // nb d'actions / interventions
    t.integer('amount').notNullable().defaultTo(0);    // chiffre genere ($)
    t.text('note').nullable();
    t.integer('created_by').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['member_id', 'occurred_on'], 'activities_member_date_idx');
    t.index(['occurred_on'], 'activities_date_idx');
  });

  // --- Reglages editables depuis l'admin ------------------------------
  await knex.schema.createTable('settings', (t) => {
    t.string('key', 100).primary();
    t.text('value').nullable();
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('settings');
  await knex.schema.dropTableIfExists('activities');
  await knex.schema.dropTableIfExists('member_events');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('members');
  await knex.schema.dropTableIfExists('ranks');
};
