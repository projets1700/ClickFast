# Procédure de déploiement : API de scores ClickFast sur le cluster k3d

Pour la personne d'astreinte, qui ne connaît pas le projet. Chaque commande se copie telle quelle. Chaque étape a sa vérification : on ne passe à la suivante que si le résultat attendu s'affiche.

La cible n'est plus une machine (vm-prod, jusqu'au jour 3) : c'est le cluster Kubernetes `clickfast-cluster`. Il relance seul un pod qui meurt. Il ne répare jamais une configuration cassée.

## 0. Avant de commencer

| Besoin | Valeur |
| ------ | ------ |
| Un terminal **Git Bash** sur le poste qui fait tourner le cluster | Menu Démarrer > Git Bash |
| Le dépôt cloné | `cd "/d/Ecole/Methode devops/ClickFast"` (toutes les commandes partent de ce dossier) |
| Docker Desktop démarré | `docker ps` répond sans erreur |
| Le cluster | contexte kubectl `k3d-clickfast-cluster`, namespace `clickfast` |
| L'API | `scores-api` : Deployment de 3 replicas, Service, Ingress `scores.localhost` |
| La base | `scores-db` : 1 replica, données dans le PVC `scores-db-data` |
| La configuration | ConfigMap `scores-config`, Secret `scores-secret` (jamais dans git) |

Pour ne jamais viser le mauvais cluster, toutes les commandes passent par cet alias :

```bash
k() { kubectl --context k3d-clickfast-cluster -n clickfast "$@"; }
```

Vérification : `k get nodes` affiche `k3d-clickfast-cluster-server-0   Ready`. Si la commande répond `context was not found`, le cluster n'existe pas sur ce poste : voir les pannes connues.

## 1. État des lieux (avant toute action)

| Commande | Résultat attendu |
| -------- | ---------------- |
| `k get pods` | 3 `scores-api-…` en `1/1 Running`, 1 `scores-db-…` en `1/1 Running` |
| `k get deploy scores-api -o jsonpath='{.spec.template.spec.containers[0].image}'` | `arrow91/clickfast-api:<sha>` : la version en cours, à noter |
| `k rollout history deploy/scores-api` | la liste des révisions, la dernière en bas |
| `curl -s -H "Host: scores.localhost" localhost:8080/health` | `{"status":"ok"}` |
| `curl -s -H "Host: scores.localhost" localhost:8080/scores` | une liste JSON (`[]` si vide), pas un 503 |

## 2. Déploiement normal : par la pipeline

Un push (ou une fusion de pull request) sur `main` qui touche `api/`, `k8s/` ou `.github/workflows/api.yml` lance le workflow **API de scores** :

1. `test` puis `test-integration` (vraie base PostgreSQL jetable).
   Vérification : les deux jobs sont verts dans l'onglet Actions.
2. `build-and-push` publie `arrow91/clickfast-api:<sha du commit>`.
   Vérification : le tag apparaît sur https://hub.docker.com/r/arrow91/clickfast-api/tags.
3. `deploy`, sur le runner self-hosted de ce poste : `kubectl apply` des manifestes de `k8s/`, avec le tag remplacé par le sha, puis `rollout status` (3 minutes au plus), puis `/health` par l'Ingress.
   Vérification : job vert, avec `deployment "scores-api" successfully rolled out` dans le log, et l'image du Deployment (étape 1) porte le nouveau sha.

Durée attendue : environ 2 minutes pour tout le run, dont 20 à 25 s de rolling update pour les 3 pods. Sans coupure : les anciens pods servent jusqu'à ce que les nouveaux soient prêts (`maxUnavailable: 0`). Au-delà de 5 minutes, regarder quel job attend (runner arrêté : voir les pannes).

## 3. Déploiement manuel d'urgence (pipeline en panne)

`<SHA>` = un tag qui existe sur Docker Hub.

1. `k set image deploy/scores-api scores-api=arrow91/clickfast-api:<SHA>`
   Vérification : `deployment.apps/scores-api image updated`.
2. `k rollout status deploy/scores-api --timeout=180s`
   Vérification : `successfully rolled out`. S'il expire : `k get pods`. Un pod en `ImagePullBackOff` indique un tag absent de Docker Hub, et il faut alors faire le retour arrière (étape 4). Les anciens pods servent toujours pendant ce temps.
3. `curl -s -H "Host: scores.localhost" localhost:8080/scores` renvoie une liste JSON.

Si un manifeste de `k8s/` a changé (ConfigMap, Ingress…) : `k apply -f k8s/config.yaml`, puis `k rollout restart deploy/scores-api`. Un pod ne relit sa configuration qu'à son redémarrage.

## 4. Retour arrière

**Quand :**

