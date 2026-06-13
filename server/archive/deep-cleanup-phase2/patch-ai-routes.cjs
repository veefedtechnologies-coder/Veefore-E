const fs = require('fs');

const path = '/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E/server/routes/v1/ai.routes.ts';
let code = fs.readFileSync(path, 'utf8');

const helper = `
async function getAIPreferences(userId: string, req: Request): Promise<any> {
  let preferences: any = {};
  try {
    const userObj = await storage.getUser(userId);
    if (userObj && userObj.preferences) preferences = { ...userObj.preferences };
  } catch (e) {
    console.warn('Failed to load user preferences');
  }
  
  const workspaceId = req.body.workspaceId || req.query.workspaceId || req.headers['workspace-id'];
  if (workspaceId) {
    try {
      const workspace = await storage.getWorkspace(workspaceId);
      if (workspace && workspace.aiConfiguration) {
        // Merge workspace config into preferences
        // This ensures googleAiStudioKey and openAiKey are used
        preferences = { ...preferences, ...workspace.aiConfiguration };
      }
    } catch (e) {
      console.warn('Failed to load workspace AI configuration');
    }
  }
  return preferences;
}
`;

if (!code.includes('getAIPreferences')) {
  // insert after imports
  code = code.replace(/const router = Router\(\);/, helper + '\nconst router = Router();');
}

const replaceBlock = `      let preferences: any = {};
      try {
        const userObj = await storage.getUser(userId);
        if (userObj && userObj.preferences) preferences = userObj.preferences;
      } catch (e) {
        console.warn('Failed to load user preferences');
      }`;

code = code.split(replaceBlock).join(`      const preferences = await getAIPreferences(userId, req);`);

fs.writeFileSync(path, code);
console.log('patched');
