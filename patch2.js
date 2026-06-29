import fs from 'fs';
const content = fs.readFileSync('server/admin-auth.ts', 'utf8');
const fixed = content.replace('  process.exit(1);\n}\nconst JWT_SECRET = process.env.JWT_SECRET;', '  process.exit(1);\n  }\n}\nconst JWT_SECRET = process.env.JWT_SECRET;');
fs.writeFileSync('server/admin-auth.ts', fixed);
