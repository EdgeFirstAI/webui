import globals from "globals";
import pluginJs from "@eslint/js";
import htmlPlugin from "eslint-plugin-html";

export default [
  {
    files: ["**/*.{js,html}"],
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: 2021,
      sourceType: "module",
    },
    plugins: {
      html: htmlPlugin,
    },
    rules: {
      // Add any custom rules here
    },
  },
  pluginJs.configs.recommended,
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { globals: globals.node, sourceType: "module" },
  },
];