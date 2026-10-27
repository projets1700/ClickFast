# ClickFast

[![CI](https://github.com/projets1700/ClickFast/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/projets1700/ClickFast/actions/workflows/release.yml)

Jeu de rapidité : il faut cliquer le plus de fois possible sur un bouton en 5 secondes.

Réalisé par Adam Amrane.

Projet fil rouge de la formation DevOps : le jeu est volontairement simple (HTML / CSS / JS), le vrai sujet est sa dockerisation puis son passage en pipeline CI/CD.

## Comment jouer

- Le premier clic sur le bouton **Clique !** lance le chrono de 5 secondes.
- Chaque clic ajoute 1 au score.
- À la fin du chrono, le bouton se bloque et le score final s'affiche.
- **Rejouer** remet le score à 0 et le chrono à 5 secondes.
- En fin de partie, le score est envoyé à l'API avec le pseudo saisi, puis le classement (top 10) se met à jour.

## Lancer le projet

Prérequis : Docker avec Compose.

```bash
git clone https://github.com/projets1700/ClickFast.git
cd ClickFast

# La configuration : copier le modèle et y mettre un vrai mot de passe
cp .env.example .env
# ... éditer .env ...

# Toute la stack en une commande : jeu, API de scores, stats, Postgres et Adminer
docker compose up -d --build
docker compose ps
```

| Service   | Adresse (ports par défaut du `.env.example`) |
| --------- | -------------------------------------------- |
| Le jeu    | http://localhost:8080                        |
| L'API     | http://localhost:3000/scores                 |
| Adminer   | http://localhost:8081 (système PostgreSQL, serveur `db`, identifiants du `.env`) |
| Les stats | http://localhost:8000/stats                  |
| Postgres  | non publié, joignable seulement depuis le network `clickfast-net` |

Arrêter : `docker compose down` (le volume `clickfast-pgdata` et donc les scores restent). `docker compose down -v` supprime aussi le volume, et tous les scores avec.

Si une variable obligatoire manque, l'API refuse de démarrer en la nommant : `docker compose logs api`.

Vérifier que tout répond : `docker compose run --rm smoke`. Ce test de fumée attend que le jeu, l'API et les stats soient `healthy`, interroge chacun, puis sort avec le code 0 (tout va bien) ou 1 (au moins un service ne répond pas).

### Sans le code source, depuis les images publiées

Les images sont sur Docker Hub : `arrow91/clickfast-front`, `arrow91/clickfast-api`, `arrow91/clickfast-stats-api`, en version `1.1.0` (la `1.0.0` reste disponible pour revenir en arrière). Dans un dossier qui ne contient que `docker-compose.prod.yml` et un `.env` rempli depuis `.env.example` :

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Les tests

Le jeu : ESLint, puis les tests du compteur de clics et du chrono avec Jest, sur un faux DOM (jsdom).

```bash
npm ci
npm run lint
npm test
```

L'API de scores : tests unitaires sans base, puis tests d'intégration contre un vrai PostgreSQL (variables `DB_*` pointant sur une base jetable).

```bash
cd api
npm ci
npm test                  # unitaires
npm run migrate           # crée le schéma sur la base DB_*
npm run test:integration  # intégration
```

### La pipeline

| Workflow | Déclencheur | Ce qu'il fait |
| -------- | ----------- | ------------- |
| `verify.yml` | toute pull request | lint, tests, `npm audit`, gitleaks sur tout l'historique, build de l'image du jeu (jamais publiée), résumé de sécurité |
| `release.yml` | push sur `main` | la même vérification, puis publication de `arrow91/clickfast-front:<sha>` après validation humaine (environnement `production`), scan Trivy, SBOM CycloneDX, résumé de sécurité |
| `api.yml` | push ou pull request touchant `api/` ou `deploy/` | tests unitaires et d'intégration ; sur `main` seulement : publication de `arrow91/clickfast-api:<sha>` puis déploiement sur `vm-prod` par le runner self-hosted |

Le badge en haut de cette page montre le résultat du dernier `release.yml` sur `main`.

### Tester l'application à la main

La stack lancée (`docker compose up -d --build`), voici les vérifications à faire, dans l'ordre :

| # | Test | Comment | Résultat attendu | Mon résultat |
| - | ---- | ------- | ---------------- | ------------ |
| 1 | Partie complète | http://localhost:8080, saisir un pseudo, cliquer pendant 5 s | Le chrono descend à 0, le bouton se bloque, le score part au classement | |
| 2 | Rejouer | Bouton **Rejouer** en fin de partie | Score et chrono remis à zéro, nouvelle partie possible | |
| 3 | Classement | http://localhost:3000/scores | Mon score apparaît, trié du meilleur au moins bon | |
| 4 | Stats | http://localhost:8000/stats | Meilleur score, nombre de parties et de joueurs corrects | |
| 5 | Contenu de la base | http://localhost:8081, serveur `db`, identifiants du `.env` | La table `scores` contient mes parties | |
| 6 | Base fermée | `Test-NetConnection localhost -Port 5432` (ou `nc -zv localhost 5432`) | Connexion refusée | |
| 7 | Scores persistants | `docker compose down` puis `docker compose up -d` | Les scores sont toujours là | |
| 8 | Base coupée | `docker compose stop db`, puis jouer une partie | Le jeu reste jouable et affiche « Non enregistré », sans bloquer | |
| 9 | Retour de la base | `docker compose start db`, puis rejouer | Le score est de nouveau enregistré, sans relancer l'API | |
| 10 | Smoke test | `docker compose run --rm smoke` | `Smoke test OK`, code de sortie 0 | |

## L'API de scores

| Route          | Rôle                                                         |
| -------------- | ------------------------------------------------------------ |
| `POST /scores` | Enregistre `{ "username": "Adam", "score": 42 }`, renvoie 201 |
| `GET /scores`  | Renvoie les 10 meilleurs scores                              |
| `GET /scores/:id` | Relit un score par son identifiant, 404 s'il n'existe pas |
| `DELETE /scores/:id` | Supprime un score, renvoie 204 (404 s'il n'existe pas)   |
| `GET /health`  | Renvoie `{ "status": "ok" }` (ne vérifie pas la base)         |
| `GET /metrics` | Mesures au format Prometheus : requêtes par méthode, route et code, durées, parties enregistrées |

Un pseudo vide ou de plus de 30 caractères, un score qui n'est pas un entier entre 0 et 200, ou un JSON cassé donnent un 400 avec le détail. Un corps de plus de 1 ko donne un 413. Base injoignable : 503 avec un message, jamais de stacktrace.

## La production : vm-prod

Une maquette de machine de production : un conteneur avec son propre Docker et un serveur SSH (`deploy/Dockerfile.vm`). Aucun code source dessus, seulement `/srv/clickfast/compose.yml`, son `.env` (copié une fois à la main, jamais dans git) et la config du monitoring.

```bash
ssh-keygen -t ed25519 -N "" -C "deploy@clickfast" -f deploy/deploy_key   # la privée reste hors de git
docker build -f deploy/Dockerfile.vm -t vm-prod deploy
docker run -d --privileged --name vm-prod --restart unless-stopped   -p 2222:22 -p 3000:3000 -p 9090:9090 -p 3001:3001   -v vm-prod-data:/var/lib/docker -v vm-prod-srv:/srv/clickfast vm-prod
```

| Service | Adresse |
| ------- | ------- |
| L'API de scores | http://localhost:3000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (utilisateur `admin`, mot de passe dans le `.env` de vm-prod) |

Un push sur `main` déploie tout seul. Pour tout le reste (déploiement d'urgence, retour arrière, pannes connues) : [la procédure de déploiement](docs/PROCEDURE_DEPLOIEMENT.md).

## Le service de stats

`GET /stats` sur le port 8000 renvoie `{ "best_score": …, "games_played": …, "distinct_players": … }` (meilleur score, nombre de parties, nombre de joueurs distincts). Aucune partie : 200 avec des zéros. Base injoignable : 503 avec un message.

## Structure

| Fichier         | Rôle                                                        |
| --------------- | ----------------------------------------------------------- |
| `index.html`    | La page : titre, compteur, chrono, boutons                  |
| `style.css`     | La mise en forme                                            |
| `script.js`     | La logique : comptage des clics et chrono                   |
| `Dockerfile`    | L'image de production : nginx épinglé, non-root             |
| `nginx.conf`    | La config nginx adaptée à un process sans root              |
| `.dockerignore` | Liste blanche des seuls fichiers envoyés au build           |
| `api/`          | L'API de scores (Express + PostgreSQL), avec son Dockerfile |
| `docker/`       | Script de démarrage du jeu qui génère `config.js`           |
| `.env.example`  | Modèle de configuration à copier en `.env` (jamais commité) |
| `stats-api/`    | Le service de stats en Python (FastAPI), avec son Dockerfile |
| `docker-compose.yml` | Toute la stack : jeu, API, stats, Postgres, Adminer    |
| `docker-compose.prod.yml` | La même stack depuis les images publiées sur Docker Hub |
| `scripts/mesure.sh` | Mesure des images pour le tableau ci-dessous          |
| `scripts/demarrage.sh` | Temps entre le `up -d` et le 1er 200 de chaque service |
| `scripts/latence.sh` | Ajoute une latence réseau à la base et mesure l'API et les stats |
| `script.test.js` | Les tests Jest du jeu                                     |
| `package.json`  | Les outils de test du jeu (Jest), hors de l'image           |
| `.github/workflows/` | La pipeline GitHub Actions : `verify.yml`, `release.yml`, `api.yml` |
| `eslint.config.js` | Les règles de style du jeu                                 |
| `api/test/`     | Tests de l'API : `unit/` sans base, `integration/` contre PostgreSQL |
| `deploy/`       | La production : `Dockerfile.vm`, `compose.yml`, monitoring (Prometheus, Grafana), `incident.sh` |
| `docs/PROCEDURE_DEPLOIEMENT.md` | La procédure de déploiement, pour l'astreinte |
| `scripts/charge-api.sh` | Génère du trafic sur l'API de vm-prod                  |

## Mesures des images

Obtenues avec `scripts/mesure.sh` sur Docker Desktop (Windows). Build froid : cache de build vidé et `--no-cache`, image de base déjà téléchargée. Build chaud : le même build relancé juste après. 1re réponse : du `docker run` au premier HTTP 200, en interrogeant toutes les 100 ms. Taille : espace disque affiché par `docker images` (la taille compressée, celle qui transite au pull, est indiquée entre parenthèses).

Première mesure, avant optimisation :

| Image | Taille | Couches (poids max) | Build froid / chaud | Temps 1re réponse HTTP |
| ----- | ------ | ------------------- | ------------------- | ---------------------- |
| clickfast (le jeu) | 92,7 Mo (26,1 Mo) | 12 (51,8 Mo) | 34,3 s / 10,3 s | 5,4 s |
| l'API de scores | 250 Mo (63,3 Mo) | 8 (167,0 Mo) | 40,3 s / 10,3 s | 5,6 s |
| stats-api | 232 Mo (55,2 Mo) | 9 (87,7 Mo) | 57,4 s / 9,1 s | 7,8 s |

Après optimisation (seule celle du jeu a été gardée, voir le journal de l'étape 9) :

| Image | Taille | Couches (poids max) | Build froid / chaud | Temps 1re réponse HTTP |
| ----- | ------ | ------------------- | ------------------- | ---------------------- |
| clickfast (le jeu) | 20,6 Mo (5,8 Mo) | 11 (9,1 Mo) | 32,5 s / 10,3 s | 5,2 s |
| l'API de scores | 250 Mo (63,3 Mo) | 8 (167,0 Mo) | 40,3 s / 10,3 s | 5,6 s |
| stats-api | 232 Mo (55,2 Mo) | 9 (87,7 Mo) | 57,4 s / 9,1 s | 7,8 s |

## Journal de bord

### Étape 1 : le jeu tourne

Départ sur les fichiers du repo du prof (`index.html`, `style.css`, `script.js`). Le HTML ne contenait que le titre, et `script.js` uniquement des consignes en commentaire : ajout du compteur, du chrono, du bouton de clic et du bouton Rejouer, puis de la logique JS. Le chrono démarre au premier clic et se base sur l'heure de fin (`Date.now()`) plutôt que sur un simple décompte, pour ne pas dériver si l'intervalle prend du retard. Une seconde vérification dans le clic empêche de compter un clic arrivé après la fin. Premier accroc : le titre utilisait une classe `flex` qui n'existe pas dans le CSS (seule `flex-center` existe), corrigé. Vérifié en ouvrant `index.html` : le score monte, se fige à 0.0 s, et Rejouer remet tout à zéro.

### Étape 2 : l'image du jeu, en Dockerfile de production

Point de départ mesuré avec un Dockerfile naïf (`FROM nginx:latest` + `COPY . /usr/share/nginx/html`, sans `.dockerignore`) : image de 241 Mo, contexte de build de 47 ko, et `ls -a` de la racine servie montrait `.git`, `README.md`, `Dockerfile` et le `50x.html` de l'image de base. `whoami` répondait `root`.

Corrections, une par commit :
- `FROM nginx:1.30.6-alpine` (dernière version de la branche stable) au lieu de `latest`. Image passée de 241 Mo à 92,7 Mo (26,1 Mo compressée au lieu de 63,9 Mo).
- `.dockerignore` en liste blanche (`*` puis `!index.html`, etc.) : un fichier ajouté plus tard au repo ne peut pas entrer dans l'image par oubli. Contexte retombé à environ 1 ko.
- `COPY` explicite des trois fichiers, et `RUN rm` du contenu par défaut de la racine : `ls -a` ne montre plus que `index.html`, `script.js`, `style.css`. En HTTP, `/.git`, `/README.md`, `/Dockerfile` et `/nginx.conf` renvoient 404.

Accroc du non-root : un simple `USER nginx` ajouté à la fin fait planter le conteneur au démarrage (`Exited (1)`) avec `mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)`. Origine : le maître nginx crée ses dossiers temporaires dans `/var/cache/nginx` et écrit son PID dans `/run`, deux dossiers qui appartiennent à root. Normalement le maître est root et seuls les workers passent en `nginx`. Parade retenue : un `nginx.conf` à nous qui met le PID et tous les `*_temp_path` dans `/tmp`, plutôt qu'un `chown` des dossiers de l'image de base. Le `default.conf` est supprimé et le server est déclaré dans notre config. Résultat : `whoami` répond `nginx`, et `docker top` montre que le maître comme les workers tournent sous l'UID 101 (affiché `statd` côté hôte, car l'UID 101 y porte ce nom).

Vérification : `docker run -d -p 8080:80 clickfast:1.0.0`, le jeu est jouable sur http://localhost:8080, chrono compris.

Temps de build (Docker Desktop sous Windows, plusieurs essais car les chiffres varient beaucoup) :

| Image                | Taille  | Build froid (`--no-cache`) | Build chaud |
| -------------------- | ------- | -------------------------- | ----------- |
| naïve (`latest`)     | 241 Mo  | 16 à 20 s                  | 10 à 12 s   |
| production (`1.0.0`) | 92,7 Mo | 30 à 32 s                  | 9 à 12 s    |

Surprise : le build à froid est plus lent en production. La cause est la ligne `RUN rm`, qui oblige Docker à démarrer un conteneur pendant le build, alors que la version naïve ne fait que des `COPY`. Le contourner demanderait de servir le site depuis un autre dossier que `/usr/share/nginx/html`, mais c'est justement ce dossier qui est vérifié. J'ai donc gardé le `RUN`. À chaud, toutes les couches sont `CACHED` (vérifié après une modification de `script.js` seul), et les environ 10 s restantes ne viennent pas des étapes du build : d'après `--progress=plain`, elles prennent moins de 7 s au total. Le reste est le surcoût de Docker Desktop.

### Étape 3 : l'API de scores et sa base

API Express avec deux routes (`POST /scores`, `GET /scores`) et une table `scores (id, username, score, created_at)` créée par l'API à son démarrage (`CREATE TABLE IF NOT EXISTS`). Image `node:24.22.1-alpine` épinglée, `USER node`, `.dockerignore` en liste blanche, et multi-stage : un premier stage fait `npm ci --omit=dev`, l'image finale ne récupère que ce `node_modules`. Mesuré contre une version en une seule étape avec `npm ci` complet : 250 Mo au lieu de 261 Mo, 81 modules au lieu de 107, et `nodemon` (dépendance de dev) absent de l'image finale.

Lancement de la base à la main, avec `postgres:18.6-alpine`. Accroc : depuis Postgres 18, le volume se monte sur `/var/lib/postgresql` et non plus sur `/var/lib/postgresql/data` comme dans la plupart des exemples en ligne.

```bash
docker run -d --name clickfast-db -e POSTGRES_USER=clickfast -e POSTGRES_PASSWORD=<ancien mot de passe> -e POSTGRES_DB=clickfast --mount source=clickfast-pgdata,target=/var/lib/postgresql -p 5432:5432 postgres:18.6-alpine
docker run -d --name clickfast-api -e DB_HOST=172.17.0.2 -e DB_PORT=5432 -e DB_USER=clickfast -e DB_PASSWORD=<ancien mot de passe> -e DB_NAME=clickfast -p 3000:3000 clickfast-api:1.0.0
```

IP interne utilisée : `172.17.0.2`, trouvée avec `docker network inspect bridge`. Étapes manuelles pour lancer la stack : 8 commandes (création du volume, run de la base, attente qu'elle soit prête, inspection du bridge pour l'IP, build et run de l'API, build et run du jeu), dont deux `docker run` à 6 et 7 options. Les identifiants étaient en clair dans ces commandes (masqués ici après coup, voir l'étape 5).

Persistance :
- `docker stop` puis `docker start` de la base : les 3 scores sont toujours là.
- `docker rm` puis `docker run` neuf sur le même volume nommé : les scores sont toujours là. Mais le nouveau conteneur a reçu l'IP `172.17.0.5` (j'avais occupé la `.2` avec un autre conteneur pour le vérifier) et l'API, qui visait toujours `.2`, renvoyait 503. Seule réparation : supprimer et relancer l'API avec la nouvelle IP, soit 2 commandes de plus.
- Sur un volume de test jetable : une table créée, conteneur supprimé, `docker volume rm`, nouveau conteneur sur un volume du même nom : `relation "t" does not exist`, la donnée a disparu pour de bon. Changer de conteneur ne perd rien, supprimer le volume perd tout.

`docker kill` sur Postgres pendant une rafale d'envois : le score envoyé avant le kill est enregistré (201), tous ceux d'après reçoivent un 503 `{"error":"Base de données indisponible, réessaie dans un instant"}` en 3 secondes maximum, et le conteneur de l'API reste `Up`. Deux réglages rendent ça possible : un `connectionTimeoutMillis` de 3 s (sans lui, la requête pendait), et un écouteur `pool.on("error")` (sans lui, une connexion cassée fait planter le process Node). Côté jeu, le `fetch` a aussi son propre délai de 5 s : la partie se termine normalement, le statut affiche « Score final : 20. Non enregistré : Base de données indisponible », et on peut rejouer.

Après `docker start` de la base tuée, elle est revenue avec encore une autre IP (`172.17.0.3`) : l'API ne la retrouve pas seule et réclame d'être relancée. C'est exactement la limite du bridge par défaut que l'étape 4 corrige.

### Étape 4 : le réseau isolé

```bash
docker network create clickfast-net
```

Nom retenu : `clickfast-net`, préfixé comme tous les objets du projet (`clickfast-db`, `clickfast-pgdata`…) pour les repérer d'un coup d'œil dans `docker network ls`. La base et l'API sont relancées dessus avec `--network clickfast-net`, sur le même volume (les 4 scores existants sont toujours là). L'API utilise maintenant `DB_HOST=clickfast-db` au lieu d'une IP : aucune ligne de code n'a changé, seulement la variable. `docker exec clickfast-api getent hosts clickfast-db` répond `172.19.0.2`, c'est le DNS interne du network custom qui résout le nom.

Le `-p 5432:5432` a disparu de la commande de la base : `docker ps` n'affiche plus que `5432/tcp` pour elle, au lieu de `0.0.0.0:5432->5432/tcp`. Depuis l'hôte, `nc` n'existe pas sous Windows, donc test fait avec PowerShell :

```
Test-NetConnection localhost -Port 5432   ->  TcpTestSucceeded : False
TcpClient localhost:5432                  ->  Aucune connexion n'a pu être établie car l'ordinateur cible l'a expressément refusée 127.0.0.1:5432
TcpClient localhost:3000                  ->  connexion ouverte (témoin : l'API, elle, est publiée)
```

Le jeu fonctionne toujours de bout en bout : partie à 33 clics, score enregistré, classement mis à jour.

Ce que le network custom règle par rapport à l'étape 3 : après un `docker restart` de la base, puis après un `docker rm` et un `docker run` neuf qui lui donne une autre IP (`172.19.0.4`), l'API répond 200 sans être relancée, puisqu'elle cherche un nom et plus une adresse. Il reste 8 commandes manuelles pour lancer la stack : `docker network create` prend la place de la recherche d'IP, et les relances de l'API à chaque changement d'IP disparaissent.

### Étape 5 : la configuration sort du code

Premier constat en commençant : le mot de passe de la base des étapes 3 et 4 était écrit en clair dans les commandes du README, donc poussé sur un repo public. Le supprimer du fichier ne suffit pas, il reste dans l'historique git pour toujours : il est considéré comme mort. Un nouveau mot de passe aléatoire de 32 caractères a été généré dans le `.env`, puis appliqué à la base avec `ALTER USER` (le volume existait déjà, et `POSTGRES_PASSWORD` n'est lu qu'à la toute première initialisation). Vérifié : l'ancien donne `password authentication failed`, le nouveau lit bien les 5 scores. Dans le journal de l'étape 3, l'ancien est remplacé par `<ancien mot de passe>`.

- `.env` (vraies valeurs) ajouté au `.gitignore`, vérifié avec `git check-ignore -v .env`. `git log --all -- .env` ne renvoie rien, et `git grep` ne trouve le nouveau mot de passe dans aucun fichier suivi.
- `.env.example` commité, mêmes clés avec des valeurs bidons (`DB_PASSWORD=change_moi`).
- Noms retenus : `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` pour l'API, plus `API_URL` pour le jeu. L'image Postgres attend `POSTGRES_USER` etc., donc la commande de la base fait le pont : `-e POSTGRES_PASSWORD="$DB_PASSWORD"`, après `set -a; . ./.env; set +a`. Aucune valeur n'est écrite dans la commande.
- L'API est lancée avec `--env-file .env`. Si `DB_HOST`, `DB_USER`, `DB_PASSWORD` ou `DB_NAME` manque, elle s'arrête tout de suite : `Variables d'environnement manquantes : DB_PASSWORD`, code de sortie 1, conteneur `Exited (1)`. Avant, elle aurait démarré, puis échoué à la première requête avec une erreur d'authentification beaucoup moins claire.
- Limite qui reste : `docker inspect clickfast-api` affiche toujours `DB_PASSWORD` en clair, c'est le propre d'une variable d'environnement. Les secrets Docker (`POSTGRES_PASSWORD_FILE`) régleraient ça. En revanche `docker history` des deux images ne contient aucun mot de passe : rien n'est passé en `ARG` ni en `ENV` au build.

L'URL de l'API dans le front : le JavaScript est livré tel quel au navigateur, il ne peut pas lire de variable d'environnement. Écrite en dur dans `script.js`, elle obligerait à reconstruire l'image pour chaque environnement, et l'image testée ne serait plus celle déployée. Traitement retenu : un script `docker/40-clickfast-config.sh`, lancé par l'entrypoint de l'image nginx juste avant le démarrage, écrit `/tmp/config.js` à partir de `API_URL`, et nginx le sert sur `/config.js`. Il est dans `/tmp` car c'est le seul endroit inscriptible par l'utilisateur `nginx`, et ça laisse la racine servie intacte (`ls -a` montre toujours seulement les 3 fichiers). Vérifié : la même image `clickfast:1.2.0` lancée avec `-e API_URL=https://api.clickfast.example` sert ce `config.js`-là, sans rebuild. Le jeu ne reçoit que `API_URL`, pas le `.env` complet, pour que les secrets de la base n'arrivent pas dans un conteneur qui n'en a pas besoin. Ce que ça implique : l'URL est publique par nature, tout joueur la lit dans son navigateur. Elle ne doit donc jamais contenir de secret, et l'API doit se protéger elle-même (validation des scores) puisque n'importe qui peut l'appeler.

Accroc évité : sous Windows, git peut convertir les fins de ligne en CRLF, et `sh` plante alors sur un script qui finit chaque ligne par `\r`. Un `.gitattributes` force `*.sh` en LF.

### Étape 6 : toute la stack dans un fichier

`docker compose up -d --build` démarre les 4 services : `front`, `api`, `db`, `adminer`. Tous sont sur `clickfast-net`, la base n'a aucun `ports`, et chaque valeur vient du `.env` par `${...}`. `docker compose config` montre le fichier final interpolé : pratique pour vérifier sans rien lancer. L'API attend la base avec `depends_on: condition: service_healthy`, et le healthcheck de la base est `pg_isready`.

Ajustements de noms entre le manuel et Compose :
- Services nommés `front`, `api`, `db`, `adminer`. Les conteneurs deviennent `clickfast-db-1` etc. (projet `clickfast` + service + numéro), au lieu des `clickfast-db` créés à la main.
- `DB_HOST` passe de `clickfast-db` à `db` : dans Compose, le nom DNS d'un service est le nom du service. C'est aussi `db` qu'on tape comme serveur dans Adminer.
- Network et volume gardent leurs noms grâce à `name: clickfast-net` et `name: clickfast-pgdata`. Sans ça, Compose les aurait préfixés (`clickfast_pgdata`) et serait reparti d'une base vide. Mais les objets créés à la main n'ont pas les étiquettes de Compose, qui râle dessus. Migration : sauvegarde du volume en `tar` avec un conteneur alpine (la méthode du cours), suppression des conteneurs, du network et du volume manuels, `docker compose create` pour que Compose crée les siens, restauration du `tar` dans le nouveau volume, puis `up`. Les 6 scores étaient bien là.
- Variables ajoutées au `.env.example` : `FRONT_PORT`, `API_PORT`, `ADMINER_PORT`, pour qu'aucun port publié ne soit écrit en dur. Les ports internes (80, 3000, 8080) restent dans le fichier car ils sont fixés par les images, pas par l'environnement.

Healthcheck : avec `interval: 2s`, le premier test réussi arrivait 5,0 s après le démarrage du conteneur, pile. Ce n'était pas Postgres : pendant `start_period`, Docker attend `start_interval`, 5 s par défaut, avant le premier test. Avec `start_interval: 1s`, Healthy arrive 1,9 à 2,3 s après le démarrage du conteneur, sans aucun test en échec avant. Vu depuis la commande `docker compose up`, il faut 14 à 15 s, mais la plus grosse part est la création du network et des conteneurs.

`docker compose ps` : `front`, `api`, `adminer` en `running`, `db` en `running (healthy)`, et seule `db` a un port non publié (`5432/tcp`). Partie jouée avec la stack : 41 clics, score enregistré, classement affiché. Depuis l'hôte, `Test-NetConnection localhost -Port 5432` donne toujours `False`. Adminer propose `db` par défaut (grâce à `ADMINER_DEFAULT_SERVER`), et une fois connecté avec les valeurs du `.env`, il liste la table `scores`.

Mot de passe commenté dans le `.env` : Compose prévient à chaque commande (`The "DB_PASSWORD" variable is not set. Defaulting to a blank string`) mais démarre quand même.
- `db` démarre `healthy` sans broncher : le volume est déjà initialisé, et `POSTGRES_PASSWORD` n'est lu qu'à la création de la base. Vérifié à part : sur un volume neuf, Postgres refuse avec `Database is uninitialized and superuser password is not specified`.
- `api` est le service qui refuse : `Variables d'environnement manquantes : DB_PASSWORD`. À cause de `restart: unless-stopped`, il reste en `Restarting (1)` et en était à 8 redémarrages au bout de 30 s. C'est voyant dans `docker compose ps`, mais c'est une boucle infinie : il faut lire les logs pour comprendre.
- `front` et `adminer` démarrent normalement, ils n'utilisent pas le mot de passe. Le jeu s'affiche, mais n'arrive pas à joindre l'API.
- Le message de l'API parlait encore de `--env-file` hérité de l'étape 5 : reformulé pour valoir aussi avec Compose. Ligne remise ensuite, tout repart.

Postgres seul arrêté pendant que la stack tourne (`docker compose stop db`) : `docker compose ps` ne liste même plus `db` (il faut `-a`). L'API répond 503 `Base de données indisponible` en 3 s. Le joueur finit sa partie normalement, voit « Score final : 25. Non enregistré : Base de données indisponible » et « Classement indisponible », et peut rejouer. Après `docker compose start db`, l'API retrouve la base toute seule : 0 redémarrage, même heure de démarrage, et la partie suivante est enregistrée. Le pool `pg` rouvre simplement de nouvelles connexions, et le nom `db` résout la nouvelle adresse.

### Étape 7 : le service de stats, en Python

Le code Python annoncé comme fourni n'était ni dans les PDF ni dans le repo du prof (aucun `.py`, toutes branches comprises). J'ai donc écrit un service équivalent dans `stats-api/` (FastAPI + psycopg 3) plutôt que de bloquer l'étape : à remplacer par le code officiel dès que je l'ai, le Dockerfile et le service Compose resteraient les mêmes.

- Constantes en haut de `main.py` alignées sur le schéma de l'étape 3 : `TABLE_NAME = "scores"`, `COLUMN_USERNAME = "username"`, `COLUMN_SCORE = "score"`.
- Variables lues : exactement celles de l'étape 5 (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). Vérifié avec un environnement qui parle de `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` : le service refuse de démarrer, `Variables d'environnement manquantes : DB_USER, DB_PASSWORD, DB_NAME`, code 1. Il échoue au démarrage plutôt qu'au premier appel, c'est encore plus franc.
- Image `python:3.14.9-slim`, versions figées dans `requirements.txt` (`fastapi==0.162.0`, `uvicorn==0.54.0`, `psycopg[binary]==3.3.6`) puisque pip n'a pas de lock file comme `npm ci`. `PYTHONUNBUFFERED=1` pour que les logs sortent dans `docker compose logs`, `pip install --no-cache-dir`, utilisateur `stats` (`whoami` répond `stats`), `.dockerignore` en liste blanche : `/app` ne contient que `main.py` et `requirements.txt`. Image de 232 Mo. Le premier build a pris 80 s, surtout le téléchargement de l'image Python et des paquets.
- Service `stats-api` dans le compose, construit depuis son dossier, sur `clickfast-net`, port publié `${STATS_PORT}` (variable ajoutée au `.env.example`, 8000 par défaut). `docker network inspect clickfast-net` liste bien les 5 conteneurs côte à côte : `adminer` `.5`, `db` `.2`, `api` `.3`, `front` `.4`, `stats-api` `.6`.

Vérifications :
- Chiffres contre la base : `/stats` renvoie `{"best_score":55,"games_played":8,"distinct_players":8}`, et `SELECT MAX(score), COUNT(*), COUNT(DISTINCT username) FROM scores` donne `55|8|8`.
- Table vide, sur une base jetable : 200 avec `0, 0, 0`. Même résultat quand la table n'existe pas encore (l'API ne l'a pas créée) : aucune partie jouée n'est pas une erreur. Sans `COALESCE`, `MAX` d'une table vide aurait renvoyé `null` et pas 0.
- Base arrêtée (`docker compose stop db`) puis tuée (`docker kill`) : 503 `{"error":"Base de données indisponible, réessaie dans un instant"}` en 4 s, aucun stacktrace côté client, et le service reste `Up`. Le détail est dans les logs du service : `failed to resolve host 'db'`. Les 4 s ne viennent pas du `connect_timeout=3` : le conteneur n'existant plus sur le network, c'est la résolution DNS du nom `db` qui échoue. Une fois la base relancée, les stats reviennent sans redémarrer le service, puisqu'il ouvre une connexion à chaque appel.

### Étape 8 : publier, puis redéployer depuis le registry

Connexion déjà faite dans Docker Desktop (compte `arrow91`). Avant de publier, contrôle des 3 images : le vrai mot de passe n'apparaît ni dans `docker history --no-trunc` ni dans les variables d'environnement des images. Une seule alerte sur les mots `password|secret|token|.env`, et c'était une fausse alerte : le script `15-local-resolvers.envsh` de l'image nginx officielle.

Séquence tapée à la main, celle que la pipeline rejouera demain :

```bash
docker compose build
docker tag clickfast-front:local     arrow91/clickfast-front:1.0.0
docker tag clickfast-api:local       arrow91/clickfast-api:1.0.0
docker tag clickfast-stats-api:local arrow91/clickfast-stats-api:1.0.0
docker push arrow91/clickfast-front:1.0.0
docker push arrow91/clickfast-api:1.0.0
docker push arrow91/clickfast-stats-api:1.0.0
```

Digests publiés : front `sha256:9b4eac848eb9…`, api `sha256:f821f5c00742…`, stats-api `sha256:c4eec141c8d5…`. Accroc : un premier essai de push n'avait rien envoyé, et je l'ai vu parce que `docker buildx imagetools inspect arrow91/clickfast-front:1.0.0` répondait `not found`. Un push se vérifie côté registry, pas seulement dans son terminal.

Version explicite `1.0.0` partout : `docker tag arrow91/clickfast-api:1.0.0 arrow91/clickfast-api`, sans tag, crée bien `arrow91/clickfast-api:latest`. Poussé, ce `latest` écraserait sans prévenir celui qu'un autre utilise. Tag local supprimé, jamais poussé.

`docker-compose.prod.yml` : copie de `docker-compose.yml` où les trois `build:` deviennent `image: arrow91/clickfast-…:1.0.0`. `diff` entre les deux fichiers : seulement ces lignes et le commentaire d'en-tête.

Test du dossier vide : un dossier avec uniquement `docker-compose.prod.yml` et `.env`, et toutes les images ClickFast supprimées de la machine avant (anciennes versions manuelles comprises, car elles partagent des couches avec les nouvelles et auraient faussé le test), plus le cache de build vidé. `docker compose -f docker-compose.prod.yml up -d` télécharge les 3 images depuis Docker Hub, et la stack complète est `running` en 47 s, base `healthy`. Partie jouée : 44 clics enregistrés, classement à jour, `/stats` à 10 parties. `docker history` sur les images téléchargées : aucun mot de passe, aucun `ARG` ni `ENV` de secret.

### Étape 9 : mesurer, puis optimiser

Le tableau est dans la section « Mesures des images ». Tout est mesuré par `scripts/mesure.sh`, pour que chaque chiffre puisse être rejoué. Le temps de 1re réponse vient d'une boucle `curl` toutes les 100 ms après le `docker run`, jusqu'au premier 200.

Trois pièges de mesure rencontrés, avant même d'optimiser :
- Le build chaud de l'API sortait à 63,7 s, autant qu'à froid. Aucune étape n'était `CACHED` : une mesure précédente que j'avais interrompue tournait encore, et son `docker builder prune` vidait le cache en plein milieu. Mesures refaites ensuite, sans rien en parallèle.
- Le premier build froid de stats-api comptait aussi le téléchargement de `python:3.14.9-slim`. Cette image n'existait que dans le cache de BuildKit, que `builder prune` vide, alors que les images de base des deux autres étaient dans les images locales. Une fois l'image tirée avec `docker pull`, son build froid passe de 65,1 s à 57,4 s.
- Docker Desktop varie beaucoup : un `docker run` d'Alpine qui ne fait rien prend déjà plusieurs secondes. Les temps de démarrage du tableau (5 à 8 s) sont mesurés juste après des builds, sur une machine chargée. Pour comparer avant et après, j'ai donc relancé les images d'avant (`arrow91/*:1.0.0`) et d'après en alternance, 5 fois chacune, dans les mêmes conditions : médianes de 3 à 6 s.

Cibles fixées après la première mesure, image par image :
- Le jeu, cible sous 30 Mo : le site fait 3 fichiers de quelques ko, tout le reste est nginx. La variante `nginx:1.30.6-alpine-slim` est le même nginx sans les modules njs et acme, inutiles pour un site statique. Son image de base fait 5,7 Mo compressés.
- L'API, cible 200 Mo : la plus grosse couche (167 Mo) est l'image node, qui contient npm (18 Mo), yarn (5 Mo) et des en-têtes C (6,6 Mo) qui ne servent qu'à installer. Seul le binaire `node` (126 Mo) sert à l'exécution.
- stats-api, cible 130 Mo : `python:3.14.9-alpine` est 2 fois plus léger que `slim` (17,8 Mo compressés contre environ 40), et psycopg publie des wheels pour Alpine, donc rien à compiler.

Résultats :
- Le jeu : de 92,7 Mo à 20,6 Mo (26,1 à 5,8 Mo compressés, 4,5 fois moins à chaque pull), plus lourde couche de 51,8 à 9,1 Mo. Builds et démarrage inchangés (2,9 s contre 3,0 s en médiane sur 5 essais alternés). Cible atteinte, gardé.
- L'API : image finale sur `alpine:3.24.3` (la même version que celle de l'image node), avec seulement `libstdc++` et le binaire `node` copié du premier stage. Résultat : 205 Mo, 54,4 Mo compressés, démarrage identique. Mais le build froid passe d'environ 41 s à environ 57 s (médianes sur 3 essais alternés). Deux raisons : `apk add` va chercher `libstdc++` sur le réseau (5,4 s), et la couche de 126 Mo du binaire, copiée dans une image neuve, doit être recompressée à chaque build alors qu'une couche de l'image de base est simplement réutilisée. Pour 9 Mo de moins à chaque pull, c'est +16 s par build froid, soit environ 13 minutes de calcul en plus par jour à 50 builds. Écarté, Dockerfile remis comme avant. Cible ratée, et c'est le bon choix.
- stats-api : sur Alpine, 125 Mo (cible atteinte), mais le démarrage passe de 5,0 s à 5,9 s en médiane sur 5 essais alternés, et chaque essai Alpine est plus lent que son voisin `slim`. Python charge ses modules plus lentement avec la bibliothèque C d'Alpine (musl) qu'avec celle de Debian (glibc). La consigne dit qu'une optimisation qui fait régresser le démarrage n'est pas acquise : écarté, retour à `slim`.

Les optimisations déjà en place depuis les étapes 2 et 3 sont restées : `COPY` des fichiers de dépendances avant le code (vérifié : après une modification du seul code, toutes les étapes d'installation sont `CACHED`), multi-stage de l'API sans les dépendances de dev, `.dockerignore` en liste blanche pour les trois images (aucun fichier inattendu trouvé).

Les trois vérifications sur l'optimisation gardée (le jeu) :
- Build froid qui aboutit après nettoyage : fait avec `docker builder prune -af` et `--no-cache`, et pas avec `docker system prune`. Ce dernier aurait aussi supprimé les conteneurs arrêtés, les réseaux et les images inutilisés de mes autres projets sur la machine. `builder prune` vide exactement ce qui rend un build froid : le cache de build.
- Démarrage : pas de régression (voir plus haut).
- Ni secret ni fichier de test : la racine servie ne contient que `index.html`, `script.js` et `style.css`, `find` ne trouve ni `.env`, ni `.git`, ni `*.test.js` dans l'image, et le mot de passe n'apparaît pas dans `docker history`.

Jusqu'où descendre : j'ai arrêté le jeu à `alpine-slim`. L'étape d'après serait une image sans shell (distroless ou `scratch`), mais le script qui génère `config.js` au démarrage a besoin de `sh`, et un `docker exec … sh` ne serait plus possible pour dépanner. Pour 5,8 Mo compressés, il n'y a plus grand-chose à gagner.

Le vrai coût d'un build froid à 50 builds par jour : 32,5 s × 50 = 27 minutes pour le jeu, 40,3 s × 50 = 34 minutes pour l'API, 57,4 s × 50 = 48 minutes pour stats-api. Soit presque 2 heures de calcul par jour si les trois images repartent de zéro à chaque fois, contre environ 25 minutes avec le cache (environ 10 s par build chaud). Le cache de build dans la pipeline vaut donc à lui seul 1 h 30 de calcul par jour.

La stack complète a été relancée avec le jeu optimisé : partie à 39 clics enregistrée.

### Étape 10 : le test qui rejoue toute la journée

Dossier neuf avec uniquement `docker-compose.prod.yml` et un `.env` reconstruit depuis `.env.example` (mêmes clés, vérifié avec un `diff`). Les images `arrow91/*` ont été supprimées de la machine avant. `docker compose -f docker-compose.prod.yml up -d` les télécharge depuis Docker Hub, et la stack est `running` en 42 s, base `healthy`.

Piège noté en préparant le `.env` : le fichier prod fixe le nom du volume (`clickfast-pgdata`). Sur une machine qui a déjà ce volume, un `.env` avec un autre mot de passe ne marche pas : la base est déjà initialisée avec l'ancien, et `POSTGRES_PASSWORD` n'est plus lu. J'ai rempli le `.env` avec les vraies valeurs plutôt que d'effacer les scores pour simuler une machine vierge.

1. Partie jouée jusqu'au bout, avec le `script.js` réellement servi par l'image publiée (identique octet par octet à celui du repo) : 47 clics, score enregistré, classement affiché.
2. Scores invalides, tous refusés par un 400 avec le détail : champ manquant (`username` ou `score`), objet vide, score négatif, score de 999 999 999, score décimal (3.5), score en texte (`"42"`), pseudo fait d'espaces, pseudo de 100 caractères, JSON cassé. L'API reste debout, 0 redémarrage, jamais de stacktrace. Un pseudo `<script>alert(1)</script>` est accepté (201) : c'est un pseudo valide de moins de 30 caractères, et le jeu l'affiche avec `textContent`, donc comme du texte et jamais comme du HTML.
   **Bug trouvé** : un corps de 5 ko (au-delà de la limite de 1 ko) renvoyait `503 Base de données indisponible`, alors que la base n'y était pour rien. Le gestionnaire d'erreurs de l'API transformait en 503 toute erreur autre qu'un JSON cassé. Corrigé : les erreurs du client gardent leur code (413 `Requête trop volumineuse`, 415 pour un encodage inconnu), et seul le reste devient un 503. La correction est dans le code, mais pas encore dans l'image publiée `1.0.0` : il faut publier une nouvelle version, sinon la prod garde le bug.
3. Port de la base depuis l'hôte : `Test-NetConnection localhost -Port 5432` donne `False`, alors que 3000 et 8000 donnent `True`.
4. Stats contre un `COUNT` manuel : `{"best_score":55,"games_played":13,"distinct_players":13}` et `55|13|13`. Comme chaque test avait pris un pseudo différent, j'ai ajouté une 2e partie pour `Adam`, pour vérifier que les deux compteurs se séparent bien : `14` parties pour `13` joueurs des deux côtés.
5. Base tuée (`docker kill`) en pleine partie : le joueur finit sa partie, puis voit « Score final : 33. Non enregistré : Base de données indisponible ». L'API et les stats répondent 503 avec un message en 3 s et 3,9 s, et aucun service ne plante (0 redémarrage). Rien ne s'écroule en silence.

Pour aller plus loin :
- Retour à la normale après `docker compose start db` : base `healthy` en 4,8 s, API de nouveau en 200 en 5,0 s, stats en 5,4 s. Aucun service à relancer, et la partie suivante est enregistrée.
- Après le `docker kill`, la base est restée `Exited (137)` malgré `restart: unless-stopped`. Un `docker kill` est un arrêt voulu pour Docker, qui ne relance pas le conteneur. Pour un vrai crash (Postgres arrêté brutalement de l'intérieur, `pg_ctl stop -m immediate`), Docker relance le conteneur tout seul (`RestartCount` passe à 1), la base est `healthy` en 6,0 s, l'API répond en 6,2 s, et les données sont intactes après la reprise de Postgres.

Suite, faite après coup :
- Temps de démarrage depuis les images publiées, mesuré avec `scripts/demarrage.sh` (du `up -d` jusqu'au 1er 200 de chaque service, toutes les 100 ms). À froid, sur une machine sans aucune image du projet (j'ai d'abord supprimé les images ClickFast, celles de mes essais de l'étape 9 et les images de base) : 107 s pour que les trois services répondent, dont environ 86 s de téléchargement. À chaud, images déjà là : de 18,4 à 19,5 s sur 3 essais. Le service répond à peine 0,1 à 0,6 s après le retour du `up -d` : presque tout le temps est pris par Docker Desktop pour créer le network et les conteneurs, pas par les services.
- Latence artificielle entre la base et le reste, avec `scripts/latence.sh` : `tc qdisc add dev eth0 root netem delay …` lancé dans un conteneur jetable qui partage l'interface réseau de la base (`--net container:clickfast-db-1 --cap-add NET_ADMIN`). L'image de la base n'est pas modifiée. 3 essais par délai :

  | Délai ajouté | POST /scores | GET /scores | GET /stats |
  | ------------ | ------------ | ----------- | ---------- |
  | 0 ms | 201 en 0,05 à 0,7 s | 200 en 0,01 s | 200 en 0,02 s |
  | 200 ms | 201 en 0,8 à 1,9 s | 200 en 0,21 s | 200 en 1,6 s |
  | 1 000 ms | 503 en 3,0 à 3,3 s | 503 en 3,0 s | 503 en 3,0 s |
  | 2 000 ms | 503 en 3,0 s | 503 en 3,0 s | 503 en 3,0 s |

  À 200 ms, `GET /scores` ne prend qu'un aller-retour : l'API réutilise une connexion déjà ouverte de son pool. Les stats ouvrent une connexion neuve à chaque appel, et l'ouverture d'une connexion Postgres (TCP, démarrage, authentification) coûte environ 8 allers-retours : 1,6 s. À partir de 1 s de délai, ouvrir une connexion dépasse les 3 s de `connectionTimeoutMillis` (API) et de `connect_timeout` (stats) : tout le monde répond 503 au bout de 3 s, jamais de requête qui pend. Une fois le délai retiré, tout revient à la normale sans rien relancer. Ce que j'en retiens : pour les stats, une connexion par requête coûte cher dès que la base est loin. Un pool de connexions, comme côté API, serait la prochaine amélioration.
- Un 4e service qui dépend des autres : `smoke`, un test de fumée sur `alpine:3.24.3` qui interroge le jeu, l'API (`/health` et `/scores`) et les stats, puis sort en 0 ou en 1. Il dépend des trois services avec `condition: service_healthy`, ce qui m'a fait ajouter un healthcheck à chacun (`wget` de busybox pour le jeu et l'API, Python pour stats-api, dont l'image slim n'a ni `curl` ni `wget`). Il est dans le profil `test` : un simple `up` ne le lance pas, on le lance avec `docker compose run --rm smoke`. Premier accroc : le healthcheck du jeu sur `http://localhost/` échouait (`Connection refused`). Dans le conteneur, `localhost` vise d'abord l'adresse IPv6 `::1`, et nginx n'écoute qu'en IPv4. Corrigé avec `127.0.0.1`. Résultats : depuis un `up -d`, le smoke test attend que tout soit healthy puis passe en 7,4 s. Base arrêtée : l'API reste `healthy` (son `/health` ne touche pas la base), mais le smoke test échoue sur le 503 de `/scores` et sort en 1. C'est la différence entre « le process tourne » et « le service marche ». Les images ne changent pas, seuls les deux fichiers compose bougent : pas besoin de republier.

Ménage : les scores de test (25 lignes, toutes issues de mes essais) sont supprimés avec `TRUNCATE scores RESTART IDENTITY`, la table reste. Les copies du `.env` et la sauvegarde du volume de l'étape 6, laissées dans des dossiers temporaires, sont supprimées, comme les images de test de l'étape 9.

### Publication de la version 1.1.0

Le test de l'étape 10 a trouvé un bug (faux 503 sur un corps trop gros) qui n'était corrigé que dans le code, et l'optimisation du jeu (étape 9) n'était pas non plus publiée : la prod tournait encore avec les images `1.0.0`. Publication d'une `1.1.0` des trois images, après la même vérification qu'à l'étape 8 (aucun mot de passe ni `ARG`/`ENV` de secret dans `docker history` ni dans les variables des images) :

| Image | Digest | Changement |
| ----- | ------ | ---------- |
| `arrow91/clickfast-front:1.1.0` | `sha256:b516357f6362…` | `nginx:1.30.6-alpine-slim`, 20,6 Mo au lieu de 92,8 |
| `arrow91/clickfast-api:1.1.0` | `sha256:69ce6a66d08a…` | 413 au lieu d'un faux 503 pour un corps trop gros |
| `arrow91/clickfast-stats-api:1.1.0` | `sha256:d74055a0d15a…` | aucun (même version que le reste de la stack) |

Les trois digests sont vérifiés côté registry avec `docker buildx imagetools inspect`. `docker-compose.prod.yml` passe de `1.0.0` à `1.1.0`, rien d'autre ne change. Les images `1.0.0` restent sur Docker Hub : revenir en arrière, c'est remettre `1.0.0` dans le fichier et relancer, sans rien reconstruire. C'est l'intérêt d'un tag par version plutôt que `latest`.

Test dans le dossier neuf, après suppression des images `arrow91/*` locales : les trois images `1.1.0` sont téléchargées, la stack est `running`, base `healthy`. Corps de 5 ko : 413 `Requête trop volumineuse`. Score de 999 : toujours un 400. Partie jouée avec le `script.js` servi : 42 clics enregistrés, stats à 17 parties pour 16 joueurs, base toujours injoignable depuis l'hôte. Le temps de démarrage n'a pas pu être mesuré : la machine s'est mise en veille pendant le téléchargement.

### Jour 2, phase 0 : la première pipeline verte

Tests Jest sur un faux DOM (jsdom), avec les mêmes `id` que `index.html`. `script.js` lit le DOM dès son chargement : chaque test recrée le faux DOM puis recharge le script avec `jest.resetModules()`, sinon l'état d'une partie (score, chrono) déborde sur le test suivant. Le chrono est testé avec les faux timers de Jest, qui avancent aussi `Date.now()` : 5 secondes de jeu prennent quelques millisecondes de test, et le résultat ne dépend pas de la vitesse de la machine. `fetch` est remplacé par un faux qui renvoie un classement vide : les tests ne dépendent pas de l'API.

7 tests : un clic, plusieurs clics, décompte du chrono, arrêt à 0 avec bouton désactivé, aucun clic compté après la fin, score envoyé à l'API, Rejouer. Pour vérifier qu'ils testent vraiment quelque chose, j'ai faussé le compteur (`count += 2` au lieu de `count++`) : 5 tests sur 7 passent au rouge, puis 7 sur 7 au vert une fois le code remis.

Pour que Jest puisse importer les fonctions, `script.js` les exporte dans un bloc `if (typeof module !== "undefined")`. Le navigateur n'a pas de `module`, il ignore donc ce bloc. L'image ne change pas : `package.json`, `node_modules` et les tests ne sont pas dans la liste blanche du `.dockerignore`.

Pipeline `ci.yml`, déclenchée à chaque push et pull request : un job `test` (`npm ci` puis `npm test`), puis un job `build` relié par `needs: test`, qui construit l'image seulement si les tests sont verts. Premier run vert : 26 s au total, dont 12 s pour `test` (4 s de `npm ci`, 1 s de tests) et 7 s pour `build`.

### Jour 2, phase 1 : lint puis test

ESLint 10, avec `@eslint/js` (règles recommandées) et `@stylistic/eslint-plugin` pour le point-virgule obligatoire et les guillemets doubles. À sa première exécution, il a trouvé 2 vrais défauts dans `script.js` : en relançant une erreur réseau, le code perdait l'erreur d'origine (règle `preserve-caught-error`). Corrigé avec `{ cause: err }` dans son propre commit, avant d'écrire le workflow. Pipeline en deux jobs reliés par `needs:` : `lint` (12 s), puis `test` (14 s), qui ne démarre qu'après lui. Run de 39 s.

Cas limite et cas adverse (fichier mal stylé qui bloque `test`, branche renommée qui ne déclenche rien) : à faire.

### Jour 2, phase 2 : une image taguée au sha

Job `build-and-push`, sur `main` seulement, après `test`. Connexion par `docker/login-action` avec les secrets `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN`, publication par `docker/build-push-action`, tag `${{ github.sha }}`. Hors de `main`, un job `build` construit l'image sans la publier. Premier run : `arrow91/clickfast-front:9a49f4913f9c…` est sur Docker Hub, 5,75 Mo compressés, en 75 s de run. Le jeton Docker Hub est un jeton dédié (Read & Write), pas celui que Docker Desktop génère pour lui-même, qui a aussi le droit Delete.

Cas adverse (secret mal orthographié qui ne fait échouer que `build-and-push`) : à faire.

### Jour 2, phase 3 : mesurer avant d'optimiser

| Run | Durée totale | Job `test` | dont `npm ci` | Image publiée |
| --- | ------------ | ---------- | ------------- | ------------- |
| Avant cache (phase 2) | 75 s | 11 s | 5 s | 5,75 Mo compressés |
| Après cache, 1er run | 67 s | 15 s | 4 s | 5,75 Mo |
| Après cache, relancé | 54 s | 12 s | 2 s | 5,75 Mo |
| Après cache, relancé | 58 s | 11 s | 2 s | 5,75 Mo |

Le cache marche : le log dit `Cache hit` et `Cache restored`, 14 Mo. Au 1er run, `lint` a créé le cache et `test`, qui passe juste après, l'a déjà trouvé. Mais l'écart est presque nul. `npm ci` gagne 2 à 3 s, et la restauration du cache en coûte 1 de plus dans `setup-node` : le job `test` reste à 11-12 s. Ce projet n'a que 14 Mo de dépendances de dev. L'écart sur la durée totale vient surtout de `build-and-push` (43 s puis 23 à 29 s), pas du cache npm. Ce n'est donc pas un cache mal configuré, c'est un cache qui n'a presque rien à faire ici.

### Jour 2, phase 4 : npm audit et gitleaks

Job `security-deps`, en parallèle de `lint` et `test` : `npm audit --audit-level=high` (0 vulnérabilité), puis gitleaks. Premier accroc : `gitleaks/gitleaks-action` n'avait relu qu'**1 commit** (`--log-opts=-1` dans le log). Sur un push, l'action ne scanne que les commits poussés : un secret supprimé deux commits plus tôt lui aurait échappé, alors que c'est précisément ce que la phase doit attraper. Remplacée par la CLI gitleaks 8.30.1 (image épinglée sur son digest), qui relit les 87 commits. Aucune fuite trouvée.

Ce qu'on en retient : notre ancien mot de passe de base, `clickfast_pwd` (révoqué au jour 1), apparaît 11 fois dans l'historique, et gitleaks ne le voit pas. Il cherche des formes connues de jetons et des chaînes très aléatoires, pas un mot de passe simple. Un scan vert ne prouve pas qu'il n'y a aucun secret.

La publication attend aussi `security-deps` : une dépendance vulnérable bloque l'image. Cas normal et cas limite (dépendance vieillie, faux secret ajouté puis supprimé) : à faire.

### Jour 2, phases 5 à 7 : Trivy, SBOM, résumé

| Commit | HIGH / CRITICAL (Trivy) | Paquets dans le SBOM |
| ------ | ----------------------- | -------------------- |
| `5155ec2` | 0 / 0 | 22 (21 paquets Alpine + le système) |

- Trivy (action épinglée sur le commit de sa v0.36.0, pas sur un tag déplaçable) scanne le tag qui vient d'être publié, et bloque sur HIGH et CRITICAL, le même seuil que `npm audit`.
- Le SBOM CycloneDX 1.6 de Syft se télécharge depuis l'onglet Actions. Il annonçait 468 composants : 446 sont des fichiers de l'image, et seuls 22 sont des paquets. Le résumé compte maintenant les paquets.
- Le résumé de sécurité dépend des quatre jobs avec `if: always()`. Une valeur absente (job sauté ou planté) s'affiche « non mesuré », jamais 0. Il a répondu « publiable en confiance » sur `5155ec2`.

Cas limite (vieille image nginx qui doit remonter des CVE) et cas adverse : à faire.

### Jour 2, phase 8 : validation humaine

Environnement `production` avec `projets1700` comme reviewer obligatoire, rattaché à `build-and-push`. Sur `5155ec2`, le job est resté « waiting » de 13:13 à 13:22 UTC (9 minutes), puis a été approuvé par `projets1700`. Ensuite, publication, Trivy, SBOM et résumé ont suivi.

Cas adverse (un second compte, non reviewer, ne voit aucun bouton « approve ») : à faire avec un camarade.

### Jour 2, phase 9 : vérifier ou publier

`verify.yml` sur toute pull request : lint, tests, `security-deps`, build sans publication, résumé. `release.yml` sur un push vers `main` : la chaîne complète jusqu'à la publication protégée. Les jobs communs sont répétés dans les deux fichiers, mais les déclencheurs ne se recouvrent jamais. Le badge pointe sur `release.yml`.

Un vrai rouge sur `main`, juste après ce découpage : le Jest du jeu, lancé à la racine, ramassait aussi les tests de l'API (`api/test/`), dont `supertest` n'est installé que dans `api/`. Résultat : `test` rouge, et `build-and-push`, `security-image` et `sbom` sautés, donc rien de publié. Le fail fast a fait son travail. Correction en un commit : `testPathIgnorePatterns` exclut `api/` et `stats-api/`. Run rouge terminé à 14:25, correction poussée à 14:39 : 14 minutes entre le constat et la correction.

Cas normal, limite et adverse (une PR lance `verify.yml` et jamais `release.yml`, branche `master`) : à faire.

### Jour 2, phase 10 : casser main

À faire : casser un test sur une branche, ouvrir la pull request, la fusionner malgré `verify.yml` rouge, observer `release.yml` échouer sur `main`, puis corriger et rendre `verify.yml` obligatoire dans les règles de la branche `main`.

### Jour 3, phase 1 : la pipeline de l'API

`server.js` découpé : `db.js` (variables obligatoires et pool), `validation.js`, `schema.js`, `app.js` (l'app Express, créée avec son pool, donc testable avec supertest) et `migrate.js`. Workflow `api.yml` : tests sur toute branche, image `arrow91/clickfast-api:<sha>` sur `main` seulement. Premier run sur `main` : `test` (13 s) et `test-integration` (20 s) en parallèle, puis `build-and-push` (25 s). L'image `36ad32f6d03c…` est sur Docker Hub.

### Jour 3, phase 2 : la machine cible

La ligne `deploy/deploy_key` est entrée dans le `.gitignore` dans son propre commit, avant que la clé existe. `Dockerfile.vm` part de `docker:28.5.2-dind`, avec openssh, la seule clé publique autorisée, et la connexion par mot de passe désactivée. Un `.dockerignore` propre à ce Dockerfile ne laisse entrer que `deploy_key.pub` dans le contexte : la clé privée n'est même pas envoyée au build. Premier accroc : `vm-prod` publie le port 3000, déjà pris par la stack de dev, qu'il faut arrêter avant. Le `.env` de production est créé directement sur la machine, avec des mots de passe tirés au hasard sur place : ils ne sont jamais passés par le poste. Connexion SSH avec la clé : un shell dont `docker ps` est vide, aucun conteneur du poste visible.

Cas adverses (connexion sans la clé refusée, redémarrage qui garde les images grâce au volume) : à faire.

### Jour 3, phases 3 et 4 : le runner chez nous, et le job qui déploie

Runner self-hosted `poste-DESKTOP-FP8039E` (agent 2.338.2, empreinte SHA-256 vérifiée). Seul le job `deploy` tourne dessus, et seulement sur un push vers `main`. Premier accroc : sur ce poste, `bash` désigne WSL, pas Git Bash. Le job ajoute donc `C:\Program Files\Git\usr\bin` au `PATH` (ssh, scp, ssh-agent) avant ses étapes. La clé privée passe par `ssh-agent`, en mémoire, sans être écrite sur le disque. Adresse, port et utilisateur viennent des secrets, par un fichier de config SSH temporaire.

Premier déploiement automatique : 6 min 12 s pour le job `deploy`, dont environ 3 min 30 s de téléchargement des images Postgres, Prometheus et Grafana, que vm-prod n'avait jamais vues. À la fin, `{"status":"ok"}` et `scores-api arrow91/clickfast-api:36ad32f… (healthy)`. Run complet de l'API : 9 min 35 s.

Cas limite et adverse (job `Queued` quand le runner est arrêté, branche qui ne déploie pas, secret mal orthographié) : à faire.

### Jour 3, phase 5 : rejouer, et revenir en arrière

À faire, avec la commande de la procédure : un second déploiement identique (la durée de référence d'un déploiement à images déjà présentes), puis une régression volontaire et le retour arrière chronométré. Ce retour se fait avec `PREVIOUS_TAG`, que le job `deploy` écrit à chaque déploiement.

### Jour 3, phase 6 : les tests qui touchent la base

Nouvelles routes `GET` et `DELETE /scores/:id`. Un identifiant qui n'est pas un entier positif est refusé en 400 avant d'interroger la base. Le job `test-integration` lance `postgres:18.6-alpine` en `services:`, avec un `pg_isready` comme contrôle de santé, joue `npm run migrate`, puis 5 tests : enregistrer puis relire par l'id (et vérifier en SQL que c'est vraiment en base), 404 sur un id absent, 400 sur un corps invalide sans rien écrire, suppression qui disparaît du classement, et classement trié et limité à 10. `TRUNCATE` avant chaque test : aucun test ne dépend d'un autre. 5 sur 5 verts. Les tests unitaires (22) tournent avec un faux pool qui échoue s'il est appelé, ce qui prouve qu'ils ne touchent pas la base.

### Jour 3, phase 7 : rendre l'API mesurable

`/metrics` avec prom-client : `http_requests_total` et `http_request_duration_seconds` par méthode, route et code, et `clickfast_scores_recorded_total`, le nombre de parties enregistrées depuis le démarrage. Le label de route est la route déclarée (`/scores/:id`), jamais l'identifiant. Une requête qui ne correspond à aucune route (404, JSON cassé rejeté avant le routage) est rangée sous `route="unmatched"` : comptée, sans créer une série par URL. Testé : 3 appels à `/health` font monter le compteur de 3 exactement, et deux URL inconnues différentes tombent dans la même série.

### Jour 3, phase 8 : Prometheus et Grafana

Ajoutés au `compose.yml` de vm-prod. Prometheus scrape `scores-api:3000` toutes les 5 s. Grafana (port 3001) a sa source de données `http://prometheus:9090` et son tableau de bord, versionnés dans `deploy/monitoring` et envoyés par la pipeline. 4 panneaux pour les golden signals, plus un panneau métier :
- Disponibilité : `up` ;
- Trafic : `rate` par route ;
- Erreurs : part de 5xx ;
- Latence : p95 ;
- Parties enregistrées depuis le démarrage.

Le scrape de `/metrics` lui-même est exclu du trafic : sinon le tableau afficherait 0,2 requête par seconde sans aucun joueur.

| Moment | up | Requêtes/s | Taux d'erreur | p95 |
| ------ | -- | ---------- | ------------- | --- |
| Au repos, avant la boucle de charge | à relever | | | |
| Pendant `scripts/charge-api.sh` | à relever | | | |
| Pendant l'incident de la phase 10 | à relever | | | |

### Jour 3, phase 9 : la procédure

`docs/PROCEDURE_DEPLOIEMENT.md` contient :
- les accès nécessaires et l'état des lieux ;
- le déploiement par la pipeline et le déploiement d'urgence à la main, une vérification après chaque étape ;
- le retour arrière avec sa table de décision ;
- 12 pannes connues avec leur signature dans le tableau de bord, dont les 5 de `incident.sh` et le piège « l'API est `healthy` mais hors de son réseau ».

La relecture par quelqu'un qui ne connaît pas le projet reste à faire.

### Jour 3, phase 10 : la passation

À faire en binôme : `ssh -i deploy/deploy_key -p 2222 root@localhost 'sh -s' < deploy/incident.sh`. Puis deux entrées (le pilote et les mains) : le panneau le plus utile, la ligne de procédure qui a manqué, et le temps entre la panne et le rétablissement.
