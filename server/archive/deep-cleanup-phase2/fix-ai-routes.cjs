const fs = require('fs');

function patchFile(path) {
  let code = fs.readFileSync(path, 'utf8');
  
  const regex = /let preferences: any = {};[\s\S]*?try \{[\s\S]*?const userObj = await storage\.getUser\(userId\);[\s\S]*?if \(userObj && userObj\.preferences\) preferences = userObj\.preferences;[\s\S]*?\} catch \(e\) \{[\s\S]*?console\.warn\('Failed to load user preferences'\);[\s\S]*?\}/g;
  
  code = code.replace(regex, 'const preferences = await getAIPreferences(userId, req);');
  
  fs.writeFileSync(path, code);
  console.log('patched', path);
}

patchFile('/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E/server/routes/v1/ai.routes.ts');
