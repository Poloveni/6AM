'use strict';
const botActivites = require('./bot-activites');

const ROLES = { member: 1, staff: 2, admin: 3 };

const STATUS_LABELS = {
  active: 'En service',
  leave: 'En conge',
  fired: 'Licencie',
  resigned: 'Demission',
};

const EVENT_LABELS = {
  hired: 'Embauche',
  promoted: 'Promotion',
  demoted: 'Retrogradation',
  warned: 'Avertissement',
  leave: 'Mise en conge',
  returned: 'Retour de conge',
  fired: 'Licenciement',
  resigned: 'Demission',
  note: 'Note',
};

function roleAtLeast(role, min) {
  return (ROLES[role] || 0) >= (ROLES[min] || 99);
}

function formatDate(value, locale = 'fr-FR') {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(value, locale = 'fr-FR') {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(cents, locale = 'fr-FR') {
  const n = Number(cents) || 0;
  return n.toLocaleString(locale) + ' $';
}

function formatDuration(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest} min`;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}

function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Enveloppe async pour Express 4 (propage les rejets vers next()). */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  ROLES, STATUS_LABELS, EVENT_LABELS,
  CATEGORIES_BOT: botActivites.CATEGORIES,
  STATUTS_ARME: botActivites.STATUTS_ARME,
  TYPES_TAXE: botActivites.TYPES_TAXE,
  TIERS: botActivites.TIERS,
  libelleActivite: botActivites.libelleActivite,
  libelleActiviteIcone: botActivites.libelleActiviteIcone,
  // Type fixe ou zone : le bot stocke la cle de zone dans le meme champ.
  libelleTaxe: botActivites.libelleTaxe,
  estZoneTaxe: botActivites.estZone,
  plafondBraquage: botActivites.plafondBraquage,
  roleAtLeast, formatDate, formatDateTime, formatMoney, formatDuration,
  toDateOnly, wrap, escapeHtml,
};
