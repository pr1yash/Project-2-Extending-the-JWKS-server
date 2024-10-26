import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {
    languageOptions: {
      globals: {
        ...globals.node,    // Include Node.js globals
        ...globals.mocha,    // Add Mocha globals (describe, before, it, etc.)
      },
    },
  },
  pluginJs.configs.recommended,
  {
    files: ["**/*.test.js", "**/*.spec.js"], // Apply to your test files
    languageOptions: {
      globals: globals.mocha,  // Ensure Mocha globals are recognized in test files
    },
  },
];
