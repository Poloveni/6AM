#!/usr/bin/env bash
# ============================================================================
#  6AM — installer (ou mettre à jour) le bot Discord « roxwood-network-famille »
#  sur le VPS, puis le relier au QG en lecture seule (Gestion → Le Bot).
#
#     sudo bash /opt/sixam/server/deploy/bot-install.sh
#
#  Avant : créer l'application du bot sur https://discord.com/developers/applications
#  (voir server/README.md, section 5a). Le script demande l'Application ID et le
#  token du bot ; le token ne s'affiche pas et n'est écrit que dans
#  /opt/bot-famille/.env (lisible par root uniquement, jamais dans Git).
#  Relançable : Entrée garde les valeurs déjà enregistrées, le code est mis à jour.
# ============================================================================
set -euo pipefail

main() {
APP="${APP:-/opt/sixam}"
BOT_DIR="${BOT_DIR:-/opt/bot-famille}"
REPO=https://github.com/poulpizar01/roxwood-network-famille.git
COMPOSE="$APP/server/deploy/bot-famille.yml"
BOT_ENV="$BOT_DIR/.env"
BOT_C=bot-famille-bot-1
DB_C=bot-famille-db-1
# droits demandés à l'invitation : voir, envoyer, liens intégrés, historique,
# réactions et gestion des salons (renommage des salons « labo »)
PERMS=85072

[ "$(id -u)" -eq 0 ] || { echo "Lance-moi avec sudo."; exit 1; }
command -v docker >/dev/null || { echo "Docker n'est pas installé sur ce VPS."; exit 1; }
command -v git >/dev/null || { echo "git n'est pas installé : sudo apt install -y git"; exit 1; }
[ -f "$COMPOSE" ] || { echo "Code du site trop ancien : lance d'abord  sudo bash $APP/server/deploy/vps-update.sh"; exit 1; }

echo "=== 6AM — bot Discord « famille » ==="

# ---------------------------------------------------------------------------
#  1. Code du bot
# ---------------------------------------------------------------------------
if [ -d "$BOT_DIR/.git" ]; then
  echo "-> Mise à jour du code du bot…"
  git -C "$BOT_DIR" pull --ff-only
else
  echo "-> Téléchargement du code du bot…"
  git clone --depth 1 "$REPO" "$BOT_DIR"
fi

# ---------------------------------------------------------------------------
#  2. Réglages (Entrée = garder la valeur déjà enregistrée)
# ---------------------------------------------------------------------------
lire() { [ -f "$BOT_ENV" ] && sed -n "s/^$1=//p" "$BOT_ENV" | head -1 || true; }
OLD_CID="$(lire CLIENT_ID)"; OLD_TOKEN="$(lire TOKEN)"; OLD_PG="$(lire POSTGRES_PASSWORD)"

if [ -n "$OLD_CID" ]; then read -rp "Application ID du bot [$OLD_CID] : " CID; else read -rp "Application ID du bot : " CID; fi
CID="$(printf '%s' "${CID:-$OLD_CID}" | tr -d '[:space:]')"
printf '%s' "$CID" | grep -Eq '^[0-9]{17,21}$' || { echo "L'Application ID doit être un nombre de 17 à 21 chiffres (onglet General Information)."; exit 1; }

if [ -n "$OLD_TOKEN" ]; then INVITE="Token du bot (ne s'affiche pas) [Entrée = garder l'actuel] : "; else INVITE="Token du bot (ne s'affiche pas, colle-le puis Entrée) : "; fi
read -rsp "$INVITE" TOKEN; echo
TOKEN="$(printf '%s' "${TOKEN:-$OLD_TOKEN}" | tr -d '[:space:]')"
[ -n "$TOKEN" ] || { echo "Le token est obligatoire (onglet Bot → Reset Token)."; exit 1; }
printf '%s' "$TOKEN" | grep -Eq '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' \
  || { echo "Ce n'est pas un token de bot (3 morceaux séparés par des points). Ne pas confondre avec le Client Secret."; exit 1; }

PG="${OLD_PG:-$(openssl rand -hex 24)}"   # jamais régénéré : la base existante en dépend
[ -f "$BOT_ENV" ] && cp "$BOT_ENV" "$BOT_ENV.bak.$(date +%Y%m%d-%H%M%S)"
( umask 077; printf 'TOKEN=%s\nCLIENT_ID=%s\nPOSTGRES_PASSWORD=%s\nBOT_DIR=%s\n' "$TOKEN" "$CID" "$PG" "$BOT_DIR" > "$BOT_ENV" )
chmod 600 "$BOT_ENV" "$BOT_ENV".bak.* 2>/dev/null || true
echo "-> Réglages enregistrés dans $BOT_ENV (lisible par root uniquement)"

# ---------------------------------------------------------------------------
#  3. Construction et démarrage
# ---------------------------------------------------------------------------
echo "=== Construction et démarrage du bot (2 à 5 minutes la première fois) ==="
docker compose --env-file "$BOT_ENV" -f "$COMPOSE" up -d --build

echo "-> Attente de la connexion du bot à Discord…"
ETAT="" DERNIER=""
for _ in $(seq 1 60); do
  # dernière ligne marquante du journal du bot (connexion réussie ou refusée)
  DERNIER="$(docker logs "$BOT_C" 2>&1 | grep -Ei 'Connecté en tant que|disallowed intents|invalid token|TokenInvalid|Connexion impossible|manquant' | tail -1 || true)"
  case "$DERNIER" in
    *"Connecté en tant que"*) ETAT=ok; break ;;
    *[Dd]isallowed\ intents*) ETAT=intents; break ;;
    *[Ii]nvalid\ token*|*TokenInvalid*) ETAT=token; break ;;
    ?*) ETAT=autre; break ;;
  esac
  # le bot plante en boucle pour une autre raison : inutile d'attendre davantage
  [ "$(docker inspect -f '{{.RestartCount}}' "$BOT_C" 2>/dev/null || echo 0)" -ge 3 ] && { ETAT=autre; break; }
  sleep 3
