#!/usr/bin/env bash
# ============================================================================
#  6AM — relier le QG au bot Discord (roxwood-network-famille), en LECTURE SEULE
#
#  À lancer une seule fois sur le VPS, après vps-setup.sh :
#     sudo bash /opt/sixam/server/deploy/bot-link.sh
#  (optionnel : donner le nom du conteneur PostgreSQL du bot en argument)
#
#  Ce que fait le script :
#   1. trouve la base PostgreSQL du bot parmi les conteneurs Docker ;
#   2. y crée un compte « sixam_ro » qui peut seulement LIRE (aucune écriture) ;
#   3. écrit l'adresse de connexion dans server/.env (fichier privé, hors Git) ;
#   4. branche le site sur le réseau Docker du bot et le redémarre.
#  Relançable sans risque : le mot de passe du compte est simplement renouvelé.
# ============================================================================
set -euo pipefail

main() {
APP=/opt/sixam
DEPLOY="$APP/server/deploy"
ENV="$APP/server/.env"
DEPLOY_ENV="$DEPLOY/.env"
ROLE=sixam_ro
ARG_CONTAINER="${1:-}"

[ "$(id -u)" -eq 0 ] || { echo "Lance-moi avec sudo."; exit 1; }
command -v docker >/dev/null || { echo "Docker n'est pas installé sur ce VPS."; exit 1; }
[ -f "$ENV" ] || { echo "Le site n'est pas encore installé : lance d'abord vps-setup.sh."; exit 1; }
[ -f "$DEPLOY/docker-compose.bot.yml" ] || { echo "Code du site trop ancien : lance d'abord  sudo bash $DEPLOY/vps-update.sh"; exit 1; }

lire() { sed -n "s/^$1=//p" "$2" 2>/dev/null | head -1 || true; }
ecrire() {  # ecrire <fichier> <clé> <valeur> : remplace ou ajoute la ligne, garde le reste
  local f="$1" k="$2" v="$3" tmp
  tmp="$(mktemp)"
  { grep -v "^$k=" "$f" 2>/dev/null || true; printf '%s=%s\n' "$k" "$v"; } > "$tmp"
  cat "$tmp" > "$f"; rm -f "$tmp"
}
GUILD="$(lire BOT_GUILD_ID "$ENV")"; [ -n "$GUILD" ] || GUILD="$(lire DISCORD_GUILD_ID "$ENV")"
PROXY_NETWORK="$(lire PROXY_NETWORK "$DEPLOY_ENV")"
echo "=== 6AM — liaison avec le bot Discord (lecture seule) ==="
echo "-> Serveur Discord de 6AM : ${GUILD:-inconnu}"

# ---------------------------------------------------------------------------
#  1. Trouver la base du bot : un conteneur PostgreSQL qui contient la table
#     « stats » du bot (on ignore la base du site lui-même).
# ---------------------------------------------------------------------------
env_de() { docker inspect "$1" -f '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n "s/^$2=//p" | head -1; }
psql_in() {  # psql_in <conteneur> <utilisateur> <base> <requête>
  docker exec "$1" psql -X -q -At -v ON_ERROR_STOP=1 -U "$2" -d "$3" -c "$4" 2>/dev/null
}

if [ -n "$ARG_CONTAINER" ]; then CANDIDATS="$ARG_CONTAINER"
else
  CANDIDATS="$(docker ps --format '{{.Names}}\t{{.Image}}\t{{.Label "com.docker.compose.project"}}' \
    | awk -F'\t' '$2 ~ /postgres|postgis|timescale/ && $3 != "sixam" && $3 != "sixam-site" && $1 != "sixam-db-1" {print $1}')"
fi
[ -n "$CANDIDATS" ] || { echo "/!\\ Aucun conteneur PostgreSQL en marche (hors site 6AM). Le bot tourne-t-il sur ce VPS ?"; diagnostic; exit 1; }

TROUVE_C="" TROUVE_U="" TROUVE_DB="" TROUVE_SCHEMA="" TROUVE_N=-1
for c in $CANDIDATS; do
  u="$(env_de "$c" POSTGRES_USER)"; u="${u:-postgres}"
  bases="$(psql_in "$c" "$u" postgres "SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn" || true)"
  [ -n "$bases" ] || { d="$(env_de "$c" POSTGRES_DB)"; bases="${d:-$u}"; }
  for db in $bases; do
    schema="$(psql_in "$c" "$u" "$db" "SELECT table_schema FROM information_schema.tables WHERE table_name = 'stats' AND table_schema IN (SELECT table_schema FROM information_schema.tables WHERE table_name = 'quota_targets') LIMIT 1" || true)"
    [ -n "$schema" ] || continue
    n="$(psql_in "$c" "$u" "$db" "SELECT (SELECT count(*) FROM \"$schema\".stats WHERE guild_id = '$GUILD') + (SELECT count(*) FROM \"$schema\".settings WHERE guild_id = '$GUILD')" || echo 0)"
    echo "-> Base du bot trouvée : conteneur $c, base $db ($n ligne(s) pour le serveur 6AM)"
    if [ "${n:-0}" -gt "$TROUVE_N" ]; then TROUVE_C="$c" TROUVE_U="$u" TROUVE_DB="$db" TROUVE_SCHEMA="$schema" TROUVE_N="${n:-0}"; fi
  done
done
[ -n "$TROUVE_C" ] || { echo "/!\\ Aucune base du bot trouvée (table « stats » introuvable)."; diagnostic; exit 1; }
C="$TROUVE_C" U="$TROUVE_U" DB="$TROUVE_DB" SCHEMA="$TROUVE_SCHEMA"

# Le bot sert plusieurs serveurs Discord : on vérifie qu'il a bien des données pour 6AM
if [ "$TROUVE_N" -eq 0 ]; then
  echo
  echo "/!\\ Le bot n'a encore aucune donnée pour le serveur Discord ${GUILD:-?}."
  AUTRES="$(psql_in "$C" "$U" "$DB" "SELECT guild_id || ' (' || count(*) || ' lignes)' FROM \"$SCHEMA\".stats GROUP BY guild_id ORDER BY count(*) DESC LIMIT 5" || true)"
  if [ -n "$AUTRES" ]; then
    echo "   Serveurs Discord présents dans la base du bot :"; printf '%s\n' "$AUTRES" | sed 's/^/     /'
    read -rp "   ID du serveur Discord à afficher [Entrée = garder ${GUILD:-?}] : " R
    GUILD="${R:-$GUILD}"
  else
    echo "   (base vide : normal si personne n'a encore utilisé le bot — les données apparaîtront ensuite)"
  fi
fi
[ -n "$GUILD" ] || { echo "ID du serveur Discord inconnu."; exit 1; }

# ---------------------------------------------------------------------------
#  2. Compte en lecture seule. Le mot de passe (hexadécimal) ne passe que par
#     l'entrée standard : il n'apparaît ni à l'écran ni dans la liste des processus.
# ---------------------------------------------------------------------------
PW="$(openssl rand -hex 24)"
OWNER="$(psql_in "$C" "$U" "$DB" "SELECT tableowner FROM pg_tables WHERE schemaname = '$SCHEMA' AND tablename = 'stats'")"
docker exec -i "$C" psql -X -q -v ON_ERROR_STOP=1 -U "$U" -d "$DB" >/dev/null <<SQL
DO \$\$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '$ROLE') THEN
    ALTER ROLE $ROLE WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$PW';
  ELSE
    CREATE ROLE $ROLE WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$PW';
  END IF;
