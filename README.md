# 6AM — site public + espace membres

Site du serveur GTA RP **6AM** : une vitrine publique (accueil avec medaillon 3D,
presentation, reglement, effectifs, candidature) et un espace membres protege
(gestion des effectifs, suivi d'activite, statistiques, administration).

Le projet est **transportable** : tout ce qui est propre a une installation vit
dans un unique fichier `.env`. Aucun secret n'est ecrit dans le code.

---

## Stack

| Couche        | Choix                                                          |
|---------------|----------------------------------------------------------------|
| Serveur       | Node.js 20+ / Express 4                                        |
| Vues          | EJS (rendu serveur, pas de framework front)                    |
| Base          | **PostgreSQL ou MariaDB/MySQL** — au choix, via Knex           |
| Sessions      | express-session + table `user_sessions` en base                |
| 3D            | Three.js servi en local (`src/public/vendor/`), zero CDN       |
| Deploiement   | Docker + docker-compose + nginx (+ certbot optionnel)          |

Le site ne charge **aucune ressource externe** : polices systeme, JS local,
images locales. Il fonctionne donc derriere un pare-feu ou sans acces internet.

---

## Demarrage rapide (VPS, Docker)

```bash
git clone <url-du-depot> 6am && cd 6am
cp .env.example .env
nano .env                       # voir la section Configuration ci-dessous

# PostgreSQL (defaut)
docker compose --profile postgres up -d --build

# ... ou MariaDB : mettre DB_CLIENT=mysql2 et DB_PORT=3306 dans .env
docker compose --profile mariadb up -d --build
```

Le conteneur applique les migrations automatiquement au demarrage.
Il reste a creer le compte administrateur :

```bash
docker compose exec web npm run seed
```

Le site repond alors sur `http://<ip-du-vps>` (nginx ecoute sur `HTTP_PORT`).

### HTTPS

```bash
./deploy/init-ssl.sh            # obtient le certificat Let's Encrypt
# puis decommenter le bloc HTTPS dans deploy/nginx/app.conf.template
docker compose restart nginx
docker compose --profile ssl up -d certbot   # renouvellement automatique
```

---

## Demarrage en local (sans Docker)

```bash
npm install
cp .env.example .env            # DB_HOST=localhost, COOKIE_SECURE=0, NODE_ENV=development
npm run setup                   # migrations + seed
npm run dev                     # http://localhost:3000
```

---

## Configuration

Tout se passe dans `.env` (voir `.env.example`, entierement commente).

| Bloc                | Variables cles                                                   |
|---------------------|------------------------------------------------------------------|
| Application         | `PORT`, `APP_URL`, `TRUST_PROXY`, `NODE_ENV`                     |
| Identite            | `SITE_NAME`, `SITE_TAGLINE`, `SITE_DESCRIPTION`                  |
| Liens communaute    | `DISCORD_INVITE`, `FIVEM_CONNECT`, reseaux sociaux               |
| Base de donnees     | `DB_CLIENT` (`pg` \| `mysql2`), `DB_HOST/PORT/NAME/USER/PASSWORD`, ou `DATABASE_URL` |
| Sessions            | `SESSION_SECRET`, `SESSION_TTL_HOURS`, `COOKIE_SECURE`           |
| Admin initial       | `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`                |
| Integration Discord | `DISCORD_WEBHOOK_URL` (logs RH : embauches, promotions, departs) |
| Docker              | `POSTGRES_*` / `MARIADB_*`, `DOMAIN`, `HTTP_PORT`, `HTTPS_PORT`  |

Deux secrets a generer avant la mise en ligne :

```bash
openssl rand -hex 32     # SESSION_SECRET
openssl rand -base64 24  # mot de passe base de donnees
```

En `NODE_ENV=production`, l'application refuse de demarrer si `SESSION_SECRET`
fait moins de 32 caracteres ou si le mot de passe de base est vide.

---

## Changer de moteur de base

Une seule variable : `DB_CLIENT`.

```env
# PostgreSQL
DB_CLIENT=pg
DB_PORT=5432

# MariaDB / MySQL
DB_CLIENT=mysql2
DB_PORT=3306
```

Les migrations n'utilisent que des types Knex portables (aucun `SERIAL`,
`JSONB`, `ENUM` ou fonction de date propre a un moteur), et les agregations de
statistiques sont faites cote application. Le meme schema tourne donc a
l'identique sur les deux moteurs.

---

## Roles

| Role     | Droits                                                                    |
|----------|---------------------------------------------------------------------------|
| `member` | Espace membres, sa propre activite, consultation des effectifs             |
| `staff`  | + creation/modification des fiches, grades, statuts, activite de tous      |
| `admin`  | + comptes utilisateurs, grades du serveur, contenu editorial du site       |

