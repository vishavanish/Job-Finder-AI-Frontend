import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "coverage", "public/mockServiceWorker.js", "src/lib/api/schema.d.ts"] },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message:
            "Never store tokens in browser storage. Use src/lib/storage.ts for UI preferences.",
        },
        {
          name: "sessionStorage",
          message:
            "Never store tokens in browser storage. Use src/lib/storage.ts for UI preferences.",
        },
      ],
    },
  },
  {
    // Node-side files.
    files: ["vite.config.ts", "eslint.config.js", "scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Context modules export a provider and its hook together — a documented exception.
    files: [
      "src/context/**/*.{jsx,tsx}",
      "src/app/activity.tsx",
      "src/app/theme.tsx",
      "src/test/**",
    ],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Legacy screens predate this config. Their findings are listed in
    // docs/frontend-audit.md and fixed as each file is migrated to TypeScript.
    files: [
      "src/pages/**/*.jsx",
      "src/context/RunContext.jsx",
      "src/context/SettingsContext.jsx",
      "src/components/ChipEditor.jsx",
    ],
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/no-autofocus": "off",
      "no-restricted-globals": "off",
    },
  },
  prettier,
);
