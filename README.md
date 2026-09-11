# 6AM — site vitrine + le QG

Site du groupe fictif **6AM** (roleplay GTA), sur le modèle du site Maja 13. Contenu tiré du dossier « Projet PF — 6AM ».

- **Vitrine publique** : écran d'entrée, puis page d'accueil avec l'écusson en 3D : histoire, philosophie, implantation, la famille (organigramme + dossiers), projets (Private Table, Foundation), animations, galerie, ambitions, contact.
- **Le QG** (`/qg/`) : espace membres avec connexion Discord — profil, liste des membres, discussion en direct (le Salon), galerie photo, le Dossier interne, validation des nouveaux et édition de l'organigramme et des dossiers publics.

## Où modifier quoi

| Je veux changer… | Fichier |
|---|---|
| Les textes de la page d'accueil | `accueil.html` (une section = un bloc commenté `====`) |
| L'écran d'entrée (devise, lieu) | `index.html` |
| Le lien d'invitation Discord | `config.js` → `discord: 'https://discord.gg/...'` |
| Les couleurs | `styles.css`, tout en haut (`--steel`, `--bg`…) |
| Les noms des grades | `server/src/ranks.js` (champ `label`) |
| L'organigramme et les dossiers des membres (textes, photos) | depuis le QG → Gestion → Hiérarchie du site |
| Le Dossier interne (plaques, stocks, objectifs, Dead Flash) | `server/content/dossier.json` — jamais visible hors du QG |
| Le logo | `assets/` (`logo.webp`, `logo-sm.webp`, `favicon.png`, `medallion.jpg` pour la 3D) |
| Les images (villas, projets, animations, galerie) | `assets/visuels/` · portraits : `assets/membres/` |

## Structure

```
index.html, accueil.html, 404.html   pages publiques
styles.css, main.js, config.js        style et interactions du site
hero3d.js, org.js, galerie.js         écusson 3D, organigramme, galerie
assets/                               logo, icônes, image de partage, skyline
vendor/                               three.js et polices (hébergés avec le site)
qg/                                   l'espace membres
server/                               serveur Node.js (Express + PostgreSQL)
server/deploy/                        installation sur le VPS (Docker + Caddy)
server/src/bot.js                     lecture seule des données du bot Discord (QG → Gestion → Le Bot)
scripts/check-project.mjs             contrôles automatiques (npm test)
```

## Vérifier le projet

```bash
npm test
```
Doit afficher `Contrôles réussis`. Le test vérifie la syntaxe, les liens vers les fichiers et l'absence de clé secrète dans le code.

## Mettre en ligne

Voir `server/README.md` (installation sur le VPS, application Discord, mises à jour).

Le site public fonctionne aussi en simple fichier, mais **le QG, l'organigramme modifiable et la galerie ont besoin du serveur**.
