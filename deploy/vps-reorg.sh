#!/usr/bin/env bash
# ==========================================================================
#  Reorganisation du reverse proxy du VPS
#
#  AVANT : Caddy est un service du projet Compose "vps", enfoui dans
#          /opt/dynasty8/deploy/vps/, avec un Caddyfile unique que chaque
#          projet vient modifier — d'ou les blocs perdus.
#
#  APRES : /opt/vps-proxy/ — projet Compose "proxy" dedie, un fichier de
#          configuration PAR SITE dans sites.d/. Ajouter un site = deposer
#          un fichier et recharger. Plus aucun fichier partage a editer.
#
#  Le script sauvegarde tout avant, valide la configuration avant de
#  basculer, verifie les trois sites apres, et revient en arriere tout
#  seul au moindre probleme.
#
#  Usage :  sudo bash /opt/6am/deploy/vps-reorg.sh
#           sudo bash /opt/6am/deploy/vps-reorg.sh --rollback
# ==========================================================================
set -euo pipefail

PROXY_DIR=/opt/vps-proxy
DYN_DIR=/opt/dynasty8/deploy/vps
DYN_COMPOSE="$DYN_DIR/compose.yaml"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT=/opt/vps-backups
BACKUP="$BACKUP_ROOT/reorg-$STAMP"
LAST_LINK="$BACKUP_ROOT/derniere-reorg"

