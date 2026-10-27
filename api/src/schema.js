const { MAX_USERNAME_LENGTH } = require("./validation");

// Le schéma de la base, en un seul endroit : l'API le joue au démarrage, npm run migrate aussi (CI)
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS scores (
    id         SERIAL PRIMARY KEY,
    username   VARCHAR(${MAX_USERNAME_LENGTH}) NOT NULL,
    score      INTEGER NOT NULL CHECK (score >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

async function ensureSchema(pool) {
  await pool.query(SCHEMA_SQL);
}

module.exports = { ensureSchema };
