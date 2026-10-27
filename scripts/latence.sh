#!/usr/bin/env bash
# Usage : latence.sh <délai ms> ; ajoute ce délai à tout paquet sortant de la base, puis mesure l'API et les stats
d=$1
tc() { MSYS_NO_PATHCONV=1 docker run --rm --net container:clickfast-db-1 --cap-add NET_ADMIN alpine:3.24.3 sh -c "apk add -q iproute2-tc >/dev/null 2>&1 && tc $*"; }
tc qdisc del dev eth0 root 2>/dev/null
[ "$d" -gt 0 ] && tc qdisc add dev eth0 root netem delay ${d}ms
mesure() { curl -s -o /dev/null -m 15 -w '%{http_code} en %{time_total}s' "$@"; }
for i in 1 2 3; do
  p=$(mesure -X POST -H 'Content-Type: application/json' -d '{"username":"test-latence","score":1}' http://localhost:3000/scores)
  g=$(mesure http://localhost:3000/scores)
  s=$(mesure http://localhost:8000/stats)
  echo "délai ${d} ms, essai $i | POST /scores $p | GET /scores $g | GET /stats $s"
done
