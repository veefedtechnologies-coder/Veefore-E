const fs = require('fs');
let content = fs.readFileSync('server/middleware/file-upload-security.ts', 'utf8');
content = content.replace(/\/<script\\\\b\[\^>\]\*>\[\\\\s\\\\S\]\*\?<\\\\\/script\[\^>\]\*>\/gi/g, '/<script\\b[^>]*>[\\s\\S]*?<\\/script[^>]*>/gi');
fs.writeFileSync('server/middleware/file-upload-security.ts', content);
