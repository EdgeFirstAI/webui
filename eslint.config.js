import globals from "globals";
import pluginJs from "@eslint/js";
import htmlPlugin from "eslint-plugin-html";

export default [
  {
    // Vendored third-party builds, kept byte-for-byte as published upstream.
    ignores: [
      "src/js/three.js",
      "src/js/three.core.js",
      "src/js/OrbitControls.js",
      "src/js/Line2.js",
      "src/js/LineGeometry.js",
      "src/js/LineMaterial.js",
      "src/js/LineSegments2.js",
      "src/js/LineSegmentsGeometry.js",
      "src/js/STLLoader.js",
      "src/js/three-spritetext.js",
      "src/js/leaflet.js",
      "src/js/tailwind.js",
      "src/js/Cdr.js",
      "src/js/tiny-world-all-10000.js",
    ],
  },
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