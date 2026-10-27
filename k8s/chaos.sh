#!/bin/sh
# chaos.sh : tire une panne au hasard parmi cinq sur le cluster, sans dire laquelle.
# kubectl doit déjà pointer sur k3d-clickfast-cluster. Réponse, pour le débriefing : base64 -d .incident
# CHAOS_N=<1..5> force une panne précise (pour remplir le tableau de diagnostic).
N=${CHAOS_N:-$(( $(od -An -N1 -tu1 /dev/urandom) % 5 + 1 ))}
echo "$N" | base64 > .incident
POD=$(kubectl get pods -n clickfast -l app=scores-api -o jsonpath='{.items[0].metadata.name}')
IMAGE=$(kubectl get deployment scores-api -n clickfast -o jsonpath='{.spec.template.spec.containers[0].image}')
REPO="${IMAGE%%:*}"

case "$N" in
  1) kubectl delete pod -n clickfast "$POD" ;;                       # un pod disparaît
  2) kubectl exec -n clickfast "$POD" -- kill 1 ;;                   # le processus meurt, le pod reste
  3) kubectl set image deployment/scores-api scores-api="${REPO}:ce-tag-n-existe-pas" -n clickfast ;;  # image introuvable
  4) kubectl patch secret scores-secret -n clickfast --type=json \
       -p='[{"op":"remove","path":"/data/DB_PASSWORD"}]'
     kubectl rollout restart deployment/scores-api -n clickfast ;;   # l'API redémarre sans un secret qu'elle exige
  5) kubectl patch deployment scores-api -n clickfast --type=json \
       -p='[{"op":"add","path":"/spec/template/spec/containers/0/resources","value":{"limits":{"memory":"8Mi"}}}]' ;;  # mémoire trop basse
esac > /dev/null 2>&1
echo "Incident déclenché."
