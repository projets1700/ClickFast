const { Pool } = require("pg");

// Vérification au démarrage : une variable manquante arrête tout de suite le process
// avec un message clair, au lieu d'un undefined qui casse plus loin à la première requête
const REQUIRED_ENV = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];

function checkEnv() {
  const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missingEnv.length > 0) {
    console.error(`Variables d'environnement manquantes : ${missingEnv.join(", ")}`);
    console.error("Vérifier le .env (modèle : .env.example), puis relancer la stack");
    process.exit(1);
  }
}

function createPool() {
  checkEnv();
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
  return pool;
}

module.exports = { createPool };