done

case "$ETAT" in
  ok) echo "✅ ${DERNIER#*✅ }" ;;
  intents)
    echo "/!\\ Discord refuse la connexion : les « Privileged Gateway Intents » ne sont pas activés."
    echo "   Portail Discord → ton application → onglet Bot → active « Server Members Intent »"
    echo "   et « Message Content Intent » → Save Changes, puis relance ce script."
    exit 1 ;;
  token)
    echo "/!\\ Discord refuse le token. Portail → onglet Bot → Reset Token, puis relance ce script"
    echo "   et colle le nouveau token."
    exit 1 ;;
  *)
    echo "/!\\ Le bot ne confirme pas sa connexion. Dernières lignes de son journal :"
    docker logs --tail 25 "$BOT_C" 2>&1 | sed 's/^/   /'
    exit 1 ;;
esac

# ---------------------------------------------------------------------------
#  4. Invitation sur le serveur Discord de 6AM
# ---------------------------------------------------------------------------
sleep 5   # le bot annonce ses commandes juste après sa connexion
GUILD="$(sed -n 's/^DISCORD_GUILD_ID=//p' "$APP/server/.env" 2>/dev/null | head -1 || true)"
echo
if docker logs "$BOT_C" 2>&1 | grep "déployée(s) sur ${GUILD:-x}" >/dev/null; then
  echo "-> Le bot est déjà sur le serveur Discord de 6AM."
else
  echo "Dernière étape côté Discord : ouvre ce lien dans ton navigateur, choisis le serveur 6AM, puis Autoriser"
  echo "(il faut la permission « Gérer le serveur » sur le Discord 6AM) :"
  echo
  echo "   https://discord.com/oauth2/authorize?client_id=$CID&permissions=$PERMS&integration_type=0&scope=bot+applications.commands"
  echo
fi

# ---------------------------------------------------------------------------
#  5. Lien en lecture seule avec le QG
# ---------------------------------------------------------------------------
echo "=== Liaison avec le QG (lecture seule) ==="
bash "$APP/server/deploy/bot-link.sh" "$DB_C"
}

main "$@"; exit
