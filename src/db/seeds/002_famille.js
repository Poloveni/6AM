'use strict';
const config = require('../../config');

/**
 * La famille 6AM : grades et membres issus du dossier Petite Frappe.
 *
 * Idempotent : rejouable sans creer de doublon. Ne publie aucune
 * donnee sensible (pas d'identifiant, pas de date de naissance,
 * pas d'immatriculation, pas d'inventaire).
 */

const RANKS = [
  { name: 'Lead',        level: 100, color: '#c9d6e3', is_staff: true,  description: 'Direction de la 6AM' },
  { name: 'Co-Lead',     level: 90,  color: '#a8c2dc', is_staff: true,  description: 'Second de la direction' },
  { name: 'Bras droit',  level: 80,  color: '#8fb0d4', is_staff: true,  description: 'Relais du commandement' },
  { name: 'Lieutenant',  level: 70,  color: '#6f93bb', is_staff: true,  description: 'Encadrement des opérations' },
  { name: 'Dealer',      level: 50,  color: '#4a6a8f', is_staff: false, description: 'Réseau de vente et contacts' },
  { name: 'Recrue',      level: 20,  color: '#5b6b7d', is_staff: false, description: 'Fait ses preuves' },
];

const MEMBERS = [
  {
    rp_name: "Jean Njuts", rank: "Lead", origin: "Londres",
    bio: "Ancien membre des Emerald Syndicate, Njuts s’en éloigne pour bâtir avec deux proches un projet correspondant à sa vision. Malgré la disparition des autres fondateurs, il maintient le cap et prend seul la tête du groupe. Sous sa direction, la 6AM cultive une identité britannique : classe, discrète et stratégique, où la négociation prime sur la violence.",
  },
  {
    rp_name: "Hugo Delawid", rank: "Co-Lead", origin: "Los Santos",
    bio: "Né et élevé à Los Santos dans un environnement difficile, Hugo apprend jeune à se débrouiller seul. Calme, méfiant et réfléchi, il privilégie la discrétion et la loyauté plutôt que la violence inutile. Il trouve dans la 6AM la famille qui lui manquait et veut construire avec elle quelque chose de durable.",
  },
  {
    rp_name: "Francis Detton", rank: "Bras droit", origin: "Dallas",
    bio: "Originaire du Texas, Francis trouve refuge dans le rodéo avant que tout s’effondre : son ranch, ses chevaux, ses repères. Il prend la route vers Los Santos avec l’espoir d’un nouveau départ. Dur et déterminé, il voit dans la 6AM l’occasion de retrouver une famille et un objectif.",
  },
  {
    rp_name: "Amado Gomez", rank: "Lieutenant", origin: "Los Santos",
    bio: "Ayant grandi dans un environnement difficile, Amado a appris tôt l’importance de la confiance et de la débrouillardise. Arrivé à Los Santos avec l’ambition de se construire un avenir, il préfère laisser ses actes parler pour lui et gravir les échelons à la loyale.",
  },
  {
    rp_name: "Angel Delawid", rank: "Dealer", origin: "Los Santos",
    bio: "Angel s’est forgé une réputation dans les rues de Los Santos par sa discrétion, son sang-froid et son sérieux. Chargée de développer le réseau de vente, de trouver de nouveaux contacts et de sécuriser les transactions, elle est devenue une pièce essentielle du fonctionnement de la famille.",
  },
  {
    rp_name: "Théo Grande", rank: "Dealer", origin: "Birmingham",
    bio: "Originaire de Birmingham, Théo quitte l’Angleterre après une injustice qui brise sa confiance envers les institutions. À Los Santos, il découvre la 6AM, un groupe d’Anglais qui devient sa nouvelle famille. Calme et réfléchi, il préfère observer et agir au bon moment.",
  },
  {
    rp_name: "Thomas Sano", rank: "Dealer", origin: "Sicile",
    bio: "Arrivé à Los Santos avec l’ambition de reconstruire le nom Sano, Thomas essuie un premier échec qui change sa manière d’avancer : désormais il veut construire plutôt que conquérir. Il retrouve dans la 6AM une philosophie qui lui correspond — discrétion, négociation, stratégie et patience.",
  },
  {
    rp_name: "Olivia Ritchi", rank: "Dealer", origin: "Manchester",
    bio: "Originaire de Manchester, Olivia rejoint San Andreas après avoir perdu sa famille. Elle découvre la 6AM par son fiancé ; après la disparition brutale de celui-ci, quelques jours avant leur mariage, elle décide de s’investir pleinement dans le groupe pour honorer sa mémoire.",
  },
  {
    rp_name: "Ash Jackson", rank: "Recrue", origin: "Miami",
    bio: "Originaire de Miami, Ash grandit dans un environnement où la confiance se mérite. Les rivalités le poussent à quitter la ville pour Los Santos. Son expérience de la rue et sa capacité à rester discret l’amènent naturellement vers la 6AM : agir avec méthode, rester dans l’ombre, construire sur le long terme.",
  },
  {
    rp_name: "Hamid Salvatore", rank: "Recrue", origin: "Portugal",
    bio: "Grandi dans un environnement marqué par la pauvreté, Hamid apprend tôt à se débrouiller seul. Une confrontation le force à quitter le pays ; il arrive à Los Santos à dix-huit ans avec l’envie de repartir de zéro. Sa débrouillardise et sa volonté de prouver sa valeur trouvent leur place à la 6AM.",
  },
];

