// npm run migrate : crée le schéma sur la base pointée par les variables DB_*, puis s'arrête.
// Sert à la CI pour préparer la base jetable avant les tests d'intégration.
const { createPool } = require("./db");
const { ensureSchema } = require("./schema");

const pool = createPool();

ensureSchema(pool)
  .then(() => console.log("Schéma appliqué"))
  .catch((err) => {
    console.error("Migration impossible :", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
