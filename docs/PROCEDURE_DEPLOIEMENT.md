# Procédure de déploiement : API de scores ClickFast sur vm-prod

Pour la personne d'astreinte, qui ne connaît pas le projet. Chaque commande se copie telle quelle. Chaque étape a sa vérification : on ne passe à la suivante que si le résultat attendu s'affiche.

## 0. Avant de commencer

| Besoin | Où le trouver |
| ------ | ------------- |
| Un terminal **Git Bash** sur le poste qui fait tourner `vm-prod` | Menu Démarrer > Git Bash |
| Le dépôt cloné | `cd "/d/Ecole/Methode devops/ClickFast"` (toutes les commandes partent de ce dossier) |
| La clé privée de déploiement | `deploy/deploy_key` dans ce dossier (jamais dans git) |
| La machine cible | conteneur `vm-prod` sur ce poste, SSH sur le port **2222**, utilisateur **root** |
| Les fichiers de prod | sur vm-prod, dans `/srv/clickfast` : `compose.yml`, `.env` (mots de passe), `TAG` (version en cours), `PREVIOUS_TAG` (version d'avant) |
| Le tableau de bord | Grafana http://localhost:3001, utilisateur `admin`, mot de passe : voir ci-dessous |
| Prometheus | http://localhost:9090 (page Status > Targets) |

Pour ne pas retaper la connexion SSH à chaque commande, dans le terminal :

```bash
vm() { ssh -i deploy/deploy_key -p 2222 -o StrictHostKeyChecking=accept-new root@localhost "$@"; }
```

Vérification : `vm hostname` affiche un identifiant de conteneur (12 caractères), pas le nom du poste.

Mot de passe Grafana : `vm "grep GRAFANA_ADMIN_PASSWORD /srv/clickfast/.env"`.

## 1. État des lieux (avant toute action)

| Commande | Résultat attendu |
| -------- | ---------------- |
| `docker ps --filter name=vm-prod --format '{{.Status}}'` | `Up ...` |
| `vm "cat /srv/clickfast/TAG"` | le sha de la version en cours (40 caractères) |
| `vm "cd /srv/clickfast && docker compose ps --format '{{.Name}} {{.Status}}'"` | `scores-api Up ... (healthy)`, `scores-db Up ... (healthy)`, `prometheus Up`, `grafana Up` |
| `curl -s localhost:3000/health` | `{"status":"ok"}` |
| Grafana, panneau **Disponibilité** | `UP` |

Noter la version en cours : c'est elle qu'on remettra en cas de retour arrière.

## 2. Déploiement normal : par la pipeline

Un push (ou une fusion de pull request) sur `main` qui touche `api/`, `deploy/` ou `.github/workflows/api.yml` déclenche tout seul le workflow **API de scores** :

1. `test` puis `test-integration` (vraie base PostgreSQL jetable).
   Vérification : les deux jobs sont verts dans l'onglet Actions.
2. `build-and-push` publie `arrow91/clickfast-api:<sha du commit>` sur Docker Hub.
   Vérification : le tag apparaît sur https://hub.docker.com/r/arrow91/clickfast-api/tags.
3. `deploy` tourne sur le runner self-hosted de ce poste : envoi de `compose.yml` et du monitoring, `docker compose pull` puis `up -d --wait`, puis contrôle de `/health`.
   Vérification : job vert, dernière ligne du log `API en ligne`, et `vm "cat /srv/clickfast/TAG"` affiche le sha du commit poussé.

Prérequis : le runner doit tourner (fenêtre `run.cmd` ouverte, voir panne « job deploy en Queued »).

Durée attendue d'un déploiement normal : voir le Journal de bord du README (relevé du premier déploiement). Au-delà de 2 fois cette durée, regarder quel job attend.

## 3. Déploiement manuel d'urgence (pipeline en panne)

À faire seulement si GitHub Actions est indisponible. `<SHA>` = un tag qui existe sur Docker Hub.

1. Envoyer la config du dépôt :
   `scp -i deploy/deploy_key -P 2222 -r deploy/compose.yml deploy/monitoring root@localhost:/srv/clickfast/`
   Vérification : `vm "ls /srv/clickfast"` liste `compose.yml` et `monitoring`.
2. Télécharger l'image : `vm "cd /srv/clickfast && TAG=<SHA> docker compose pull scores-api"`
   Vérification : la commande se termine sans `manifest unknown`. Si elle échoue, **s'arrêter là** : rien n'a été touché, l'ancienne version tourne toujours.
3. Démarrer : `vm "cd /srv/clickfast && TAG=<SHA> docker compose up -d --wait && echo <SHA> > TAG"`
   Vérification : la commande rend la main sans erreur, puis `curl -s localhost:3000/health` répond `{"status":"ok"}`.
4. Vérifier que le service rend vraiment service : `curl -s localhost:3000/scores` renvoie une liste JSON (`[]` si vide), pas une erreur 503.

## 4. Retour arrière

**Quand :**

| Signal observé | Action | Qui décide |
| -------------- | ------ | ---------- |
| `/health` ne répond plus après un déploiement, ou panneau Erreurs au-dessus de 5 % pendant plus de 2 minutes | Retour arrière immédiat | La personne d'astreinte, seule |
| Latence (p95) en hausse, mais le service répond | Surveiller 10 minutes, retour arrière si ça empire | La personne d'astreinte |
| Signal ambigu | Attendre la validation de l'auteur du projet (contacts plus bas) | L'auteur |

**Commande** (remet la version notée dans `PREVIOUS_TAG`) :

```bash
vm 'cd /srv/clickfast && export TAG=$(cat PREVIOUS_TAG) && docker compose pull scores-api && docker compose up -d --wait && echo $TAG > TAG'
```

Vérifications :
1. `vm "cat /srv/clickfast/TAG"` affiche l'ancien sha.
2. `curl -s localhost:3000/health` répond `{"status":"ok"}`, et le panneau **Disponibilité** repasse à `UP`.
3. Le panneau **Erreurs** redescend sous 5 % dans la minute.

Pour revenir à une version précise : remplacer `$(cat PREVIOUS_TAG)` par son sha. Un sha absent de Docker Hub fait échouer le `pull` avec `manifest unknown`, avant que quoi que ce soit ne soit arrêté.

Attention : le prochain push sur `main` redéploie `main`. Après un retour arrière, la correction (ou un `git revert` du commit fautif) doit passer par une pull request.

## 5. Pannes connues et leur signature

Toujours commencer par : panneau **Disponibilité**, puis `vm "docker ps -a --format '{{.Names}} {{.Status}}'"`.

| Ce qu'on voit | Cause | Remède |
| ------------- | ----- | ------ |
| Disponibilité `DOWN`, `curl localhost:3000/health` échoue, `scores-api` en `Exited` | L'API est arrêtée | `vm "cd /srv/clickfast && TAG=\$(cat TAG) docker compose up -d --wait"` |
| Disponibilité `UP`, `/health` répond, mais `/scores` renvoie 503 en 3 s, panneau Erreurs qui monte dès qu'il y a du trafic, `scores-db` en `Exited` | La base est arrêtée | `vm "cd /srv/clickfast && TAG=\$(cat TAG) docker compose up -d --wait"` (l'API retrouve la base seule) |
| Disponibilité `DOWN` et `/health` injoignable, **alors que** `scores-api` est `Up (healthy)` | L'API a été sortie de son réseau : son healthcheck interne passe, mais ni Prometheus ni l'hôte ne la joignent. Vérifier : `vm "docker inspect -f '{{json .NetworkSettings.Networks}}' scores-api"` affiche `{}` | `vm "cd /srv/clickfast && TAG=\$(cat TAG) docker compose up -d --force-recreate --wait scores-api"` |
| Disponibilité `DOWN`, `scores-api` en `Exited (1)`, `vm "docker logs scores-api"` affiche `Variables d'environnement manquantes` | L'API a été relancée à la main, hors compose, sans son `.env` | `vm "docker rm -f scores-api && cd /srv/clickfast && TAG=\$(cat TAG) docker compose up -d --wait"` |
| Latence (p95) qui s'envole, conteneurs `hog-1` à `hog-4` dans `docker ps`, `vm "docker stats --no-stream"` montre ~100 % CPU chacun | Des processus qui saturent le CPU de la machine | `vm "docker rm -f hog-1 hog-2 hog-3 hog-4"`, puis vérifier que le p95 redescend |
| `Permission denied (publickey)` | Mauvaise clé, ou clé publique absente de vm-prod | Vérifier `-i deploy/deploy_key`. Côté pipeline : le secret `DEPLOY_SSH_KEY` doit contenir tout le fichier `deploy/deploy_key`, lignes BEGIN et END comprises |
| `Connection refused` sur le port 2222 | `vm-prod` est arrêtée | `docker start vm-prod`, attendre 10 s, puis l'état des lieux (étape 1) |
| `port is already allocated` au démarrage de `vm-prod` | Un autre programme du poste occupe 3000, 3001, 9090 ou 2222 (souvent la stack de dev : `docker compose ls`) | Arrêter la stack de dev (`docker compose -f docker-compose.prod.yml down` à la racine du dépôt), puis `docker start vm-prod` |
| Job `deploy` en `Queued` indéfiniment, sans erreur | Le runner self-hosted ne tourne pas | Relancer `run.cmd` dans le dossier du runner, laisser la fenêtre ouverte |
| Job `deploy` rouge sur `manifest unknown` | Le tag n'existe pas sur Docker Hub (build-and-push sauté ou échoué) | Rien à réparer en prod, l'ancienne version tourne toujours. Corriger la cause dans la pipeline |
| Panneau Grafana vide alors que l'API répond | Source de données mal réglée, ou Prometheus arrêté | http://localhost:9090/targets : la cible `scores-api` doit être `UP`. Sinon `vm "cd /srv/clickfast && TAG=\$(cat TAG) docker compose up -d prometheus"` |

Limite connue : `/health` ne vérifie pas la base. L'API peut être `healthy` et `UP` pendant que la base est en panne ; seuls `/scores` et le panneau Erreurs le montrent.

## 6. Après toute intervention

1. Refaire l'état des lieux de l'étape 1 : tout doit être comme avant l'incident.
2. Noter dans le Journal de bord du README : l'heure de début, l'heure du rétablissement, ce qui a été tapé, ce qui a manqué dans ce document.
3. Corriger ce document dans le même commit que ce qui l'a rendu faux.

## Contacts et escalade

1. Auteur du projet : Adam Amrane, dépôt https://github.com/projets1700/ClickFast.
2. Si l'auteur ne répond pas et que le service est coupé : retour arrière (étape 4), puis attendre.
