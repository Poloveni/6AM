'use strict';

/**
 * Correspondance activite -> categorie de quota du bot Discord.
 *
 * ATTENTION : cette table vit dans le CODE du bot (ACTIVITY_TYPES_FIXED,
 * src/config-store.ts) et non en base — impossible de la lire a distance.
 * Elle est recopiee ici et doit suivre les evolutions du bot.
 *
 * Module volontairement sans dependance : il est charge aussi bien par la
 * couche de lecture du bot que par les helpers de vue.
 */

const ACTIVITES = {
  atm:            { label: 'ATM',           categorie: 'actions' },
  cambu:          { label: 'Cambu',         categorie: 'actions' },
  superette:      { label: 'Supérette',     categorie: 'actions' },
  gofast:         { label: 'Go Fast',       categorie: 'actions' },
  fleeca:         { label: 'Fleeca',        categorie: 'actions' },
  braq_armurerie: { label: 'Armurerie',     categorie: 'actions' },
  bijouterie:     { label: 'Bijouterie',    categorie: 'actions' },
  pinebank:       { label: 'Pinebank',      categorie: 'actions' },
  human_labs:     { label: 'Human Labs',    categorie: 'actions' },
  vente:          { label: 'Vente drogue',  categorie: 'vente' },
  recolte:        { label: 'Récolte',       categorie: 'recolte' },
  labo_heroine:   { label: 'Labo Héroïne',  categorie: 'labos' },
  labo_sporex:    { label: 'Labo Sporex',   categorie: 'labos' },
  labo_mexicana:  { label: 'Labo Mexicana', categorie: 'labos' },
  labo_cannabis:  { label: 'Labo Cannabis', categorie: 'labos' },
  labo_cocaine:   { label: 'Labo Cocaïne',  categorie: 'labos' },
};

const CATEGORIES = { actions: 'Actions', vente: 'Vente', recolte: 'Récolte', labos: 'Labos' };

const STATUTS_ARME = { en_stock: 'En stock', pretee: 'Prêtée', perdue: 'Perdue' };

const TYPES_TAXE = { sporex: 'SporeX', heroine: 'Héroïne', vente: 'Vente', fertilisant: 'Fertilisant' };

module.exports = {
  ACTIVITES, CATEGORIES, STATUTS_ARME, TYPES_TAXE,
  libelleActivite: (a) => (ACTIVITES[a] ? ACTIVITES[a].label : a),
  categorieDe: (a) => (ACTIVITES[a] ? ACTIVITES[a].categorie : null),
};
