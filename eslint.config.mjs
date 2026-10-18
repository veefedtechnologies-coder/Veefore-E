import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "dist",
      "node_modules",
      "build",
      "**/*.d.ts",
      "server/archive/broken-seed-scripts/**",
      "client/src/components/caption/CaptionVariationSelector.test.ts",
      "client/src/components/voice-profile/VoiceProfileViewer.example.tsx"
    ]
  },
  {files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"]},
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    plugins: {
      "react-hooks": pluginReactHooks
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "no-empty-pattern": "off",
      "prefer-const": "off",
      "no-var": "off",
      "object-shorthand": "off",
      "prefer-arrow-callback": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-useless-catch": 'off',
      "no-case-declarations": 'off',
      "no-useless-escape": 'off',
      "no-empty": 'off',
      "no-misleading-character-class": 'off',
      "no-useless-assignment": 'off',
      "no-sparse-arrays": 'off',
      "no-unreachable": 'off',
      "no-prototype-builtins": 'off',
      "no-constant-condition": 'off',
      "no-inner-declarations": 'off',
      "no-control-regex": 'off',
      "no-ex-assign": 'off',
      "no-cond-assign": 'off',
      "no-irregular-whitespace": 'off',
      "no-regex-spaces": 'off',
      "no-dupe-class-members": 'off',
      "preserve-caught-error": 'off',
      "valid-typeof": 'off',
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "react/no-unknown-property": "off",
      "react/display-name": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "react/jsx-no-target-blank": "off",
      "react/jsx-no-comment-textnodes": "off",
      "react/jsx-key": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-namespace": "off"
    },
    settings: {
        react: {
            version: "18.3.1"
        }
    }
  }
];
