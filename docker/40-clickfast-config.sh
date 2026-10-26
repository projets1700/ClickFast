#!/bin/sh
# Lancé par l'entrypoint de l'image nginx avant le démarrage du serveur.
# Génère config.js à partir de la variable API_URL : la même image sert ainsi
# sur tous les environnements, seule la variable change, sans rebuild.
set -eu

API_URL="${API_URL:-http://localhost:3000}"

# Écrit dans /tmp : c'est le seul dossier inscriptible par l'utilisateur nginx
printf 'window.CLICKFAST_CONFIG = { apiUrl: "%s" };\n' "$API_URL" > /tmp/config.js

echo "40-clickfast-config.sh: config.js généré avec API_URL=$API_URL"
