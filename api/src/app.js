const express = require("express");
const cors = require("cors");
const { ensureSchema } = require("./schema");
const { validateScore } = require("./validation");

function createApp(pool) {
  let schemaReady = false;

  async function schema() {
    if (schemaReady) return;
    await ensureSchema(pool);
    schemaReady = true;
    console.log("Table scores prête");
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
    await schema();
    const { rows } = await pool.query(
      "INSERT INTO scores (username, score) VALUES ($1, $2) RETURNING id, username, score, created_at",
      [username, score]
    );
    res.status(201).json(rows[0]);
  });

  // Renvoie le classement : les 10 meilleurs scores
  app.get("/scores", async (req, res) => {
    await schema();
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
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "Requête trop volumineuse" });
    }
    // Toute autre erreur du client détectée par Express (encodage, type de contenu...) garde son code 4xx
    if (err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: "Requête invalide" });
    }
    console.error("Erreur :", err.message);
    // Le reste vient des requêtes vers la base
    res.status(503).json({ error: "Base de données indisponible, réessaie dans un instant" });
  });

  return { app, schema };
}

module.exports = { createApp };
