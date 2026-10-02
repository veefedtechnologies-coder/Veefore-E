const fs = require('fs');
let content = fs.readFileSync('server/middleware/file-upload-security.ts', 'utf8');
content = content.replace("      /<script\\\\b[^>]*>[\\\\s\\\\S]*?<\\\\/script\\\\s*>/gi, // Script tags", "      /<script\\b[^>]*>[\\s\\S]*?<\\/script\\s*>/gi, // Script tags");
fs.writeFileSync('server/middleware/file-upload-security.ts', content);
