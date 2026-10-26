const GAME_DURATION_MS = 5000;
// Le navigateur tourne sur la machine hôte : il joint l'API par le port qu'elle publie
const API_URL = "http://localhost:3000";
const API_TIMEOUT_MS = 5000;

const usernameInput = document.getElementById("username");
const leaderboardList = document.getElementById("leaderboard-list");
const leaderboardMessage = document.getElementById("leaderboard-message");

const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const clickButton = document.getElementById("button-clicker");
const restartButton = document.getElementById("button-restart");

let count = 0;
let endTime = null; // null = partie pas encore lancée
let intervalId = null;

function startGame() {
  endTime = Date.now() + GAME_DURATION_MS;
  statusEl.textContent = "C'est parti, clique !";
  intervalId = setInterval(updateTimer, 100);
}

function updateTimer() {
  const remaining = Math.max(0, endTime - Date.now());
  timerEl.textContent = (remaining / 1000).toFixed(1) + " s";
  if (remaining === 0) {
    endGame();
  }
}

function endGame() {
  clearInterval(intervalId);
  clickButton.disabled = true;
  statusEl.textContent = "Temps écoulé ! Score final : " + count;
  restartButton.hidden = false;
  submitScore(count);
}

// fetch avec délai maximal : une API qui ne répond pas ne doit jamais bloquer la page
async function callApi(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL + path, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Erreur " + response.status);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("L'API ne répond pas");
    if (err instanceof TypeError) throw new Error("API injoignable");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function submitScore(score) {
  const username = usernameInput.value.trim() || "Anonyme";
  try {
    await callApi("/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, score }),
    });
    statusEl.textContent = "Score de " + score + " enregistré pour " + username + " !";
    loadLeaderboard();
  } catch (err) {
    statusEl.textContent = "Score final : " + score + ". Non enregistré : " + err.message;
  }
}

async function loadLeaderboard() {
  try {
    const scores = await callApi("/scores");
    leaderboardList.replaceChildren();
    for (const entry of scores) {
      const item = document.createElement("li");
      // textContent et pas innerHTML : un pseudo ne doit jamais pouvoir injecter du HTML
      item.textContent = entry.username + " : " + entry.score;
      leaderboardList.appendChild(item);
    }
    leaderboardMessage.textContent = scores.length === 0 ? "Aucun score pour l'instant" : "";
    leaderboardMessage.classList.remove("error");
  } catch (err) {
    leaderboardMessage.textContent = "Classement indisponible : " + err.message;
    leaderboardMessage.classList.add("error");
  }
}

function resetGame() {
  count = 0;
  endTime = null;
  scoreEl.textContent = count;
  timerEl.textContent = (GAME_DURATION_MS / 1000).toFixed(1) + " s";
  statusEl.textContent = "Clique pour lancer la partie !";
  clickButton.disabled = false;
  restartButton.hidden = true;
}

clickButton.addEventListener("click", () => {
  // Le premier clic lance le chrono
  if (endTime === null) {
    startGame();
  }
  // Double sécurité : aucun clic compté après la fin, même si l'intervalle a du retard
  if (Date.now() >= endTime) {
    endGame();
    return;
  }
  count++;
  scoreEl.textContent = count;
});

restartButton.addEventListener("click", resetGame);

loadLeaderboard();
