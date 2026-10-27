// Tests d'intégration : la vraie route HTTP, la vraie logique, un vrai PostgreSQL.
// La base est celle des variables DB_* (en CI : le conteneur de service, jetable).
const request = require("supertest");
const { createPool } = require("../../src/db");
const { createApp } = require("../../src/app");
const { ensureSchema } = require("../../src/schema");

const pool = createPool();
const { app } = createApp(pool);

beforeAll(async () => {
  await ensureSchema(pool);
});

// Chaque test repart d'une table vide : aucun test ne dépend de ce qu'un autre a laissé
beforeEach(async () => {
  await pool.query("TRUNCATE scores RESTART IDENTITY");
});

afterAll(async () => {
  await pool.end();
});

describe("API de scores contre une vraie base", () => {
  test("un score enregistré se relit par son identifiant, à l'identique", async () => {
    const created = await request(app).post("/scores").send({ username: "Adam", score: 42 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ username: "Adam", score: 42 });

    const reread = await request(app).get(`/scores/${created.body.id}`);
    expect(reread.status).toBe(200);
    expect(reread.body).toEqual(created.body);

    // Et il est vraiment en base, pas seulement renvoyé par la route
    const { rows } = await pool.query("SELECT username, score FROM scores WHERE id = $1", [created.body.id]);
    expect(rows).toEqual([{ username: "Adam", score: 42 }]);
  });

  test("un score qui n'existe pas donne un 404 propre", async () => {
    const res = await request(app).get("/scores/999999");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Score introuvable" });
  });

  test("un corps invalide donne un 400 et n'écrit rien en base", async () => {
    const sansPseudo = await request(app).post("/scores").send({ score: 10 });
    expect(sansPseudo.status).toBe(400);
    const negatif = await request(app).post("/scores").send({ username: "Bob", score: -5 });
    expect(negatif.status).toBe(400);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM scores");
    expect(rows[0].n).toBe(0);
  });

  test("un score supprimé disparaît du classement", async () => {
    const garde = await request(app).post("/scores").send({ username: "Garde", score: 30 });
    const supprime = await request(app).post("/scores").send({ username: "Supprime", score: 50 });

    const avant = await request(app).get("/scores");
    expect(avant.body.map((s) => s.username)).toEqual(["Supprime", "Garde"]);

    const del = await request(app).delete(`/scores/${supprime.body.id}`);
    expect(del.status).toBe(204);

    const apres = await request(app).get("/scores");
    expect(apres.body.map((s) => s.id)).toEqual([garde.body.id]);
    expect((await request(app).get(`/scores/${supprime.body.id}`)).status).toBe(404);
    // Supprimer deux fois le même score : 404, pas une erreur serveur
    expect((await request(app).delete(`/scores/${supprime.body.id}`)).status).toBe(404);
  });

  test("le classement est trié du meilleur au moins bon et limité à 10", async () => {
    for (let i = 1; i <= 12; i++) {
      await request(app).post("/scores").send({ username: `J${i}`, score: i });
    }
    const res = await request(app).get("/scores");
    expect(res.body).toHaveLength(10);
    expect(res.body.map((s) => s.score)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });
});
