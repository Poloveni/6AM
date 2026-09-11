#!/usr/bin/env bash
# Mise à jour après un push sur GitHub :  sudo bash /opt/sixam/server/deploy/vps-update.sh
set -euo pipefail
cd /opt/sixam && git pull --ff-only
docker compose -f /opt/sixam/server/deploy/docker-compose.yml up -d --build
docker image prune -f >/dev/null
echo "6AM mis à jour."