Le contenu editable (titre d'accueil, presentation, reglement) se modifie depuis
**Espace membres → Administration → Contenu du site**.

---

## Pont vers le bot Discord (optionnel, lecture seule)

L'espace membres peut afficher les donnees du bot
[roxwood-network-famille](https://github.com/poulpizar01/roxwood-network-famille) :
quotas de la semaine, paie estimee, cooldowns, coffre, taxes, armurerie,
vehicules. Le site **ne fait que lire** — le bot reste seul a ecrire, sinon
les messages qu'il tient a jour dans Discord se desynchronisent.

Sans `BOT_DATABASE_URL`, ces pages s'affichent avec un encart
« bot non connecte » : rien ne casse.

### Creer l'utilisateur en lecture seule

Sur le serveur PostgreSQL du bot, en tant que superutilisateur :

```sql
CREATE USER sixam_ro WITH PASSWORD 'un-mot-de-passe-solide';
GRANT CONNECT ON DATABASE bot_famille TO sixam_ro;
GRANT USAGE ON SCHEMA public TO sixam_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sixam_ro;
-- Pour que les tables creees plus tard soient aussi lisibles :
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sixam_ro;
```

Puis dans le `.env` du site :

```env
BOT_DATABASE_URL=postgres://sixam_ro:un-mot-de-passe-solide@HOTE:5432/bot_famille
BOT_DB_SSL=false
```

Si le bot tourne dans un autre projet Docker sur la meme machine, brancher
l'application sur son reseau et utiliser le nom du conteneur comme hote.

### Relier les membres

Le bot identifie les joueurs par leur **identifiant Discord**. Renseigner le
champ « ID Discord » sur chaque fiche d'effectif (Espace membres → Effectifs)
pour que « Ma semaine » et le classement affichent les bons noms. Un joueur
sans fiche est affiche avec le pseudo que le bot connait
(table `user_mapping`), ou « Non relie ».

### Semaine et remise a zero

Le bot vide sa table `stats` **chaque dimanche a 19h00, heure de Paris**, et
note la date dans `settings.last_weekly_reset`. Le site lit ces memes donnees :
les chiffres affiches sont donc, par construction, identiques a ceux de Discord.

Une table n'est **pas** lisible en base : la correspondance activite →
categorie de quota (ATM → `actions`, Labo Cocaine → `labos`...), qui vit dans
le code du bot. Elle est recopiee dans `src/lib/bot-activites.js` et doit
suivre les evolutions du bot.

---

## Structure

```
src/
  app.js              montage Express (securite, sessions, vues, routes)
  server.js           demarrage + migrations automatiques
  config.js           lecture et validation du .env
  db/
    knex.js           connexion + helper d'insertion portable
    migrations/       schema (compatible pg et mysql2)
    seeds/            grades par defaut, reglages, compte admin
  lib/                helpers, webhook Discord, reglages en cache
  middleware/         authentification, CSRF, messages flash
  routes/             public, auth, dashboard, effectifs, activite, stats, admin
  views/              gabarits EJS
  public/
    css/              feuilles de style (vitrine, espace membres)
    js/               hero Three.js, page d'entree, espace membres
    img/              embleme (logo, favicons, apple-touch-icon, og)
    models/           6am-emblem.glb, l'embleme grave affiche dans le hero
    vendor/           three.module.min.js, GLTFLoader.js, BufferGeometryUtils.js
deploy/
  caddy/              Caddyfile complet pour un VPS partage sous Caddy
  vps-reorg.sh        migration du reverse proxy vers /opt/vps-proxy
  nginx/              gabarit de vhost (serveur dedie, profil "proxy")
  init-ssl.sh         premier certificat Let's Encrypt (serveur dedie)
Dockerfile
docker-compose.yml
```

---

## L'embleme

L'embleme 3D vient d'un export Meshy (135 Mo, 3 M de triangles) reduit hors
depot avec `gltf-transform` :

```bash
gltf-transform optimize source.glb src/public/models/6am-emblem.glb \
  --texture-size 2048 --texture-compress webp --simplify-error 0.002 \
  --compress quantize
```

Resultat : 860 Ko, 6 616 triangles. Le detail vit dans la normal map, la
simplification ne se voit donc pas.

Les images fixes (`logo.png`, `favicon*.png`, `apple-touch-icon.png`,
`og.jpg`) sont des rendus du meme modele : elles servent l'en-tete, la page
d'entree, la connexion, l'onglet du navigateur et l'apercu Discord.

Dans le hero, le medaillon plat texture s'affiche tout de suite, puis le
modele glTF le remplace des qu'il est charge. Connexion en mode economie de
donnees, 2G, echec reseau ou WebGL indisponible : le medaillon reste, rien ne
casse.

Les references portent `?v=2` : les fichiers statiques sont servis avec un
cache de 7 jours en production, il faut incrementer ce numero a chaque
nouvelle version de l'embleme.

---

## Commandes

```bash
npm run dev              # developpement, rechargement automatique
npm start                # production
npm run migrate          # applique les migrations
npm run migrate:rollback # annule le dernier batch
npm run seed             # grades, reglages, compte admin (idempotent)
npm run setup            # migrate + seed
```

---

## Sauvegarde

```bash
# PostgreSQL
docker compose exec db-postgres pg_dump -U sixam sixam > sauvegarde.sql

# MariaDB
docker compose exec db-mariadb mariadb-dump -u sixam -p sixam > sauvegarde.sql
```

---

## Securite

- Mots de passe hashes en bcrypt (cout 12)
- Sessions httpOnly / SameSite=Lax / Secure en HTTPS, stockees en base
- Protection CSRF sur toutes les requetes POST
- En-tetes Helmet avec Content-Security-Policy stricte (`default-src 'self'`)
- Limitation de debit sur la page de connexion
- Le `.env` est ignore par git — ne jamais le committer
