#!/usr/bin/env bash
# Charge continue sur l'API de scores de vm-prod, pour donner du relief au tableau de bord Grafana.
# Usage : scripts/charge-api.sh [secondes] [url]    (Ctrl+C pour arrêter avant la fin)
DURATION="${1:-120}"
URL="${2:-http://localhost:3000}"
END=$(( $(date +%s) + DURATION ))
TOTAL=0
FAILED=0
while [ "$(date +%s)" -lt "$END" ]; do
  # Lecture du classement, une partie enregistrée, et un score inexistant (404) pour peupler les erreurs client
  for CODE in \
    "$(curl -s -o /dev/null -w '%{http_code}' "$URL/scores")" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/scores" -H 'Content-Type: application/json' -d '{"username":"charge","score":137}')" \
    "$(curl -s -o /dev/null -w '%{http_code}' "$URL/scores/999999")"; do
    TOTAL=$((TOTAL + 1))
    case "$CODE" in 5*|000) FAILED=$((FAILED + 1)) ;; esac
  done
  sleep 0.2
done
echo "Total : $TOTAL requêtes, $FAILED en erreur serveur ou sans réponse (5xx / 000)"
