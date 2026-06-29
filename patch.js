import fs from 'fs';
const content = fs.readFileSync('server/admin-auth.ts', 'utf8');
const fixed = content.replace(/if \(\!process\.env\.JWT_SECRET\) \{\n  if \(process\.env\.NODE_ENV === "testing" \|\| process\.env\.NODE_ENV === "test"\) \{\n    process\.env\.JWT_SECRET = "test-secret-key-for-ci-pipelines";\n  \} else \{\n  console\.error\('FATAL ERROR: JWT_SECRET environment variable is missing\.'\);\n  process\.exit\(1\);\n\}/, 'if (!process.env.JWT_SECRET) {\n  if (process.env.NODE_ENV === "testing" || process.env.NODE_ENV === "test") {\n    process.env.JWT_SECRET = "test-secret-key-for-ci-pipelines";\n  } else {\n  console.error("FATAL ERROR: JWT_SECRET environment variable is missing.");\n  process.exit(1);\n  }\n}');
fs.writeFileSync('server/admin-auth.ts', fixed);
