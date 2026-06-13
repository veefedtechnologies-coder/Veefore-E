const fs = require('fs');
let content = fs.readFileSync('client/src/pages/SocialListeningPage.tsx', 'utf8');
content = content.replace("const userNiche = userData?.user?.niche || 'Not Set';", "const userNiche = userData?.user?.niche || 'Not Set';\n  console.log('USER DATA IN UI:', userData);");
fs.writeFileSync('client/src/pages/SocialListeningPage.tsx', content);
console.log('patched');
