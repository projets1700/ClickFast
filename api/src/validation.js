// Score maximal accepté : en 5 secondes, même un clic toutes les 25 ms ne dépasse pas 200
const MAX_SCORE = 200;
const MAX_USERNAME_LENGTH = 30;

function validateScore(body) {
  const errors = [];
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const score = body?.score;

  if (!username) {
    errors.push("username est obligatoire");
  } else if (username.length > MAX_USERNAME_LENGTH) {
    errors.push(`username ne doit pas dépasser ${MAX_USERNAME_LENGTH} caractères`);
  }
  if (!Number.isInteger(score)) {
    errors.push("score doit être un entier");
  } else if (score < 0 || score > MAX_SCORE) {
    errors.push(`score doit être compris entre 0 et ${MAX_SCORE}`);
  }
  return { errors, username, score };
}

module.exports = { MAX_SCORE, MAX_USERNAME_LENGTH, validateScore };
