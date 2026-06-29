import fs from 'fs';
const file = 'server/services/oauth/__tests__/StateValidator.test.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace all .toBe(true) with .toEqual({ isValid: true, codeVerifier: expect.any(String) }) or similar
content = content.replace(/\.toBe\(true\)/g, '.toHaveProperty("isValid", true)');

fs.writeFileSync(file, content);
