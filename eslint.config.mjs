import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    ignores: ["server/archive/**", "client/src/components/caption/CaptionVariationSelector.test.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      "no-empty": "off",
      "no-useless-catch": "off",
      "prefer-const": "off",
      "no-sparse-arrays": "off",
      "no-useless-escape": "off",
      "no-case-declarations": "off",
      "no-misleading-character-class": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-control-regex": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-prototype-builtins": "off",
      "react-hooks/exhaustive-deps": "off",
      "no-var": "off",
      "@typescript-eslint/no-namespace": "off",
      "no-constant-condition": "off"
    }
  }
);
