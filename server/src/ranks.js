/*
 * Grades de 6AM — du plus haut au plus bas.
 *
 *  value  : identifiant technique (minuscules, sans espace ni accent).
 *           Ne le change plus une fois le site en service : il est enregistré
 *           dans la base pour chaque membre.
 *  label  : nom affiché sur le site (modifiable quand tu veux) — « correspondance
 *           classique » de 6AM : Lord, Duke, Chancellor, Marshal, Gentleman, Candidate.
 *  alias  : ancien nom, rappelé en petit à côté (ex. « Lord · Lead »).
 *  icon   : icône du grade (symbole de assets/grades.svg, sans le préfixe « g- »).
 *  admin  : peut valider les nouveaux membres et gérer l'administration.
 *  top    : pouvoirs complets (nommer un Lord, modifier l'organigramme public).
 *  hidden : n'apparaît pas dans l'organigramme public.
 *
 * Le DERNIER grade de la liste est donné automatiquement aux nouveaux comptes.
 */
export const RANKS = [
  { value: 'lead',       label: 'Lord',       alias: 'Lead',       icon: 'crown',     admin: true, top: true },
  { value: 'co-lead',    label: 'Duke',       alias: 'Co-Lead',    icon: 'fleur',     admin: true, top: true },
  { value: 'devweb',     label: 'Dev Web',    alias: '',           icon: 'laptop',    admin: true, top: true, hidden: true },
  { value: 'bras-droit', label: 'Chancellor', alias: 'Bras droit', icon: 'lion',      admin: true },
  { value: 'lieutenant', label: 'Marshal',    alias: 'Lieutenant', icon: 'swords' },
  { value: 'dealer',     label: 'Gentleman',  alias: 'Dealer',     icon: 'handshake' },
  { value: 'recrue',     label: 'Candidate',  alias: 'Recrue',     icon: 'quill' },
];

export const BOOTSTRAP_RANK = 'devweb';

/*
 * Organigramme public de départ (dossier « Projet PF — 6AM »), utilisé une
 * seule fois quand la base est vide. Ensuite tout se modifie depuis le QG →
 * Gestion → Hiérarchie du site (textes et photos).
 */
