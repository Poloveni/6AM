'use strict';
const bcrypt = require('bcryptjs');
const config = require('../../config');

/**
 * Seed idempotent : peut etre relance sans casser les donnees existantes.
 */
exports.seed = async function seed(knex) {
  // --- Grades par defaut ---
  const ranks = [
    { name: 'Fondateur',    level: 100, color: '#c9d6e3', is_staff: true,  description: 'Direction du serveur' },
    { name: 'Administrateur', level: 80, color: '#8fb0d4', is_staff: true,  description: 'Administration' },
    { name: 'Moderateur',   level: 60,  color: '#4a6a8f', is_staff: true,  description: 'Moderation en jeu' },
    { name: 'Support',      level: 40,  color: '#3d5875', is_staff: true,  description: 'Aide aux joueurs' },
    { name: 'Membre',       level: 10,  color: '#5b6b7d', is_staff: false, description: 'Membre de la communaute' },
  ];
  for (const r of ranks) {
    const exists = await knex('ranks').where({ name: r.name }).first();
    if (!exists) await knex('ranks').insert(r);
  }

  // --- Reglages par defaut ---
  const settings = [
    { key: 'home_headline', value: 'Bienvenue sur 6AM' },
    { key: 'home_subline', value: 'Une ville qui ne dort jamais. Ecris ton histoire.' },
    { key: 'about_text', value: "6AM est un serveur GTA RP pense pour le roleplay serieux et accessible. Une economie equilibree, des entreprises jouables, un staff present." },
    { key: 'rules_text', value: "1. Respect entre joueurs, en jeu comme sur Discord.\n2. Pas de metagaming ni de powergaming.\n3. Le RP prime toujours sur le gain.\n4. Les decisions du staff sont finales." },
  ];
  for (const s of settings) {
    const exists = await knex('settings').where({ key: s.key }).first();
    if (!exists) await knex('settings').insert(s);
  }

  // --- Compte administrateur ---
  if (!config.admin.password) {
    console.warn('[seed] ADMIN_PASSWORD absent du .env : aucun compte admin cree.');
    return;
  }
  const existing = await knex('users').where({ email: config.admin.email }).first();
  if (existing) {
    console.log(`[seed] Compte admin deja present (${config.admin.email}).`);
    return;
  }
  const founder = await knex('ranks').where({ name: 'Fondateur' }).first();
  const today = new Date().toISOString().slice(0, 10);

  await knex('members').insert({
    rp_name: config.admin.username,
    rank_id: founder ? founder.id : null,
    status: 'active',
    hired_at: today,
    public_listed: false,
  });
  const member = await knex('members')
    .where({ rp_name: config.admin.username })
    .orderBy('id', 'desc')
    .first();

  await knex('users').insert({
    username: config.admin.username,
    email: config.admin.email,
    password_hash: await bcrypt.hash(config.admin.password, 12),
    role: 'admin',
    member_id: member ? member.id : null,
    is_active: true,
  });
  console.log(`[seed] Compte admin cree : ${config.admin.email}`);
};
