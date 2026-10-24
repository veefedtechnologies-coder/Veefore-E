const fs = require('fs');

// We have ESLint missing config error.
// The repository has an eslintrc file inside server/eslint.config.js but wait, does it have one in the root?
// "ESLint couldn't find a configuration file"
let rootEslint = '.eslintrc.json';
if (!fs.existsSync(rootEslint)) {
  fs.writeFileSync(rootEslint, JSON.stringify({
    "root": true,
    "env": {
      "node": true,
      "es2020": true
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
      "ecmaVersion": 2020,
      "sourceType": "module"
    },
    "plugins": [
      "@typescript-eslint"
    ],
    "extends": [
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended"
    ],
    "rules": {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off"
    },
    "ignorePatterns": ["dist/", "node_modules/", "client/dist/"]
  }, null, 2));
}

// In the previous CI run:
// 1. ESLint couldn't find config file. Now we created it.
// Wait! Previously we added eslint to devDependencies so maybe I should add it again because I rolled it back.
// But the CI workflow might not even be running `npm install` for `eslint` if it's already there? Wait, the CI logs say:
// `npm warn exec The following package was not found and will be installed: eslint@10.13.0`
// This usually means `eslint` is not in `package.json` devDependencies so `npx eslint` installs the latest version (which is ESLint 9/10 that drops support for `.eslintrc` files!).
// If I add `eslint@8.57.0` to devDependencies, `npx eslint` will use that version, and `.eslintrc.json` will be detected correctly!
// Let's add eslint to package.json.
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.devDependencies = pkg.devDependencies || {};
pkg.devDependencies['eslint'] = '^8.57.0';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
