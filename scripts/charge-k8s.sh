#!/bin/sh
# Charge continue sur l'API du cluster, par l'Ingress, pendant N secondes.
# Usage : scripts/charge-k8s.sh <secondes>
DURATION="${1:-30}"
URL="http://localhost:8080/scores"
END=$(( $(date +%s) + DURATION ))
TOTAL=0
FAILED=0
while [ "$(date +%s)" -lt "$END" ]; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: scores.localhost" "$URL")
  TOTAL=$((TOTAL + 1))
  if [ "$CODE" != "200" ]; then
    FAILED=$((FAILED + 1))
    echo "requete $TOTAL : code $CODE"
  fi
  sleep 0.1
done
echo "Total : $TOTAL requetes, $FAILED echouees (code != 200)"
