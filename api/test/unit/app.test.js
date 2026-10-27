const request = require("supertest");
const { createApp } = require("../../src/app");

// Ces tests ne parlent jamais à une base : le faux pool échoue s'il est appelé.
// Ce qui touche la base est vérifié contre un vrai PostgreSQL dans test/integration.
const poolInterdit = {
  query: () => {
    throw new Error("la base ne devait pas être appelée");
  },
};

describe("API de scores, sans base", () => {
  const { app } = createApp(poolInterdit);

  test("GET /health répond ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("un score invalide est refusé en 400 avant tout appel à la base", async () => {
    const res = await request(app).post("/scores").send({ username: "", score: -3 });
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(2);
  });

  test("un JSON cassé donne un 400, pas une erreur serveur", async () => {
    const res = await request(app).post("/scores").set("Content-Type", "application/json").send("{pas du json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "JSON invalide" });
  });

  test("un corps de plus de 1 ko donne un 413", async () => {
    const res = await request(app).post("/scores").send({ username: "a".repeat(2000), score: 1 });
    expect(res.status).toBe(413);
  });

  test("une route inconnue donne un 404 en JSON", async () => {
    const res = await request(app).get("/nimporte-quoi");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Route inconnue" });
  });

  test("une base en panne donne un 503 propre, sans stacktrace", async () => {
    const { app: appEnPanne } = createApp({
      query: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    const res = await request(appEnPanne).get("/scores");
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
  });
});
