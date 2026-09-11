#!/usr/bin/env bash
# ==========================================================================
#  Installation / mise à jour de 6AM sur le VPS
#    sudo bash /opt/sixam/server/deploy/vps-setup.sh
#
#  Le script est REJOUABLE : relance-le sans crainte, il conserve les
#  secrets déjà en place (mot de passe de la base, clé de session) et se
#  contente de mettre à jour ce qui doit l'être.
#
#  Il tient compte de ce qui existe déjà sur le VPS :
#    - l'ancienne version du site 6AM (dossier /opt/6am, conteneur
#      sixam-web-1) : ses réglages Discord sont repris, puis elle est mise
#      à l'arrêt SANS supprimer ses données ;
#    - le reverse proxy Caddy : /opt/vps-proxy/sites.d/ (conteneur
#      proxy-caddy) ou l'ancien Caddyfile de Dynasty 8 (vps-caddy-1).
# ==========================================================================
set -euo pipefail

APP=/opt/sixam
PROXY_DIR=/opt/vps-proxy
OLD_CADDYFILE=/opt/dynasty8/deploy/vps/Caddyfile
DYN_COMPOSE=/opt/dynasty8/deploy/vps/compose.yaml
OLD_SITE_CONTAINER=sixam-web-1          # ancienne version du site 6AM
OLD_SITE_PROJECT=sixam                  # son projet Docker Compose
ENV="$APP/server/.env"
COMPOSE="$APP/server/deploy/docker-compose.yml"
STAMP="$(date +%Y%m%d-%H%M%S)"

[ "$(id -u)" -eq 0 ] || { echo "Lance-moi avec sudo."; exit 1; }
[ -d "$APP/server" ] || { echo "Le code n'est pas dans $APP (fais d'abord le git clone)."; exit 1; }
command -v docker >/dev/null || { echo "Docker n'est pas installé sur ce VPS."; exit 1; }

# --------------------------------------------------------------------------
#  Valeurs existantes : on ne régénère JAMAIS un secret déjà utilisé.
#  Régénérer POSTGRES_PASSWORD casserait la connexion à la base existante.
# --------------------------------------------------------------------------
lire() { [ -f "$ENV" ] && sed -n "s/^$1=//p" "$ENV" | head -1 || true; }
OLD_DOMAIN="$(lire BASE_URL | sed 's|^https\?://||')"
OLD_SESSION="$(lire SESSION_SECRET)"
OLD_PGPASS="$(lire POSTGRES_PASSWORD)"
OLD_CID="$(lire DISCORD_CLIENT_ID)"
OLD_CSECRET="$(lire DISCORD_CLIENT_SECRET)"
OLD_GUILD="$(lire DISCORD_GUILD_ID)"
OLD_REDIRECT="$(lire DISCORD_REDIRECT_PATH)"
OLD_ROLEMAP="$(lire DISCORD_ROLE_MAP)"
OLD_ADMINS="$(lire ADMIN_DISCORD_IDS)"
OLD_BOT_URL="$(lire BOT_DATABASE_URL)"      # posés par bot-link.sh : à conserver
OLD_BOT_GUILD="$(lire BOT_GUILD_ID)"

