#!/usr/bin/env bash
# Mise à jour après un push sur GitHub :  sudo bash /opt/sixam/server/deploy/vps-update.sh
set -euo pipefail
main() {
  local deploy=/opt/sixam/server/deploy
  cd /opt/sixam && git pull --ff-only
  local files=(-f "$deploy/docker-compose.yml")
  # site relié au bot Discord (bot-link.sh) : on garde le réseau du bot
  if grep -qs '^BOT_NETWORK=.' "$deploy/.env"; then files+=(-f "$deploy/docker-compose.bot.yml"); fi
  docker compose "${files[@]}" up -d --build
  docker image prune -f >/dev/null
  echo "6AM mis à jour."
}
main "$@"; exit
