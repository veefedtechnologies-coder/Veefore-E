import fs from 'fs';
const file = 'server/services/oauth/__tests__/StateValidator.test.ts';
let content = fs.readFileSync(file, 'utf8');

// The original file is too messed up from our replaces. Let's just mock the test environment properly!
// Actually, git restore the files first.
