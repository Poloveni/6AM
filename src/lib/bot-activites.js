'use strict';

/**
 * Miroir des tables fixes du bot Discord.
 *
 * ATTENTION : tout ce fichier vit dans le CODE du bot (src/config-store.ts et
 * src/modules/taxes.ts) et non en base — impossible de le lire a distance. Il
 * est recopie ici et doit suivre les evolutions du bot.
 *
 * Aligne sur poulpizar01/roxwood-network-famille au 9 septembre 2026.
 *
 * Module volontairement sans dependance : il est charge aussi bien par la
 * couche de lecture du bot que par les helpers de vue.
 */

// ─────────────────────────────────────────────────── Activites declarables
// Reprises de ACTIVITY_TYPES_FIXED (config-store.ts) : libelle, icone,
// categorie de quota et ordre d'affichage.
const ACTIVITES = {
  atm:            { label: 'ATM',           icone: '',   categorie: 'actions', ordre: 1 },
  cambu:          { label: 'Cambu',         icone: '',   categorie: 'actions', ordre: 2 },
  superette:      { label: 'Supérette',     icone: '',   categorie: 'actions', ordre: 3 },
  gofast:         { label: 'Go Fast',       icone: '',   categorie: 'actions', ordre: 4 },
  fleeca:         { label: 'Fleeca',        icone: '🏦', categorie: 'actions', ordre: 5 },
  braq_armurerie: { label: 'Armurerie',     icone: '🔫', categorie: 'actions', ordre: 6 },
  bijouterie:     { label: 'Bijouterie',    icone: '💎', categorie: 'actions', ordre: 7 },
  pinebank:       { label: 'Pinebank',      icone: '🏦', categorie: 'actions', ordre: 8 },
  human_labs:     { label: 'Human Labs',    icone: '🫀', categorie: 'actions', ordre: 9 },
  vente:          { label: 'Vente drogue',  icone: '',   categorie: 'vente',   ordre: 10 },
  recolte:        { label: 'Récolte',       icone: '',   categorie: 'recolte', ordre: 11 },
  labo_heroine:   { label: 'Labo Héroïne',  icone: '',   categorie: 'labos',   ordre: 12 },
  labo_sporex:    { label: 'Labo Sporex',   icone: '',   categorie: 'labos',   ordre: 13 },
  labo_mexicana:  { label: 'Labo Mexicana', icone: '',   categorie: 'labos',   ordre: 14 },
  labo_cannabis:  { label: 'Labo Cannabis', icone: '',   categorie: 'labos',   ordre: 15 },
  labo_cocaine:   { label: 'Labo Cocaïne',  icone: '',   categorie: 'labos',   ordre: 16 },
};

const CATEGORIES = { actions: 'Actions', vente: 'Vente', recolte: 'Récolte', labos: 'Labos' };

// ─────────────────────────────────────────────────── Type d'organisation
// Le tier vit en base (settings.type_groupe) ; il commande les labos
// accessibles, les plafonds de braquage et les zones taxables.
const TIERS = {
  independant:   'Indépendant',
  petite_frappe: 'Petite Frappe',
  gang:          'Gang',
  organisation:  'Organisation',
};

/** Valeur appliquee tant qu'aucun /config type-groupe n'a ete fait. */
const TIER_DEFAUT = 'petite_frappe';

/** Labos accessibles par tier. Une activite absente ici n'est jamais bridee. */
const LABOS_PAR_TIER = {
  labo_heroine:  ['petite_frappe'],
  labo_sporex:   ['petite_frappe'],
  labo_mexicana: ['gang', 'organisation'],
  labo_cannabis: ['gang'],
  labo_cocaine:  ['organisation'],
};

/** Plafond hebdomadaire de braquages par tier. 0 = activite inaccessible. */
const BRAQUAGES_PAR_TIER = {
  independant:   { fleeca: 2,  braq_armurerie: 2,  bijouterie: 0, pinebank: 0, human_labs: 0 },
  petite_frappe: { fleeca: 6,  braq_armurerie: 6,  bijouterie: 1, pinebank: 1, human_labs: 0 },
  gang:          { fleeca: 10, braq_armurerie: 10, bijouterie: 2, pinebank: 1, human_labs: 1 },
  organisation:  { fleeca: 12, braq_armurerie: 12, bijouterie: 4, pinebank: 2, human_labs: 1 },
};

