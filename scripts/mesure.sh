#!/usr/bin/env bash
# Mesure les images de ClickFast pour le tableau de l'étape 9 :
#   taille, nombre de couches (et la plus lourde), build froid / chaud, temps de 1re réponse HTTP.
#
# Usage, depuis la racine du repo :  scripts/mesure.sh [essais] [image...]
#   scripts/mesure.sh                 -> 3 essais, les 3 images
#   scripts/mesure.sh 5 clickfast-api -> 5 essais, l'API seulement
#
# "Froid" = cache de build vidé (docker builder prune) + --no-cache. Les images de base déjà
# téléchargées restent sur la machine : le temps de pull n'est pas compté.
# "Chaud" = même build relancé juste après, tout vient du cache.
# Chaque temps est la médiane des essais (Docker Desktop varie beaucoup d'un essai à l'autre).
set -euo pipefail
export MSYS_NO_PATHCONV=1

RUNS="${1:-3}"
shift || true

# Variables bidons : de quoi passer la vérification au démarrage, aucune base n'est contactée
FAKE_DB="-e DB_HOST=mesure -e DB_USER=mesure -e DB_PASSWORD=mesure -e DB_NAME=mesure"

# nom | contexte de build | port interne | route testée | options docker run
ALL_IMAGES=(
  "clickfast-front|.|80|/|"
  "clickfast-api|./api|3000|/health|$FAKE_DB"
  "clickfast-stats-api|./stats-api|8000|/health|$FAKE_DB"
)

TEST_PORT=18080

now_ms() { date +%s%3N; }
median() { sort -n | awk '{ v[NR] = $1 } END { print v[int((NR + 1) / 2)] }'; }
seconds() { awk -v ms="$1" 'BEGIN { printf "%.1f s", ms / 1000 }'; }

# Nombre de couches non vides et poids de la plus lourde, d'après docker history
layers() {
  docker history --format '{{.Size}}' "$1" | awk '
    function bytes(s,   n, u) {
      n = s + 0; u = s; sub(/^[0-9.]+/, "", u)
      if (u == "kB") n *= 1e3; else if (u == "MB") n *= 1e6; else if (u == "GB") n *= 1e9
      return n
    }
    { b = bytes($1); if (b > 0) count++; if (b > max) max = b }
    END { printf "%d (max %.1f Mo)", count, max / 1e6 }'
}

measure_image() {
  local name="$1" context="$2" port="$3" path="$4" run_opts="$5"
  local tag="$name:mesure" cold=() hot=() ready=()

  for ((i = 1; i <= RUNS; i++)); do
    docker builder prune -af >/dev/null
    local t0; t0=$(now_ms)
    docker build -q --no-cache -t "$tag" "$context" >/dev/null
    cold+=($(( $(now_ms) - t0 )))

    t0=$(now_ms)
    docker build -q -t "$tag" "$context" >/dev/null
    hot+=($(( $(now_ms) - t0 )))

    # Du docker run jusqu'au premier 200 : ce que vit réellement un client au démarrage
    docker rm -f mesure-demarrage >/dev/null 2>&1 || true
    t0=$(now_ms)
    # shellcheck disable=SC2086
    docker run -d --name mesure-demarrage -p "$TEST_PORT:$port" $run_opts "$tag" >/dev/null
    until [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$TEST_PORT$path")" = "200" ]; do
      sleep 0.1
      if (( $(now_ms) - t0 > 60000 )); then echo "Pas de 200 au bout de 60 s pour $name" >&2; exit 1; fi
    done
    ready+=($(( $(now_ms) - t0 )))
    docker rm -f mesure-demarrage >/dev/null
  done

  local size
  size=$(docker images --format '{{.Size}}' "$tag")
  printf '| %s | %s | %s | %s / %s | %s |\n' "$name" "$size" "$(layers "$tag")" \
    "$(seconds "$(printf '%s\n' "${cold[@]}" | median)")" \
    "$(seconds "$(printf '%s\n' "${hot[@]}" | median)")" \
    "$(seconds "$(printf '%s\n' "${ready[@]}" | median)")"
}

echo "| Image | Taille | Couches (poids max) | Build froid / chaud | Temps 1re réponse HTTP |"
echo "| ----- | ------ | ------------------- | ------------------- | ---------------------- |"
for entry in "${ALL_IMAGES[@]}"; do
  IFS='|' read -r name context port path run_opts <<< "$entry"
  if [ "$#" -gt 0 ] && [[ ! " $* " == *" $name "* ]]; then continue; fi
  measure_image "$name" "$context" "$port" "$path" "$run_opts"
done
