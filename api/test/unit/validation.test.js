const { validateScore, MAX_SCORE } = require("../../src/validation");

describe("validateScore", () => {
  test("un score correct passe, pseudo nettoyé des espaces", () => {
    const result = validateScore({ username: "  Adam  ", score: 42 });
    expect(result.errors).toEqual([]);
    expect(result.username).toBe("Adam");
    expect(result.score).toBe(42);
  });

  test("les bornes 0 et MAX_SCORE sont acceptées", () => {
    expect(validateScore({ username: "a", score: 0 }).errors).toEqual([]);
    expect(validateScore({ username: "a", score: MAX_SCORE }).errors).toEqual([]);
  });

  test("un pseudo absent ou vide est refusé", () => {
    expect(validateScore({ score: 10 }).errors).toContain("username est obligatoire");
    expect(validateScore({ username: "   ", score: 10 }).errors).toContain("username est obligatoire");
  });

  test("un pseudo de plus de 30 caractères est refusé", () => {
    expect(validateScore({ username: "x".repeat(31), score: 10 }).errors).toHaveLength(1);
  });

  test("un score négatif, trop grand ou non entier est refusé", () => {
    expect(validateScore({ username: "a", score: -1 }).errors).toHaveLength(1);
    expect(validateScore({ username: "a", score: MAX_SCORE + 1 }).errors).toHaveLength(1);
    expect(validateScore({ username: "a", score: 4.5 }).errors).toEqual(["score doit être un entier"]);
    expect(validateScore({ username: "a", score: "42" }).errors).toEqual(["score doit être un entier"]);
  });

  test("un corps absent ne fait pas planter la validation", () => {
    expect(validateScore(undefined).errors).toHaveLength(2);
  });
});
