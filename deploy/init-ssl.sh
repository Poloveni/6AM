#!/usr/bin/env bash
# Obtention du premier certificat Let's Encrypt pour ${DOMAIN}.
# Usage : ./deploy/init-ssl.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Fichier .env manquant"; exit 1; }
set -a; . ./.env; set +a
: "${DOMAIN:?DOMAIN manquant dans .env}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"

mkdir -p deploy/certbot/www deploy/certbot/conf
echo ">> nginx doit deja tourner en HTTP sur le port 80"
docker compose up -d nginx

docker compose run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  -d "${DOMAIN}" --email "${EMAIL}" \
  --agree-tos --no-eff-email --non-interactive

echo ">> Certificat obtenu."
echo ">> Decommentez le bloc HTTPS dans deploy/nginx/app.conf.template,"
echo "   puis : docker compose restart nginx && docker compose --profile ssl up -d certbot"