# Réglages Discord de l'ancienne version du site, s'il tourne encore
ancien() { docker inspect "$OLD_SITE_CONTAINER" -f '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n "s/^$1=//p" | head -1 || true; }
ANCIEN_CID="$(ancien DISCORD_CLIENT_ID)"
ANCIEN_CSECRET="$(ancien DISCORD_CLIENT_SECRET)"
ANCIEN_GUILD="$(ancien DISCORD_GUILD_ID)"
ANCIEN_URL="$(ancien APP_URL)"
if [ -n "$ANCIEN_CID" ] && [ -z "$OLD_CID" ]; then
  echo "-> Réglages Discord trouvés dans l'ancienne version du site : ils sont proposés par défaut."
fi

demander() {  # demander <question> <valeur_par_défaut> <variable_de_sortie> [-s]
  local invite="$1" actuel="$2" sortie="$3" secret="${4:-}" reponse
  if [ -n "$actuel" ]; then
    if [ "$secret" = "-s" ]; then invite="$invite [Entrée = garder l'actuel]"
    else invite="$invite [$actuel]"; fi
  fi
  if [ "$secret" = "-s" ]; then read -rsp "$invite : " reponse; echo
  else read -rp "$invite : " reponse; fi
  printf -v "$sortie" '%s' "${reponse:-$actuel}"
}

echo "=== 6AM — configuration (appuie sur Entrée pour garder la valeur entre crochets) ==="
demander "Nom de domaine du site"                        "${OLD_DOMAIN:-6amfbfa.duckdns.org}" DOMAIN
demander "Discord Client ID"                             "${OLD_CID:-$ANCIEN_CID}"             CID
demander "Discord Client Secret (ne s'affiche pas)"      "${OLD_CSECRET:-$ANCIEN_CSECRET}"     CSECRET -s
demander "ID du serveur Discord de 6AM"                  "${OLD_GUILD:-$ANCIEN_GUILD}"         GUILD
demander "Ton ID Discord (admin de départ, virgules si plusieurs)" "$OLD_ADMINS"            ADMINS

DOMAIN="$(printf '%s' "$DOMAIN" | sed 's|^https\?://||; s|/.*$||')"
[ -n "$DOMAIN" ]  || { echo "Le nom de domaine est obligatoire."; exit 1; }
[ -n "$CID" ]     || { echo "Le Client ID Discord est obligatoire."; exit 1; }
[ -n "$CSECRET" ] || { echo "Le Client Secret Discord est obligatoire."; exit 1; }
[ -n "$GUILD" ]   || { echo "L'ID du serveur Discord est obligatoire."; exit 1; }

# Adresse de retour Discord : on garde celle déjà enregistrée chez Discord
# si on réutilise l'application de l'ancien site sur le même domaine.
if [ -n "$OLD_REDIRECT" ]; then REDIRECT_PATH="$OLD_REDIRECT"
elif [ -n "$ANCIEN_CID" ] && [ "$CID" = "$ANCIEN_CID" ] && [ "${ANCIEN_URL%/}" = "https://$DOMAIN" ]; then REDIRECT_PATH="/connexion/discord/retour"
else REDIRECT_PATH="/auth/discord/callback"; fi

SESSION_SECRET="${OLD_SESSION:-$(openssl rand -hex 32)}"
POSTGRES_PASSWORD="${OLD_PGPASS:-$(openssl rand -hex 16)}"
[ -n "$OLD_PGPASS" ] && echo "-> mot de passe de la base conservé (ne jamais le régénérer)"

[ -f "$ENV" ] && cp "$ENV" "$ENV.bak.$STAMP"
umask 077
cat > "$ENV" <<ENVF
PORT=3000
BASE_URL=https://$DOMAIN
SESSION_SECRET=$SESSION_SECRET
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DISCORD_CLIENT_ID=$CID
DISCORD_CLIENT_SECRET=$CSECRET
DISCORD_GUILD_ID=$GUILD
DISCORD_REDIRECT_PATH=$REDIRECT_PATH
DISCORD_ROLE_MAP=$OLD_ROLEMAP
ADMIN_DISCORD_IDS=$ADMINS
ENVF
if [ -n "$OLD_BOT_URL" ]; then
  printf 'BOT_DATABASE_URL=%s\nBOT_GUILD_ID=%s\n' "$OLD_BOT_URL" "$OLD_BOT_GUILD" >> "$ENV"
  echo "-> liaison avec le bot Discord conservée"
fi
chmod 600 "$ENV"
umask 022
echo "-> $ENV écrit."

# --------------------------------------------------------------------------
#  Reverse proxy : conteneur Caddy et réseau Docker partagé
# --------------------------------------------------------------------------
CADDY=""
for c in proxy-caddy vps-caddy-1; do
  if docker inspect "$c" >/dev/null 2>&1; then CADDY="$c"; break; fi
done
if [ -n "$CADDY" ]; then
  PROXY_NETWORK="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$CADDY" | awk '{print $1}')"
  echo "-> Caddy trouvé : $CADDY (réseau $PROXY_NETWORK)"
else
  PROXY_NETWORK="vps_default"
  echo "/!\\ Aucun conteneur Caddy trouvé : le HTTPS devra être configuré à la main."
  docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 || docker network create "$PROXY_NETWORK" >/dev/null
fi
DEPLOY_ENV="$APP/server/deploy/.env"
BOT_NETWORK="$( [ -f "$DEPLOY_ENV" ] && sed -n 's/^BOT_NETWORK=//p' "$DEPLOY_ENV" | head -1 || true)"
printf 'PROXY_NETWORK=%s\n' "$PROXY_NETWORK" > "$DEPLOY_ENV"
[ -n "$BOT_NETWORK" ] && printf 'BOT_NETWORK=%s\n' "$BOT_NETWORK" >> "$DEPLOY_ENV"
# réseau du bot Discord (ajouté par bot-link.sh) : fichier complémentaire
COMPOSE_FILES=(-f "$COMPOSE")
[ -n "$BOT_NETWORK" ] && COMPOSE_FILES+=(-f "$APP/server/deploy/docker-compose.bot.yml")

# --------------------------------------------------------------------------
#  Construction et démarrage du nouveau site
# --------------------------------------------------------------------------
echo "=== Construction et démarrage (quelques minutes la première fois) ==="
docker compose "${COMPOSE_FILES[@]}" up -d --build

echo "-> Attente du démarrage de l'application…"
PRET=""
for _ in $(seq 1 40); do
  if docker exec sixam-app-1 wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1; then PRET=1; break; fi
  sleep 2
done
if [ -z "$PRET" ]; then
  echo "/!\\ L'application ne répond pas. Rien n'a été changé côté Caddy ni sur l'ancien site."
  echo "    Journal : sudo docker logs --tail 50 sixam-app-1"
  exit 1
