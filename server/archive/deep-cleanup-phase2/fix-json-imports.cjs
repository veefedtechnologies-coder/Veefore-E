const fs = require('fs');
const path = '/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E/server/services/AIServiceManager.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace("new require('@google/generative-ai').GoogleGenerativeAI(preferences.googleAiStudioKey)", "new GoogleGenerativeAI(preferences.googleAiStudioKey)");

content = content.replace(`let OpenAI = require('openai');
      if (OpenAI.default) OpenAI = OpenAI.default;`, '');

content = content.replace("new OpenAI({ apiKey: preferences.openAiKey })", "new OpenAI({ apiKey: preferences.openAiKey })");

fs.writeFileSync(path, content);
console.log('Fixed imports');
