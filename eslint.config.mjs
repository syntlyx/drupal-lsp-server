import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-unused-private-class-members": "error",
      "no-console": "off",
      semi: ["error", "always"],
      quotes: ["error", "single", { avoidEscape: true }],
      "comma-dangle": ["error", "never"],
      "arrow-parens": ["error", "always"],
    },
  },
  {
    ignores: ["out/**", "node_modules/**", "**/*.js"],
  },
);