// ─────────────────────────────────────────────────── Armurerie
const STATUTS_ARME = { en_stock: 'En stock', pretee: 'Prêtée', perdue: 'Perdue' };

// ─────────────────────────────────────────────────── Taxes
/** Types fixes. Le reste des valeurs de `taxes.type` est une cle de zone. */
const TYPES_TAXE = {
  sporex:      'SporeX',
  heroine:     'Héroïne',
  fertilisant: 'Fertilisant',
  cannabis:    'Cannabis',
  mexicana:    'Mexicana',
  cocaine:     'Cocaïne',
  vente:       'Vente',
};

/** Taxes fixes proposees a la creation, par tier (`vente` est universelle). */
const TAXES_FIXES_PAR_TIER = {
  independant:   [],
  petite_frappe: ['sporex', 'heroine', 'fertilisant'],
  gang:          ['cannabis'],
  organisation:  ['mexicana', 'cocaine'],
};

const ZONES_PETITE_FRAPPE = [
  'Roxwood Village', 'Grapeseed Valley', 'Richman', 'Cinéma', 'Hawick', 'Carson',
];

const ZONES_GANG_ORGA = [
  'New Cayo Perico', 'Paleto', 'Sandy Shores', 'Grapeseed', 'Vinewood', 'Aéroport',
  'Wardog', 'Mirror Park', 'Fête Foraine', 'Barillo Plage', 'Del Perro', 'Roxwood Est',
  'Eclypse Tower', 'Vespucci', 'Roxwood Ouest', 'Terrain de cross', "Champ d'éolienne", 'Cayo Perico',
];

const ZONES_PAR_TIER = {
  independant:   [],
  petite_frappe: ZONES_PETITE_FRAPPE,
  gang:          ZONES_GANG_ORGA,
  organisation:  ZONES_GANG_ORGA,
};

/**
 * Meme calcul de cle que `slugifyZone` cote bot : minuscules, accents retires,
 * espaces remplaces par des underscores. C'est cette cle qui est stockee dans
 * `taxes.type`, pas le libelle.
 */
function cleZone(zone) {
  return String(zone)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, '_');
}

/** Cle de zone -> libelle, toutes zones connues confondues. */
const ZONES = Object.fromEntries(
  [...new Set([...ZONES_PETITE_FRAPPE, ...ZONES_GANG_ORGA])].map((z) => [cleZone(z), z])
);

/** Une taxe est une taxe de zone des lors que son type n'est pas un type fixe. */
function estZone(type) {
  return !Object.prototype.hasOwnProperty.call(TYPES_TAXE, String(type));
}

/**
 * Libelle d'un type de taxe : type fixe, zone connue, ou a defaut la cle
 * remise en forme (une zone retiree du bareme reste ainsi lisible).
 */
function libelleTaxe(type) {
  const t = String(type);
  if (TYPES_TAXE[t]) return TYPES_TAXE[t];
  if (ZONES[t]) return ZONES[t];
  return t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

module.exports = {
  ACTIVITES, CATEGORIES,
  TIERS, TIER_DEFAUT, LABOS_PAR_TIER, BRAQUAGES_PAR_TIER,
  STATUTS_ARME,
  TYPES_TAXE, TAXES_FIXES_PAR_TIER, ZONES, ZONES_PAR_TIER,
  cleZone, estZone, libelleTaxe,

  libelleActivite: (a) => (ACTIVITES[a] ? ACTIVITES[a].label : a),
  /** Libelle avec l'icone quand elle existe, comme `activityDisplayLabel` cote bot. */
  libelleActiviteIcone: (a) => {
    const c = ACTIVITES[a];
    if (!c) return a;
    return c.icone ? `${c.icone} ${c.label}` : c.label;
  },
  categorieDe: (a) => (ACTIVITES[a] ? ACTIVITES[a].categorie : null),
  /** Un labo est-il accessible au tier courant ? Toute autre activite : oui. */
  activiteActive: (a, tier) => {
    const tiers = LABOS_PAR_TIER[a];
    return !tiers || tiers.includes(tier);
  },
  /** Plafond de braquages pour une activite au tier courant, ou null. */
  plafondBraquage: (a, tier) => {
    const bareme = BRAQUAGES_PAR_TIER[tier] || BRAQUAGES_PAR_TIER[TIER_DEFAUT];
    return Object.prototype.hasOwnProperty.call(bareme, a) ? bareme[a] : null;
  },
};