END \$\$;
ALTER ROLE $ROLE SET default_transaction_read_only = on;
ALTER ROLE $ROLE SET search_path = "$SCHEMA";
ALTER ROLE $ROLE CONNECTION LIMIT 10;
GRANT CONNECT ON DATABASE "$DB" TO $ROLE;
GRANT USAGE ON SCHEMA "$SCHEMA" TO $ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA "$SCHEMA" TO $ROLE;
ALTER DEFAULT PRIVILEGES FOR ROLE "$OWNER" IN SCHEMA "$SCHEMA" GRANT SELECT ON TABLES TO $ROLE;
SQL
echo "-> Compte « $ROLE » prêt : lecture seule, aucune modification possible"

# ---------------------------------------------------------------------------
#  3. Réseau Docker du bot (le site doit pouvoir joindre sa base)
# ---------------------------------------------------------------------------
BOT_NETWORK="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$C" | tr ' ' '\n' | grep -vx -e '' -e bridge -e host -e none | head -1 || true)"
[ -n "$BOT_NETWORK" ] || { echo "/!\\ La base du bot n'est sur aucun réseau Docker nommé : liaison impossible automatiquement."; diagnostic; exit 1; }
echo "-> Réseau Docker du bot : $BOT_NETWORK"

# ---------------------------------------------------------------------------
#  4. Configuration du site puis redémarrage
# ---------------------------------------------------------------------------
cp "$ENV" "$ENV.bak.$(date +%Y%m%d-%H%M%S)"
ecrire "$ENV" BOT_DATABASE_URL "postgresql://$ROLE:$PW@$C:5432/$DB"
ecrire "$ENV" BOT_GUILD_ID "$GUILD"
chmod 600 "$ENV" "$ENV".bak.* 2>/dev/null || true
FILES=(-f "$DEPLOY/docker-compose.yml")
if [ "$BOT_NETWORK" != "$PROXY_NETWORK" ]; then
  ecrire "$DEPLOY_ENV" BOT_NETWORK "$BOT_NETWORK"
  FILES+=(-f "$DEPLOY/docker-compose.bot.yml")
else
  sed -i '/^BOT_NETWORK=/d' "$DEPLOY_ENV" 2>/dev/null || true   # même réseau que Caddy : rien à ajouter
fi

echo "=== Redémarrage du site ==="
docker compose "${FILES[@]}" up -d --build
for _ in $(seq 1 40); do
  docker exec sixam-app-1 wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1 && break
  sleep 2
done
sleep 2
LIGNE="$(docker logs --since 3m sixam-app-1 2>&1 | grep 'Pont bot' | tail -1 || true)"
echo
if printf '%s' "$LIGNE" | grep -q 'connecté'; then
  echo "✅ $LIGNE"
  echo "   Ouvre le QG → Gestion → Le Bot."
else
  echo "/!\\ Le site ne confirme pas la connexion au bot :"
  echo "   ${LIGNE:-aucun message — vérifie avec :  sudo docker logs --tail 50 sixam-app-1}"
  exit 1
fi
}

diagnostic() {
  echo
  echo "Envoie une capture de ces deux commandes pour que l'on trouve la base du bot :"
  echo "   sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"
  echo "   sudo docker network ls"
}

main "$@"; exit