| Signal observé | Action | Qui décide |
| -------------- | ------ | ---------- |
| Une route renvoie des erreurs ou un champ manque, juste après un déploiement | Retour arrière immédiat | La personne d'astreinte, seule |
| Nouveau pod bloqué (`ImagePullBackOff`, `CrashLoopBackOff`, `OOMKilled`) et rollout qui n'avance plus | Retour arrière immédiat (le service tient encore, mais plus rien ne peut se déployer) | La personne d'astreinte |
| Signal ambigu | Attendre la validation de l'auteur du projet | L'auteur |

**Commande :**

```bash
k rollout undo deploy/scores-api && k rollout status deploy/scores-api --timeout=180s
```

Vérifications :
1. `successfully rolled out`.
2. L'image du Deployment (étape 1) est revenue à l'ancien sha.
3. `/scores` répond comme avant le déploiement.

Durée mesurée : 20 s pour 3 pods, sans coupure.

Pour revenir à une révision précise : `k rollout history deploy/scores-api`, puis `k rollout undo deploy/scores-api --to-revision=<N>`.

Attention : le prochain push sur `main` redéploie `main`. Après un retour arrière, la correction (ou un `git revert`) doit passer par une pull request.

## 5. Pannes connues et leur signature

Toujours commencer par `k get pods`, puis `k describe pod <nom>` (section **Events**, tout en bas) pour ce qui empêche un pod de démarrer, et `k logs <nom> --previous` pour ce qui le fait tomber une fois démarré.

| Ce qu'on voit | Cause | Se répare seule ? | Remède |
| ------------- | ----- | ----------------- | ------ |
| Un pod en moins quelques secondes, puis un nouveau nom de pod | Pod supprimé | Oui, en ~5 s | Rien, vérifier `k get pods` |
| `RESTARTS` qui passe à 1, pod `0/1` quelques secondes | Le processus est mort dans le conteneur | Oui, en ~10 s | Rien. Si `RESTARTS` monte en boucle : `k logs <pod> --previous` |
| Un pod neuf en `ErrImagePull` / `ImagePullBackOff`, Events : `failed to pull … not found` ; les 3 anciens servent toujours | Tag d'image inexistant | Non | `k rollout undo deploy/scores-api` |
| Un pod neuf en `Error` / `CrashLoopBackOff`, `k logs <pod> --previous` : `Variables d'environnement manquantes : DB_PASSWORD` | Une clé manque dans le Secret `scores-secret` | Non | Remettre la clé (valeur auprès de l'auteur : c'est le mot de passe avec lequel la base a été créée), puis `k rollout restart deploy/scores-api` |
| Un pod neuf en `OOMKilled` puis `CrashLoopBackOff`, `k describe pod` : `Last State: Terminated, Reason: OOMKilled`, `Limits: memory: 8Mi` | Limite mémoire trop basse (la valeur sûre est 32Mi) | Non | `k rollout undo deploy/scores-api`, ou `k apply` du `k8s/api.yaml` du dépôt |
| Pods `1/1 Running`, `/health` à 200, mais `/scores` en 503 en 3 s | La base ne répond pas (`k get pods -l app=scores-db`) | Non | `k scale deploy/scores-db --replicas=1`, puis `k rollout status deploy/scores-db` |
| Pods `Running`, mais tout l'Ingress en 503 immédiat | Le Service ne trouve plus ses pods (selector modifié) : `k get endpointslices -l kubernetes.io/service-name=scores-api` est vide | Non | `k apply -f k8s/api.yaml` |
| `404 page not found` en texte brut (pas en JSON) | Règle d'Ingress cassée (chemin ou port) : c'est Traefik qui répond, pas l'API | Non | `k apply -f k8s/ingress.yaml` |
| Job `deploy` en `Queued` sans fin | Le runner self-hosted ne tourne pas | Non | `cd D:\actions-runner; .\run.cmd` dans PowerShell, fenêtre laissée ouverte |
| `context "k3d-clickfast-cluster" does not exist` ou `connection refused` | Docker Desktop arrêté, ou cluster arrêté | Non | Démarrer Docker Desktop, puis `/c/Users/adama/tools/k3d/k3d.exe cluster start clickfast-cluster` |

Limite connue : `/health` ne vérifie pas la base. Les sondes readiness et liveness, bâties dessus, gardent un pod « prêt » pendant que la base est coupée. Seul `/scores` le montre.

## 6. Après toute intervention

1. Refaire l'état des lieux de l'étape 1.
2. Noter dans le Journal de bord du README : l'heure de début, l'heure du rétablissement, ce qui a été tapé, ce qui a manqué dans ce document.
3. Corriger ce document dans le même commit que ce qui l'a rendu faux.

## Contacts et escalade

1. Auteur du projet : Adam Amrane, dépôt https://github.com/projets1700/ClickFast.
2. Si l'auteur ne répond pas et que le service est coupé : retour arrière (étape 4), puis attendre.
