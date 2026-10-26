const GAME_DURATION_MS = 5000;

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