const SETTINGS = {
  home_headline: 'Pendant qu\u2019ils dorment, nous préparons demain.',
  home_subline: 'Le gentleman avant le gangster.',
  about_text: "De Londres, la 6AM a gardé une certaine élégance : propre, classe, discrète et maîtrisée. On y préfère une poignée de main à un affrontement, une négociation à une menace, une discussion bien menée à une démonstration de force.\n\nTrois fondateurs se retrouvaient chaque matin à six heures pour parler stratégie pendant que la ville dormait. Deux sont partis. Le principe est resté : préparer demain pendant que les autres dorment.",
  rules_text: "1. La parole engage. Ce qui se dit entre nous reste entre nous.\n2. La négociation avant la menace, la discussion avant la démonstration de force.\n3. La discrétion protège le groupe : pas de bruit inutile, pas d\u2019étalage.\n4. On réfléchit avant d\u2019agir, et chaque décision prépare la suivante.\n5. On ne laisse personne derrière.\n6. Le respect se gagne, la loyauté se prouve. La couronne ne se donne pas.",
};

exports.seed = async function seed(knex) {
  // --- Grades ---
  for (const r of RANKS) {
    const existing = await knex('ranks').where({ name: r.name }).first();
    if (existing) await knex('ranks').where({ id: existing.id }).update({ ...r, updated_at: new Date() });
    else await knex('ranks').insert(r);
  }
  const ranksByName = Object.fromEntries(
    (await knex('ranks').select('id', 'name')).map((r) => [r.name, r.id])
  );

  // --- Membres ---
  // Comparaison sans accents ni casse : corriger l'orthographe d'un nom
  // met la fiche a jour au lieu d'en creer une seconde.
  const cle = (v) => String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();

  const existants = new Map(
    (await knex('members').select('id', 'rp_name')).map((r) => [cle(r.rp_name), r.id])
  );

  const today = new Date().toISOString().slice(0, 10);
  for (const m of MEMBERS) {
    const row = {
      rp_name: m.rp_name,
      rank_id: ranksByName[m.rank] || null,
      origin: m.origin,
      bio: m.bio,
      status: 'active',
      public_listed: true,
    };
    const id = existants.get(cle(m.rp_name));
    if (id) await knex('members').where({ id }).update({ ...row, updated_at: new Date() });
    else await knex('members').insert({ ...row, hired_at: today });
  }

  // --- Menage : grades de demonstration devenus inutiles ---
  const placeholder = await knex('members').where({ rp_name: config.admin.username }).first();
  if (placeholder) {
    await knex('members').where({ id: placeholder.id }).update({ rank_id: null, public_listed: false });
  }
  const obsoletes = ['Fondateur', 'Administrateur', 'Moderateur', 'Support', 'Membre'];
  for (const name of obsoletes) {
    const rank = await knex('ranks').where({ name }).first();
    if (!rank) continue;
    const [{ c }] = await knex('members').where({ rank_id: rank.id }).count({ c: '*' });
    if (Number(c) === 0) await knex('ranks').where({ id: rank.id }).del();
  }

  // --- Textes du site : on ne remplace que les valeurs de demonstration ---
  const ANCIENS = [
    'Bienvenue sur 6AM',
    'Une ville qui ne dort jamais. Ecris ton histoire.',
  ];
  for (const [key, value] of Object.entries(SETTINGS)) {
    const existing = await knex('settings').where({ key }).first();
    if (!existing) {
      await knex('settings').insert({ key, value, updated_at: new Date() });
    } else if (ANCIENS.includes(existing.value) || (existing.value || '').startsWith('6AM est un serveur GTA RP') || (existing.value || '').startsWith('1. Respect entre joueurs')) {
      await knex('settings').where({ key }).update({ value, updated_at: new Date() });
    }
  }

  console.log(`[seed] Famille 6AM : ${RANKS.length} grades, ${MEMBERS.length} membres.`);
};
