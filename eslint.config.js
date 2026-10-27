// Configuration ESLint du jeu (le front). L'API et stats-api ont leurs propres outils.
const js = require("@eslint/js");
const globals = require("globals");
const stylistic = require("@stylistic/eslint-plugin");

module.exports = [
  {
    ignores: ["node_modules/", "api/", "stats-api/"],
  },
  js.configs.recommended,
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      // Un point-virgule oublié est une erreur, pas un avertissement : il bloque la pipeline
      "@stylistic/semi": ["error", "always"],
      "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
      "no-unused-vars": "error",
      eqeqeq: "error",
    },
  },
  {
    // Le jeu tourne dans le navigateur ; "module" ne sert qu'à l'export pour Jest
    files: ["script.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, module: "writable" },
    },
  },
  {
    files: ["script.test.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.browser, ...globals.node, ...globals.jest },
    },
  },
  {
    files: ["eslint.config.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
];
