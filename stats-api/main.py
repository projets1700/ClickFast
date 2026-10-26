"""stats-api : statistiques de ClickFast, lues dans la même base que l'API de scores.

Service en lecture seule : il ne fait jamais d'INSERT ni d'UPDATE.
"""

import logging
import os
import sys

import psycopg
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from psycopg import sql

# Schéma créé par l'API de scores (api/src/server.js) : à garder synchronisé avec elle
TABLE_NAME = "scores"
COLUMN_USERNAME = "username"
COLUMN_SCORE = "score"

# Mêmes noms de variables que l'API de scores (voir .env.example)
REQUIRED_ENV = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("stats-api")

# Une variable manquante arrête le service au démarrage, avec un message clair
missing_env = [name for name in REQUIRED_ENV if not os.environ.get(name)]
if missing_env:
    log.error("Variables d'environnement manquantes : %s", ", ".join(missing_env))
    log.error("Vérifier le .env (modèle : .env.example), puis relancer la stack")
    sys.exit(1)

DB_SETTINGS = {
    "host": os.environ["DB_HOST"],
    "port": int(os.environ.get("DB_PORT", "5432")),
    "user": os.environ["DB_USER"],
    "password": os.environ["DB_PASSWORD"],
    "dbname": os.environ["DB_NAME"],
    # Sans délai, une base coupée fait pendre la requête au lieu de renvoyer une erreur
    "connect_timeout": 3,
    "options": "-c statement_timeout=5000",
}

STATS_QUERY = sql.SQL(
    "SELECT COALESCE(MAX({score}), 0), COUNT(*), COUNT(DISTINCT {username}) FROM {table}"
).format(
    score=sql.Identifier(COLUMN_SCORE),
    username=sql.Identifier(COLUMN_USERNAME),
    table=sql.Identifier(TABLE_NAME),
)

app = FastAPI(title="ClickFast stats-api")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/stats")
def stats():
    try:
        with psycopg.connect(**DB_SETTINGS) as conn:
            best_score, games_played, distinct_players = conn.execute(STATS_QUERY).fetchone()
    except psycopg.errors.UndefinedTable:
        # Table pas encore créée par l'API : aucune partie jouée, ce n'est pas une erreur
        best_score, games_played, distinct_players = 0, 0, 0
    except psycopg.OperationalError as err:
        log.error("Base injoignable : %s", err)
        return JSONResponse(
            status_code=503,
            content={"error": "Base de données indisponible, réessaie dans un instant"},
        )
    except psycopg.Error as err:
        # Erreur SQL inattendue (schéma modifié...) : détail dans les logs, jamais au client
        log.error("Erreur SQL : %s", err)
        return JSONResponse(status_code=500, content={"error": "Erreur interne du service de stats"})

    return {
        "best_score": best_score,
        "games_played": games_played,
        "distinct_players": distinct_players,
    }