fi
echo "-> Application prête."

# --------------------------------------------------------------------------
#  Aiguillage Caddy vers le nouveau site
#  Toute ancienne déclaration du même domaine est mise de côté (sauvegardée),
#  sinon Caddy refuse deux sites avec la même adresse.
# --------------------------------------------------------------------------
bloc_caddy() {
  cat <<CADDY
# --- 6AM (site vitrine + le QG, /opt/sixam) ---
http://$DOMAIN {
	redir https://{host}{uri} permanent
}

$DOMAIN {
	encode zstd gzip
	reverse_proxy sixam-app-1:3000
}
CADDY
}
retirer_domaine() {  # retire les blocs du domaine d'un Caddyfile (sauvegarde avant)
  cp -a "$1" "$1.avant-6am.$STAMP"
  python3 - "$1" "$DOMAIN" <<'PY'
import io, re, sys
p, dom = sys.argv[1], sys.argv[2]
s = io.open(p, encoding='utf-8').read()
s = re.sub(r'(?ms)^# --- 6AM .*?---\n', '', s)
s = re.sub(r'(?ms)^(?:https?://)?%s\s*\{.*?^\}[ \t]*\n?' % re.escape(dom), '', s)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s.rstrip() + '\n')
PY
}

RECHARGE=""
if [ -d "$PROXY_DIR/sites.d" ]; then
  for f in "$PROXY_DIR"/sites.d/*.caddy; do
    [ -f "$f" ] || continue
    [ "$(basename "$f")" = "sixam.caddy" ] && continue
    if grep -q "$DOMAIN" "$f"; then
      mv "$f" "$f.ancien-$STAMP"
      echo "-> ancienne déclaration mise de côté : $f.ancien-$STAMP"
    fi
  done
  [ -f "$PROXY_DIR/Caddyfile" ] && grep -q "^[^#]*$DOMAIN" "$PROXY_DIR/Caddyfile" && retirer_domaine "$PROXY_DIR/Caddyfile"
  bloc_caddy > "$PROXY_DIR/sites.d/sixam.caddy"
  echo "-> $PROXY_DIR/sites.d/sixam.caddy écrit."
  RECHARGE="$CADDY"
elif [ -f "$OLD_CADDYFILE" ]; then
  retirer_domaine "$OLD_CADDYFILE"
  { echo; bloc_caddy; } >> "$OLD_CADDYFILE"
  echo "-> bloc ajouté dans $OLD_CADDYFILE"
  RECHARGE="$CADDY"
fi

CADDY_OK=""
if [ -n "$RECHARGE" ]; then
  if docker exec "$RECHARGE" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    docker exec "$RECHARGE" caddy reload --config /etc/caddy/Caddyfile >/dev/null && CADDY_OK=1 && echo "-> Caddy rechargé."
  elif [ "$RECHARGE" = "vps-caddy-1" ] && [ -f "$DYN_COMPOSE" ]; then
    docker compose -f "$DYN_COMPOSE" restart caddy && CADDY_OK=1 && echo "-> Caddy redémarré."
  else
    echo "/!\\ Caddy refuse la configuration. Détail : sudo docker exec $RECHARGE caddy validate --config /etc/caddy/Caddyfile"
  fi
fi

# --------------------------------------------------------------------------
#  Ancienne version du site : mise à l'arrêt (données conservées)
# --------------------------------------------------------------------------
ANCIENS="$(docker ps -q --filter "label=com.docker.compose.project=$OLD_SITE_PROJECT")"
if [ -n "$CADDY_OK" ] && [ -n "$ANCIENS" ]; then
  echo
  echo "L'ancienne version du site 6AM tourne encore (dossier /opt/6am)."
  read -rp "La mettre à l'arrêt ? Ses données et ses fichiers sont conservés. [O/n] : " rep
  if [ "${rep:-O}" != "n" ] && [ "${rep:-O}" != "N" ]; then
    docker update --restart=no $ANCIENS >/dev/null
    docker stop $ANCIENS >/dev/null
    echo "-> Ancienne version arrêtée (pour la relancer : cd /opt/6am && sudo docker compose start)."
  fi
fi

# --------------------------------------------------------------------------
#  Vérification finale, comme un visiteur
# --------------------------------------------------------------------------
echo
if [ -n "$CADDY_OK" ]; then
  sleep 2
  CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/healthz" || echo 000)"
  if [ "$CODE" = "200" ]; then echo "-> Test HTTPS : OK"; else echo "/!\\ Test HTTPS : réponse $CODE (le certificat peut mettre une minute à arriver, réessaie ensuite)"; fi
fi

echo
echo "=== Terminé ==="
echo "Site           : https://$DOMAIN"
echo "Espace membres : https://$DOMAIN/qg/"
echo "Dans le portail Discord (OAuth2 > Redirects), cette adresse doit figurer :"
echo "    https://$DOMAIN$REDIRECT_PATH"
echo "Journaux       : sudo docker logs -f sixam-app-1"
