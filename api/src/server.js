const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT) || 3000;

// Score maximal accepté : en 5 secondes, même un clic toutes les 25 ms ne dépasse pas 200
const MAX_SCORE = 200;
const MAX_USERNAME_LENGTH = 30;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Sans ces délais, une base morte fait pendre la requête au lieu de renvoyer une erreur
  connectionTimeoutMillis: 3000,
  query_timeout: 5000,
});

// Une connexion inactive qui casse (base tuée) émet "error" : sans écouteur, le process plante
pool.on("error", (err) => {
  console.error("Connexion à la base perdue :", err.message);
});

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id         SERIAL PRIMARY KEY,
      username   VARCHAR(${MAX_USERNAME_LENGTH}) NOT NULL,
      score      INTEGER NOT NULL CHECK (score >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  schemaReady = true;
  console.log("Table scores prête");
}

function validateScore(body) {
  const errors = [];
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const score = body?.score;

  if (!username) {
    errors.push("username est obligatoire");
  } else if (username.length > MAX_USERNAME_LENGTH) {
    errors.push(`username ne doit pas dépasser ${MAX_USERNAME_LENGTH} caractères`);
  }
  if (!Number.isInteger(score)) {
    errors.push("score doit être un entier");
  } else if (score < 0 || score > MAX_SCORE) {
    errors.push(`score doit être compris entre 0 et ${MAX_SCORE}`);
  }
  return { errors, username, score };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1kb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Enregistre un score
app.post("/scores", async (req, res) => {
  const { errors, username, score } = validateScore(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Score invalide", details: errors });
  }
  await ensureSchema();
  const { rows } = await pool.query(
    "INSERT INTO scores (username, score) VALUES ($1, $2) RETURNING id, username, score, created_at",
    [username, score]
  );
  res.status(201).json(rows[0]);
});

// Renvoie le classement : les 10 meilleurs scores
app.get("/scores", async (req, res) => {
  await ensureSchema();
  const { rows } = await pool.query(
    "SELECT username, score, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT 10"
  );
  res.json(rows);
});

app.use((req, res) => {
  res.status(404).json({ error: "Route inconnue" });
});

// Toute erreur finit en JSON propre, jamais en stacktrace envoyée au client
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON invalide" });
  }
  console.error("Erreur :", err.message);
  // Les seules requêtes qui peuvent échouer ici sont celles vers la base
  res.status(503).json({ error: "Base de données indisponible, réessaie dans un instant" });
});

const server = app.listen(PORT, () => {
  console.log(`API de scores en écoute sur le port ${PORT}`);
  ensureSchema().catch((err) => {
    console.error("Base pas encore joignable au démarrage :", err.message);
  });
});

// docker stop envoie SIGTERM : on ferme proprement le serveur et les connexions
process.on("SIGTERM", () => {
  server.close(() => pool.end().then(() => process.exit(0)));
});
