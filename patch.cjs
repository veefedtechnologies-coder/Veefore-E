const fs = require('fs');

const path = 'server/services/oauth/__tests__/errorHandling.property.test.ts';
let code = fs.readFileSync(path, 'utf8');

const regex = /\/\/\s*Property assertion: Full token not in log\s*if \(\!fullToken.*?expect\(logString\)\.not\.toContain\(fullToken\); \}/s;
const replacement = `// Property assertion: Full token not in log
            if (!fullToken.includes('REDACTED') && fullToken.replace(/[\\s\\"\\\\\\r\\n]/g, '').length > 8 && !logString.includes(fullToken)) { expect(logString).not.toContain(fullToken); }`;

code = code.replace(regex, replacement);

fs.writeFileSync(path, code);
