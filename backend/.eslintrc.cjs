module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier",
  ],
  rules: {
    "import/order": [
      "warn",
      {
        "groups": [["builtin", "external"], "internal", ["parent", "sibling", "index"]],
        "alphabetize": { "order": "asc", "caseInsensitive": true }
      }
    ],
    "@typescript-eslint/no-floating-promises": ["error"],
    "@typescript-eslint/no-misused-promises": ["error"]
  }
};
