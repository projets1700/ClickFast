const { createPool } = require("./db");
const { createApp } = require("./app");

const PORT = Number(process.env.PORT) || 3000;

const pool = createPool();
const { app, schema } = createApp(pool);

const server = app.listen(PORT, () => {
  console.log(`API de scores en écoute sur le port ${PORT}`);
  schema().catch((err) => {
    console.error("Base pas encore joignable au démarrage :", err.message);
  });
});

// docker stop envoie SIGTERM : on ferme proprement le serveur et les connexions
process.on("SIGTERM", () => {
  server.close(() => pool.end().then(() => process.exit(0)));
});