SITES=("https://lamaja13.duckdns.org" "https://6amfbfa.duckdns.org" "http://127.0.0.1")

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_off=$'\033[0m'
log()  { echo "${c_ok}==>${c_off} $*"; }
warn() { echo "${c_warn}/!\\${c_off} $*"; }
die()  { echo "${c_err}ECHEC :${c_off} $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Lance-moi avec sudo : sudo bash $0"
command -v docker >/dev/null || die "docker introuvable"

# --------------------------------------------------------------------------
#  Retour arriere
# --------------------------------------------------------------------------
rollback() {
  local src="${1:-$(readlink -f "$LAST_LINK" 2>/dev/null || true)}"
  [ -n "$src" ] && [ -d "$src" ] || die "Aucune sauvegarde a restaurer."
  warn "Retour arriere depuis $src"

  if [ -d "$PROXY_DIR" ]; then
    (cd "$PROXY_DIR" && docker compose down 2>/dev/null) || true
  fi
  if [ -f "$src/compose.yaml" ]; then
    cp -a "$src/compose.yaml" "$DYN_COMPOSE"
    log "compose.yaml de Dynasty 8 restaure"
  fi
  [ -f "$src/Caddyfile" ] && cp -a "$src/Caddyfile" "$DYN_DIR/Caddyfile"

  (cd "$DYN_DIR" && docker compose -p vps up -d) || die "Impossible de relancer la stack d'origine"
  log "Stack d'origine relancee. Verifie les sites."
  exit 0
}

[ "${1:-}" = "--rollback" ] && rollback

# --------------------------------------------------------------------------
#  1. Verifications prealables
# --------------------------------------------------------------------------
log "Verifications"
[ -f "$DYN_COMPOSE" ] || die "$DYN_COMPOSE introuvable"
[ -f "$DYN_DIR/Caddyfile" ] || die "$DYN_DIR/Caddyfile introuvable"
# La migration a-t-elle deja ete faite ? On le verifie AVANT tout le reste,
# sinon un second lancement afficherait un message hors sujet.
if [ -f "$PROXY_DIR/docker-compose.yml" ]; then
  if docker inspect proxy-caddy >/dev/null 2>&1; then
    log "Migration deja effectuee : le proxy tourne dans $PROXY_DIR."
    echo "    Recharger apres modification : $PROXY_DIR/recharger.sh"
    echo "    Revenir en arriere           : sudo bash $0 --rollback"
    exit 0
  fi
  die "$PROXY_DIR existe mais le conteneur proxy-caddy est absent. Verifie a la main : cd $PROXY_DIR && docker compose up -d"
fi

docker inspect vps-caddy-1 >/dev/null 2>&1 || die "Ni proxy-caddy ni vps-caddy-1 ne tournent : aucun reverse proxy actif, rien a migrer."
docker volume inspect vps_caddy_data >/dev/null 2>&1 || die "Volume vps_caddy_data introuvable"

NET=vps_default
docker network inspect "$NET" >/dev/null 2>&1 || die "Reseau $NET introuvable"
for cont in vps-app-1 maja13-app-1 sixam-web-1; do
  if docker inspect "$cont" >/dev/null 2>&1; then
    docker inspect "$cont" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
      | grep -q "$NET" || warn "$cont n'est pas sur $NET — son site risque de repondre 502"
  else
    warn "Conteneur $cont absent — son bloc sera quand meme ecrit"
  fi
done

# --------------------------------------------------------------------------
#  2. Sauvegarde
# --------------------------------------------------------------------------
log "Sauvegarde dans $BACKUP"
mkdir -p "$BACKUP"
cp -a "$DYN_COMPOSE" "$BACKUP/compose.yaml"
cp -a "$DYN_DIR/Caddyfile" "$BACKUP/Caddyfile"
docker ps --format '{{.Names}} | {{.Image}} | {{.Ports}}' > "$BACKUP/conteneurs-avant.txt"
docker volume ls > "$BACKUP/volumes-avant.txt"
ln -sfn "$BACKUP" "$LAST_LINK"

# --------------------------------------------------------------------------
#  3. Copie des certificats vers des volumes autonomes
# --------------------------------------------------------------------------
log "Copie des certificats vers proxy_caddy_data / proxy_caddy_config"
for pair in "vps_caddy_data proxy_caddy_data" "vps_caddy_config proxy_caddy_config"; do
  set -- $pair
  docker volume create "$2" >/dev/null
  docker run --rm -v "$1":/depuis:ro -v "$2":/vers alpine:3 \
    sh -c 'cp -a /depuis/. /vers/ 2>/dev/null || true'
done
log "Les volumes d'origine sont conserves intacts comme filet de securite"

# --------------------------------------------------------------------------
#  4. Construction de /opt/vps-proxy
# --------------------------------------------------------------------------
log "Construction de $PROXY_DIR"
mkdir -p "$PROXY_DIR/sites.d"

cat > "$PROXY_DIR/Caddyfile" <<'CADDYFILE'
# ==========================================================================
#  Reverse proxy partage du VPS
#
#  NE PAS ajouter de site ici : deposer un fichier dans sites.d/
#  Caddy trie les blocs par specificite, l'ordre des fichiers n'a
#  aucune importance.
# ==========================================================================

{
	# email admin@exemple.fr   # decommenter pour les avis d'expiration
}

import sites.d/*.caddy
CADDYFILE

cat > "$PROXY_DIR/sites.d/00-dynasty8.caddy" <<'SITE'
# Dynasty 8 — attrape-tout HTTP sur l'adresse IP nue.
# Le domaine dynasty8.fbfa.fr est heberge chez l'operateur FlashbackFA.
:80 {
	encode gzip
	reverse_proxy app:3000
}
SITE

cat > "$PROXY_DIR/sites.d/maja13.caddy" <<'SITE'
# MAJA 13
http://lamaja13.duckdns.org {
	redir https://{host}{uri} permanent
}

lamaja13.duckdns.org {
	encode gzip
	reverse_proxy maja13-app-1:3000
}
SITE

cat > "$PROXY_DIR/sites.d/6am.caddy" <<'SITE'
# 6AM
http://6amfbfa.duckdns.org {
	redir https://{host}{uri} permanent
}

6amfbfa.duckdns.org {
	encode zstd gzip

	reverse_proxy sixam-web-1:3000 {
		header_up X-Real-IP {remote_host}
	}
}
SITE

cat > "$PROXY_DIR/docker-compose.yml" <<'COMPOSE'
# Reverse proxy partage du VPS — projet Compose "proxy".
# Ne contient que Caddy : aucune application, aucune base.
name: proxy

services:
  caddy:
    image: caddy:2-alpine
    container_name: proxy-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./sites.d:/etc/caddy/sites.d:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [partage]

networks:
  # Reseau sur lequel vivent les applications des differents projets.
  partage:
    external: true
    name: vps_default

volumes:
  caddy_data:
    external: true
    name: proxy_caddy_data
  caddy_config:
    external: true
    name: proxy_caddy_config
COMPOSE

cat > "$PROXY_DIR/recharger.sh" <<'RELOAD'
#!/usr/bin/env bash
# Valide puis recharge la configuration du proxy, sans coupure.
set -euo pipefail
docker exec proxy-caddy caddy validate --config /etc/caddy/Caddyfile
docker exec proxy-caddy caddy reload   --config /etc/caddy/Caddyfile
echo "Configuration rechargee."
RELOAD
chmod +x "$PROXY_DIR/recharger.sh"

cat > "$PROXY_DIR/README.md" <<'README'
# Reverse proxy du VPS

Caddy, seul point d'entree HTTP/HTTPS de la machine. Il ecoute sur 80/443
et distribue vers les conteneurs des differents projets.

## Ajouter un site

1. Brancher le conteneur de l'application sur le reseau partage `vps_default`.
   Dans son `docker-compose.yml` :

   ```yaml
   services:
     web:
       networks: [interne, partage]
   networks:
     interne: {}
     partage:
       external: true
       name: vps_default
   ```

2. Deposer `sites.d/<projet>.caddy` :

   ```
   http://mon-site.fr { redir https://{host}{uri} permanent }

   mon-site.fr {
       encode gzip
       reverse_proxy <nom-du-conteneur>:3000
   }
   ```

   Viser le **nom du conteneur**, pas le nom du service : sur un reseau
   partage, deux projets peuvent avoir un service portant le meme nom.

3. `./recharger.sh`

Le bloc `http://` explicite est necessaire : l'attrape-tout `:80` de
Dynasty 8 empeche Caddy d'installer sa redirection automatique.
L'ordre des fichiers n'a aucune importance, Caddy trie par specificite.

## Certificats

Volumes `proxy_caddy_data` et `proxy_caddy_config`. Renouvellement
automatique. Les anciens volumes `vps_caddy_*` sont conserves comme
sauvegarde ; ne pas lancer `docker compose down -v` dans
/opt/dynasty8/deploy/vps sans y penser.

## A faire un jour

Ce dossier merite son propre depot git. Le reseau partage s'appelle encore
`vps_default` (herite du projet Dynasty 8) : il pourra etre renomme le jour
ou chaque projet sera de toute facon modifie.
README

# --------------------------------------------------------------------------
#  5. Validation avant bascule
# --------------------------------------------------------------------------
log "Validation de la configuration (conteneur jetable)"
docker run --rm \
  -v "$PROXY_DIR/Caddyfile":/etc/caddy/Caddyfile:ro \
  -v "$PROXY_DIR/sites.d":/etc/caddy/sites.d:ro \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile \
  || die "Configuration invalide — rien n'a ete change."

# --------------------------------------------------------------------------
#  6. Bascule
# --------------------------------------------------------------------------
log "Neutralisation du service caddy dans la stack Dynasty 8"
python3 - "$DYN_COMPOSE" <<'PY'
import io, re, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
if 'RETIRE-VOIR-/opt/vps-proxy' not in s:
    s = re.sub(r'(?m)^([ \t]*)caddy:[ \t]*$',
               lambda m: (f"{m.group(1)}# Service deplace vers /opt/vps-proxy (projet Compose \"proxy\").\n"
                          f"{m.group(1)}# Le profil le neutralise sans le supprimer. RETIRE-VOIR-/opt/vps-proxy\n"
                          f"{m.group(1)}caddy:\n"
                          f"{m.group(1)}  profiles: [\"retire\"]"),
               s, count=1)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print("compose.yaml modifie")
else:
    print("compose.yaml deja modifie")
PY

log "Arret de l'ancien Caddy"
(cd "$DYN_DIR" && docker compose -p vps rm -sf caddy) || warn "Suppression du conteneur imparfaite"

log "Demarrage du nouveau proxy"
(cd "$PROXY_DIR" && docker compose up -d) || { warn "Demarrage impossible"; rollback "$BACKUP"; }

# --------------------------------------------------------------------------
#  7. Verification
# --------------------------------------------------------------------------
log "Attente de la mise en service"
sleep 6

fail=0
for url in "${SITES[@]}"; do
  code="$(curl -skI --max-time 20 -o /dev/null -w '%{http_code}' "$url" || echo 000)"
  if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
    printf '   %-34s %s%s%s\n' "$url" "$c_ok" "$code" "$c_off"
  else
    printf '   %-34s %s%s%s\n' "$url" "$c_err" "$code" "$c_off"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  warn "Un site au moins ne repond pas. Journal du proxy :"
  docker logs --tail 30 proxy-caddy 2>&1 | sed 's/^/     /'
  warn "Retour arriere automatique."
  rollback "$BACKUP"
fi

log "Migration terminee."
echo
echo "  Proxy        : $PROXY_DIR   (docker compose, projet \"proxy\")"
echo "  Sites        : $PROXY_DIR/sites.d/*.caddy"
echo "  Rechargement : $PROXY_DIR/recharger.sh"
echo "  Sauvegarde   : $BACKUP"
echo "  Retour arriere : sudo bash $0 --rollback"