export const ORG_SEED = [
  { rank: 'lead', name: 'Jean Njuts', subtitle: '33 ans · Londres', photo: '/assets/membres/njuts.webp',
    description: "Ancien membre des Emerald Syndicate, Njuts s'en éloigne pour bâtir avec deux proches un projet correspondant à sa vision : la 6AM.\nMalgré la disparition des autres fondateurs et une tentative de prise de pouvoir, il maintient le cap et prend seul la tête du groupe.\nSous sa direction, la 6AM cultive une identité britannique : classe, discrète et stratégique, où la négociation prime sur la violence et où chaque décision prépare la suivante.\nCalme, ambitieux et protecteur, Njuts poursuit un objectif : faire de la 6AM une famille respectée et durable. Pendant qu'ils dorment, il prépare demain." },
  { rank: 'co-lead', name: 'Hugo Delawid', subtitle: '26 ans · Los Santos', photo: '/assets/membres/hugo-delawid.webp',
    description: "Né et élevé à Los Santos dans un environnement difficile, Hugo apprend très jeune à se débrouiller seul.\nCalme, méfiant et réfléchi, il évolue dans la rue tout en privilégiant la discrétion et la loyauté plutôt que la violence inutile.\nAprès plusieurs trahisons, il comprend que l'indépendance a ses limites et découvre la 6AM, dont les valeurs de confiance, de respect et de protection des siens correspondent aux siennes.\nLoyal, protecteur et déterminé, Hugo trouve dans la 6AM la famille qui lui manquait et souhaite désormais la protéger, la faire grandir et construire avec elle quelque chose de durable." },
  { rank: 'bras-droit', name: 'Francis Detton', subtitle: '30 ans · Dallas', photo: '/assets/membres/francis-detton.webp',
    description: "Originaire du Texas, Francis grandit dans un environnement familial difficile et trouve très jeune refuge dans le rodéo. Entre compétitions, blessures et mauvaises fréquentations, sa vie finit par s'effondrer jusqu'à lui faire perdre son ranch, ses chevaux et ses derniers repères.\nSans véritable attache, il prend la route vers Los Santos avec l'espoir d'un nouveau départ, et tente progressivement de reconstruire ce qu'il a perdu.\nDur, déterminé et profondément marqué par son passé, Francis voit dans la 6AM l'occasion de retrouver une famille, un objectif et quelque chose qui mérite enfin d'être construit." },
  { rank: 'lieutenant', name: 'Amado Gomez', subtitle: '36 ans · Los Santos', photo: '/assets/membres/amado-gomez.webp',
    description: "Ayant grandi dans un environnement difficile, Amado a rapidement appris l'importance de la confiance, du respect et de la débrouillardise.\nArrivé à Los Santos avec l'ambition de se construire un avenir, il comprend vite l'importance de bien s'entourer. Sa rencontre avec la 6AM lui fait découvrir un groupe soudé, organisé et ambitieux : il rejoint la famille et gagne progressivement la confiance de ses membres.\nCalme, loyal et déterminé, Amado préfère laisser ses actes parler pour lui et souhaite aujourd'hui gravir les échelons tout en construisant sa propre réputation." },
  { rank: 'dealer', name: 'Théo Grande', subtitle: '20 ans · Birmingham', photo: '/assets/membres/theo-grande.webp',
    description: "Originaire de Birmingham, Théo grandit dans une famille modeste jusqu'à ce qu'une injustice brise sa confiance envers les institutions.\nAprès la disparition de son père et l'éloignement de sa fratrie, il quitte l'Angleterre pour Los Santos, où il cherche à repartir de zéro. Il y découvre la 6AM, un groupe d'Anglais qui devient rapidement sa nouvelle famille.\nCalme, discret et réfléchi, il préfère observer et agir au bon moment. Aujourd'hui, il souhaite faire ses preuves et participer à la construction de l'avenir de la 6AM." },
  { rank: 'dealer', name: 'Angel Delawid', subtitle: '26 ans · Los Santos', photo: '/assets/membres/angel-delawid.webp',
    description: "Avant de rejoindre la 6AM, Angel s'est forgé une réputation dans les rues de Los Santos grâce à sa discrétion, son sang-froid et son sérieux. Ses qualités et sa loyauté lui permettent rapidement de gagner la confiance de la famille.\nAujourd'hui, Angel occupe un rôle de dealeuse et de membre de confiance, chargée notamment de développer le réseau de vente, trouver de nouveaux contacts et sécuriser les transactions.\nLoyale, discrète et observatrice, elle souhaite devenir une personne indispensable au bon fonctionnement de la famille." },
  { rank: 'dealer', name: 'Thomas Sano', subtitle: '28 ans · San Andreas', photo: '/assets/membres/thomas-sano.webp',
    description: "Originaire de Sicile, Thomas arrive à Los Santos avec l'ambition de reconstruire le nom Sano. Son premier objectif, reprendre le Bahamas, se solde par un échec qui transforme profondément sa manière d'avancer : désormais, il veut construire plutôt que conquérir.\nIl retrouve dans la 6AM une philosophie qui lui correspond : discrétion, négociation, stratégie et patience. Plutôt que d'imposer son nom, Thomas souhaite gagner sa place par ses actes.\nLoyal, calme et ambitieux, il rejoint la 6AM pour apprendre, développer son réseau et participer à la construction d'un projet solide et durable." },
  { rank: 'dealer', name: 'Olivia Ritchi', subtitle: '26 ans · Manchester', photo: '/assets/membres/olivia-ritchi.webp',
    description: "Originaire de Manchester, Olivia rejoint San Andreas à 22 ans après avoir perdu sa famille dans un tragique accident. Elle y reconstruit progressivement sa vie et s'impose professionnellement grâce à sa détermination.\nElle découvre ensuite les 6AM à travers son fiancé. Après la disparition brutale de celui-ci, quelques jours avant leur mariage, Olivia décide de s'investir pleinement dans le groupe pour honorer sa mémoire.\nDéterminée, ambitieuse et investie, elle souhaite contribuer à faire grandir les 6AM et construire quelque chose de durable." },
  { rank: 'recrue', name: 'Ash Jackson', subtitle: 'Miami',
    description: "Originaire de Miami, Ash grandit dans un environnement où la confiance se mérite et où les opportunités sont rares. Avec Léon et Franklin Saint, il se fait rapidement une place dans le trafic avant que les rivalités ne rendent la situation trop dangereuse.\nIl quitte alors Miami pour Los Santos, déterminé à repartir sur de nouvelles bases. Son expérience de la rue, sa loyauté envers son cercle proche et sa discrétion l'amènent naturellement vers la 6AM, dont il partage la vision : agir avec méthode, rester dans l'ombre et construire sur le long terme." },
  { rank: 'recrue', name: 'Hamid Salvatore', subtitle: 'Miami',
    description: "Originaire du Portugal, Hamid grandit dans un environnement marqué par la pauvreté et apprend très tôt à se débrouiller seul. De petites affaires illégales l'entraînent progressivement dans un milieu plus dangereux, jusqu'à une confrontation qui le force à quitter le pays.\nÀ seulement 18 ans, il arrive à Los Santos avec l'envie de repartir de zéro et de se construire une nouvelle réputation. Sa débrouillardise, sa discrétion et sa volonté de prouver sa valeur trouvent leur place au sein de la 6AM, où l'ambition compte autant que la loyauté." },
];
export const RANK_DESC_SEED = {
  dealer: 'Développent le réseau de vente, trouvent de nouveaux contacts et sécurisent les transactions.',
  recrue: 'Font leurs preuves, apprennent le code et gagnent la confiance de la famille.',
};
