# Le QG — serveur de 6AM

Express + PostgreSQL + connexion Discord. Le même serveur affiche aussi le site vitrine (racine du dépôt).
Tout tourne dans Docker sur le VPS, derrière le Caddy déjà utilisé par Dynasty 8 / Maja 13 (qui gère le HTTPS tout seul).

## 1. Application Discord

L'ancienne version du site 6AM utilisait déjà une application Discord (celle du bot). **Le script d'installation reprend automatiquement ses réglages** (Client ID, Client Secret, ID du serveur) et garde l'adresse de retour déjà enregistrée chez Discord (`https://6amfbfa.duckdns.org/connexion/discord/retour`). Rien à créer.

Seule information à préparer : **ton ID Discord** (Discord → Paramètres → Avancés → Mode développeur, puis clic droit sur ton pseudo → *Copier l'identifiant de l'utilisateur*).

Si un jour tu utilises une autre application Discord : https://discord.com/developers/applications → OAuth2 → copie Client ID et Client Secret, ajoute dans *Redirects* l'adresse affichée à la fin du script, puis relance le script.

## 2. Nom de domaine

Le site utilise **`6amfbfa.duckdns.org`** (DuckDNS), qui pointe déjà vers l'IP du VPS `51.255.173.188`. Rien à faire tant que cette IP ne change pas (sinon : duckdns.org → *update ip*).

## 3. Installation sur le VPS

```bash
sudo git clone https://github.com/Poloveni/6AM.git /opt/sixam
sudo bash /opt/sixam/server/deploy/vps-setup.sh
```
Le script pose les questions (Entrée = garder la valeur proposée), écrit `server/.env`, démarre le nouveau site, aiguille Caddy vers lui, puis propose de mettre l'ancienne version (`/opt/6am`) à l'arrêt — **sans supprimer ses données**. Il est **rejouable** sans risque : relance-le pour changer une valeur.

À la fin, ouvre `https://6amfbfa.duckdns.org/qg/` et connecte-toi : avec ton ID en admin, tu arrives directement validé, avec le grade **Dev Web** (tous les droits). Quand Njuts se connecte, valide-le dans Gestion → Administration et donne-lui le grade **Lead**.

## 4. Mettre à jour après un changement poussé sur GitHub

```bash
sudo bash /opt/sixam/server/deploy/vps-update.sh
```

## 5. Le bot Discord « famille » (onglet Gestion → Le Bot)

Le QG affiche, **en lecture seule**, les données du bot [roxwood-network-famille](https://github.com/poulpizar01/roxwood-network-famille) : quotas et paie de la semaine, braquages et cooldowns, coffre, armurerie, taxes, ventes en attente, véhicules et activité. Page réservée aux admins du QG.

### 5a. Créer l'application du bot (une fois, sur le portail Discord)

1. https://discord.com/developers/applications → **New Application** → nom « 6AM Bot » → Create.
2. Onglet **Bot** : active **Server Members Intent** et **Message Content Intent** → **Save Changes**. Décoche **Public Bot**. Clique **Reset Token** et garde le token de côté (il ne s'affiche qu'une fois ; ne le colle jamais dans une discussion).
3. Onglet **General Information** : copie l'**Application ID**.

### 5b. Installer le bot sur le VPS et le relier au site

```bash
sudo bash /opt/sixam/server/deploy/bot-install.sh
```

Le script télécharge le bot dans `/opt/bot-famille`, demande l'Application ID et le token (invisible à la saisie, enregistré dans `/opt/bot-famille/.env`, lisible par root uniquement), démarre le bot et sa base (aucun port ouvert sur Internet), affiche le **lien d'invitation** du bot sur le serveur Discord 6AM, puis lance `bot-link.sh`.

`bot-link.sh` crée dans la base du bot un compte `sixam_ro` qui ne peut que lire, écrit `BOT_DATABASE_URL` et `BOT_GUILD_ID` dans `server/.env` et branche le site sur le réseau Docker du bot. Le site ne peut jamais modifier les données du bot (droits limités à la lecture **et** transactions en lecture seule).

- Mettre le bot à jour : relancer `bot-install.sh` (Entrée garde les réglages).
- Journal du bot : `sudo docker logs --tail 50 bot-famille-bot-1`
- Réglages du bot : depuis Discord avec `/config` (voir le README du bot), par un administrateur du serveur.

## En cas de souci

- Voir les journaux : `sudo docker logs -f sixam-app-1` (Ctrl+C pour quitter)
- État des conteneurs : `sudo docker ps --filter name=sixam`
- « invalid redirect_uri » chez Discord : l'adresse affichée à la fin du script doit figurer **exactement** dans le portail Discord (OAuth2 → Redirects).
- Revenir à l'ancienne version : `cd /opt/6am && sudo docker compose start`, puis remettre son fichier Caddy (sauvegardé à côté avec l'extension `.ancien-…`).
- Le Bot affiche « La base du bot ne répond pas » : le bot est arrêté → `sudo docker start bot-famille-db-1 bot-famille-bot-1`, sinon relance `bot-install.sh`.
- « Ce compte Discord n'est pas sur le serveur de 6AM » : mauvais ID de serveur, ou le compte n'a pas rejoint le serveur Discord.

## Options (dans server/.env)

- `DISCORD_ROLE_MAP` : fait suivre le grade du site aux rôles Discord. Format `idDuRole:grade,idDuRole:grade` (grades : voir `src/ranks.js`). Modifie le fichier avec `sudo nano /opt/sixam/server/.env`, puis lance `vps-update.sh`.
- `ADMIN_DISCORD_IDS` : IDs Discord validés d'office au premier login, avec le grade Dev Web (séparés par des virgules).

## Routes

- `GET /auth/discord` → connexion · `GET /auth/discord/callback` · `POST /auth/logout`
- `GET/PATCH /api/me` · `GET /api/membres` · `GET /api/ranks` · `GET /api/org` · `GET/POST/DELETE /api/gallery`
- `/api/admin/…` (validation des membres, organigramme et photos) · `/api/chat/…` (le Salon, en direct) · `GET /api/dossier` (dossier interne, membres validés) · `GET /api/bot` (données du bot, admins, lecture seule)
- `GET /healthz` → contrôle de santé
