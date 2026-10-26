# ClickFast

Jeu de rapidité : il faut cliquer le plus de fois possible sur un bouton en 5 secondes.

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

# Toute la stack en une commande : jeu, API de scores, Postgres et Adminer
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

### Sans le code source, depuis les images publiées

Les images sont sur Docker Hub : `arrow91/clickfast-front`, `arrow91/clickfast-api`, `arrow91/clickfast-stats-api`, en version `1.0.0`. Dans un dossier qui ne contient que `docker-compose.prod.yml` et un `.env` rempli depuis `.env.example` :

```bash
docker compose -f docker-compose.prod.yml up -d
```

## L'API de scores

| Route          | Rôle                                                         |
| -------------- | ------------------------------------------------------------ |
| `POST /scores` | Enregistre `{ "username": "Adam", "score": 42 }`, renvoie 201 |
| `GET /scores`  | Renvoie les 10 meilleurs scores                              |
| `GET /health`  | Renvoie `{ "status": "ok" }`                                 |

Un pseudo vide ou de plus de 30 caractères, un score qui n'est pas un entier entre 0 et 200, ou un JSON cassé donnent un 400 avec le détail. Base injoignable : 503 avec un message, jamais de stacktrace.

## Le service de stats

`GET /stats` sur le port 8000 renvoie `{ "best_score": 55, "games_played": 8, "distinct_players": 8 }`. Aucune partie : 200 avec des zéros. Base injoignable : 503 avec un message.

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
