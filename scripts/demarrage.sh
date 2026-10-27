#!/usr/bin/env bash
# Usage : demarrage.sh <dossier> ; mesure du "up -d" au 1er 200 de chaque service
cd "$1" || exit 1
now() { date +%s%N; }
t0=$(now)
docker compose -f docker-compose.prod.yml up -d --quiet-pull >/dev/null 2>&1
t_up=$(now)
declare -A fin
while [ ${#fin[@]} -lt 3 ]; do
  for u in front=http://localhost:8080/ api=http://localhost:3000/health stats=http://localhost:8000/stats; do
    n=${u%%=*}; [ -n "${fin[$n]}" ] && continue
    [ "$(curl -s -o /dev/null -m 1 -w '%{http_code}' ${u#*=})" = 200 ] && fin[$n]=$(now)
  done
  [ $(( ($(now)-t0)/1000000000 )) -gt 180 ] && { echo TIMEOUT; break; }
  sleep 0.1
done
ms() { awk -v a="$1" -v b="$t0" 'BEGIN{printf "%.1f",(a-b)/1e9}'; }
echo "up -d rendu : $(ms $t_up) s | front 200 : $(ms ${fin[front]}) s | api 200 : $(ms ${fin[api]}) s | stats 200 : $(ms ${fin[stats]}) s"
