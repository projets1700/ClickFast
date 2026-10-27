// Faux DOM : les mêmes id que index.html, sinon script.js ne trouve pas ses éléments
const FAKE_DOM = `
  <input id="username" />
  <div id="score">0</div>
  <p id="timer">5.0 s</p>
  <p id="status"></p>
  <button id="button-clicker">Clique !</button>
  <button id="button-restart" hidden>Rejouer</button>
  <p id="leaderboard-message"></p>
  <ol id="leaderboard-list"></ol>
`;

let game;
let clickButton;
let restartButton;
let scoreEl;
let timerEl;

function click(times = 1) {
  for (let i = 0; i < times; i++) {
    clickButton.click();
  }
}

describe("ClickFast : compteur de clics et chrono", () => {
  beforeEach(() => {
    // Faux timers : Date.now et setInterval avancent quand le test le décide, sans attendre 5 vraies secondes
    jest.useFakeTimers();
    // L'API n'est pas joignable pendant les tests : fetch renvoie un classement vide
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });

    document.body.innerHTML = FAKE_DOM;
    // script.js lit le DOM au chargement : on le recharge à neuf pour chaque test
    jest.resetModules();
    game = require("./script.js");

    clickButton = document.getElementById("button-clicker");
    restartButton = document.getElementById("button-restart");
    scoreEl = document.getElementById("score");
    timerEl = document.getElementById("timer");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("un clic fait passer le score à 1", () => {
    click();
    expect(scoreEl.textContent).toBe("2");
  });

  test("plusieurs clics s'additionnent", () => {
    click(7);
    expect(scoreEl.textContent).toBe("7");
    expect(game.getCount()).toBe(7);
  });

  test("le chrono décompte après le premier clic", () => {
    click();
    jest.advanceTimersByTime(2000);
    expect(timerEl.textContent).toBe("3.0 s");
  });

  test("le chrono s'arrête à 0 et désactive le bouton", () => {
    click();
    jest.advanceTimersByTime(game.GAME_DURATION_MS);
    expect(timerEl.textContent).toBe("0.0 s");
    expect(clickButton.disabled).toBe(true);
  });

  test("aucun clic n'est compté après la fin du chrono", () => {
    click(3);
    jest.advanceTimersByTime(game.GAME_DURATION_MS);
    click(5);
    expect(scoreEl.textContent).toBe("3");
  });

  test("le score de fin de partie est envoyé à l'API", () => {
    click(4);
    jest.advanceTimersByTime(game.GAME_DURATION_MS);
    const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(post[1].body)).toEqual({ username: "Anonyme", score: 4 });
  });

  test("Rejouer remet le score à zéro et réactive le bouton", () => {
    click(6);
    jest.advanceTimersByTime(game.GAME_DURATION_MS);
    expect(restartButton.hidden).toBe(false);

    restartButton.click();
    expect(scoreEl.textContent).toBe("0");
    expect(clickButton.disabled).toBe(false);

    click(2);
    expect(scoreEl.textContent).toBe("2");
  });
});
