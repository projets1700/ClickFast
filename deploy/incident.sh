#!/bin/sh
# incident.sh : tire une panne au hasard parmi cinq, SUR la machine cible, sans afficher laquelle.
#   ssh -i deploy/deploy_key -p 2222 root@localhost 'sh -s' < deploy/incident.sh
# Réponse, pour le débriefing seulement : ssh ... 'base64 -d /root/.incident'
N=$(( $(od -An -N1 -tu1 /dev/urandom) % 5 + 1 ))
echo "$N" | base64 > /root/.incident
IMAGE=$(docker inspect -f '{{.Config.Image}}' scores-api)

case "$N" in
  1) docker stop scores-api ;;                                  # plus personne ne répond
  2) docker stop scores-db ;;                                   # l'API répond, la base a disparu
  3) NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' scores-api)
     docker network disconnect $NET scores-api ;;               # la base tourne, mais l'API ne la joint plus
  4) docker rm -f scores-api
     docker run -d --name scores-api -p 3000:3000 "$IMAGE" ;;   # relancée sans sa config
  5) for i in 1 2 3 4; do
       docker run -d --name hog-$i alpine sh -c 'while :; do :; done'
     done ;;                                                    # la machine ne respire plus
esac > /dev/null 2>&1
echo "Incident déclenché. Bonne chance."
