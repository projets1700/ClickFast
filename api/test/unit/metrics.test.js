const request = require("supertest");
const { createApp } = require("../../src/app");

const poolInterdit = {
  query: () => {
    throw new Error("la base ne devait pas être appelée");
  },
};

// Lit la valeur d'une série dans le texte de /metrics (0 si la série n'existe pas encore)
function valeur(texte, serie) {
  const ligne = texte.split("\n").find((l) => l.startsWith(serie + " "));
  return ligne ? Number(ligne.split(" ")[1]) : 0;
}

describe("/metrics", () => {
  test("répond en texte brut au format Prometheus", async () => {
    const { app } = createApp(poolInterdit);
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/plain/);
    expect(res.text).toContain("# TYPE http_requests_total counter");
    expect(res.text).toContain("# TYPE http_request_duration_seconds histogram");
    expect(res.text).toContain("# TYPE clickfast_scores_recorded_total counter");
  });

  test("trois appels à la même route font monter le compteur de trois exactement", async () => {
    const { app } = createApp(poolInterdit);
    const serie = 'http_requests_total{method="GET",route="/health",status_code="200"}';
    const avant = valeur((await request(app).get("/metrics")).text, serie);
    for (let i = 0; i < 3; i++) await request(app).get("/health");
    const apres = valeur((await request(app).get("/metrics")).text, serie);
    expect(apres - avant).toBe(3);
  });

  test("une route inconnue est comptée, sous une seule valeur de route", async () => {
    const { app } = createApp(poolInterdit);
    await request(app).get("/existe-pas");
    await request(app).get("/existe-pas-non-plus");
    const texte = (await request(app).get("/metrics")).text;
    expect(valeur(texte, 'http_requests_total{method="GET",route="unmatched",status_code="404"}')).toBe(2);
  });

  test("l'identifiant d'un score ne devient jamais un label", async () => {
    const { app } = createApp(poolInterdit);
    await request(app).get("/scores/abc");
    const texte = (await request(app).get("/metrics")).text;
    expect(texte).toContain('route="/scores/:id"');
    expect(texte).not.toContain("abc");
  });
});
