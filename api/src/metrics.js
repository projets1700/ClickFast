const client = require("prom-client");

// Les mesures de l'API, exposées en texte brut sur /metrics, que Prometheus vient lire (scrape)
function createMetrics() {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register }); // mémoire, CPU, event loop du process Node

  const httpRequestsTotal = new client.Counter({
    name: "http_requests_total",
    help: "Nombre total de requêtes HTTP servies",
    labelNames: ["method", "route", "status_code"],
    registers: [register],
  });

  const httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Durée des requêtes HTTP en secondes",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
  });

  // La mesure propre au jeu : combien de parties ont été enregistrées depuis le démarrage
  const scoresRecorded = new client.Counter({
    name: "clickfast_scores_recorded_total",
    help: "Nombre de scores enregistrés depuis le démarrage de l'API",
    registers: [register],
  });

  function middleware(req, res, next) {
    const stopTimer = httpRequestDuration.startTimer();
    res.on("finish", () => {
      // La route déclarée ("/scores/:id"), jamais l'URL réelle ("/scores/42") : sinon chaque
      // identifiant créerait sa propre série. Une requête qui ne correspond à aucune route
      // (404, JSON cassé rejeté avant le routage) est rangée sous une seule valeur.
      const route = req.route ? req.route.path : "unmatched";
      const labels = { method: req.method, route, status_code: res.statusCode };
      httpRequestsTotal.inc(labels);
      stopTimer(labels);
    });
    next();
  }

  return { register, middleware, scoresRecorded };
}

module.exports = { createMetrics };
