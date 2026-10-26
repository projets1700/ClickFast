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

Prérequis : Docker. Pour l'instant tout se lance à la main, conteneur par conteneur (Compose arrive à l'étape 6).

```bash
git clone https://github.com/projets1700/ClickFast.git
cd ClickFast

# 1. Le network privé de l'API et de la base, et le volume de la base
docker network create clickfast-net
docker volume create clickfast-pgdata

# 2. La base : aucun port publié, elle n'est joignable que depuis clickfast-net
docker run -d --name clickfast-db --network clickfast-net \
  -e POSTGRES_USER=clickfast -e POSTGRES_PASSWORD=clickfast_pwd -e POSTGRES_DB=clickfast \
  --mount source=clickfast-pgdata,target=/var/lib/postgresql \
  postgres:18.6-alpine

# 3. L'API de scores, qui joint la base par son nom de conteneur
docker build -t clickfast-api:1.0.0 ./api
docker run -d --name clickfast-api --network clickfast-net \
  -e DB_HOST=clickfast-db -e DB_PORT=5432 -e DB_USER=clickfast -e DB_PASSWORD=clickfast_pwd -e DB_NAME=clickfast \
  -p 3000:3000 clickfast-api:1.0.0

# 4. Le jeu
docker build -t clickfast:1.1.0 .
docker run -d --name clickfast -p 8080:80 clickfast:1.1.0
```

Puis ouvrir http://localhost:8080. Pour tout arrêter : `docker rm -f clickfast clickfast-api clickfast-db` (le volume et donc les scores restent).

## L'API de scores

| Route          | Rôle                                                         |
| -------------- | ------------------------------------------------------------ |
| `POST /scores` | Enregistre `{ "username": "Adam", "score": 42 }`, renvoie 201 |
| `GET /scores`  | Renvoie les 10 meilleurs scores                              |
| `GET /health`  | Renvoie `{ "status": "ok" }`                                 |

Un pseudo vide ou de plus de 30 caractères, un score qui n'est pas un entier entre 0 et 200, ou un JSON cassé donnent un 400 avec le détail. Base injoignable : 503 avec un message, jamais de stacktrace.

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
docker run -d --name clickfast-db -e POSTGRES_USER=clickfast -e POSTGRES_PASSWORD=clickfast_pwd -e POSTGRES_DB=clickfast --mount source=clickfast-pgdata,target=/var/lib/postgresql -p 5432:5432 postgres:18.6-alpine
docker run -d --name clickfast-api -e DB_HOST=172.17.0.2 -e DB_PORT=5432 -e DB_USER=clickfast -e DB_PASSWORD=clickfast_pwd -e DB_NAME=clickfast -p 3000:3000 clickfast-api:1.0.0
```

IP interne utilisée : `172.17.0.2`, trouvée avec `docker network inspect bridge`. Étapes manuelles pour lancer la stack : 8 commandes (création du volume, run de la base, attente qu'elle soit prête, inspection du bridge pour l'IP, build et run de l'API, build et run du jeu), dont deux `docker run` à 6 et 7 options. Les identifiants sont en clair dans les commandes : c'est l'étape 5 qui les sort.

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

Ce que le network custom règle par rapport à l'étape 3 : après un `docker restart` de la base, puis après un `docker rm` et un `docker run` neuf qui lui donne une autre IP (`172.19.0.4`), l'API répond 200 sans être relancée, puisqu'elle cherche un nom et plus une adresse. Il reste 9 commandes manuelles pour lancer la stack (une de plus avec `docker network create`, mais la recherche d'IP et les relances de l'API disparaissent).
