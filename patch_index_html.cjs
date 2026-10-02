const fs = require('fs');
let content = fs.readFileSync('client/index.html', 'utf8');

// Replace standard apply patterns
content = content.replace(/originalWarn\.apply\(console, args\);/g, 'originalWarn.apply(console, args.map(a => typeof a === "string" ? a.replace(/[<>\\`]/g, "") : a));');
content = content.replace(/originalError\.apply\(console, args\);/g, 'originalError.apply(console, args.map(a => typeof a === "string" ? a.replace(/[<>\\`]/g, "") : a));');
content = content.replace(/originalLog\.apply\(console, args\);/g, 'originalLog.apply(console, args.map(a => typeof a === "string" ? a.replace(/[<>\\`]/g, "") : a));');

fs.writeFileSync('client/index.html', content);
