const fs = require('fs');
const path = '/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E/server/services/AIServiceManager.ts';
let content = fs.readFileSync(path, 'utf8');

const jsonMethod = `
  public async generateJSON(prompt: string, preferences: UserAIPreferences = {}): Promise<any> {
    const { 
      aiModel = 'veegpt-hybrid', 
      creativityLevel = 0.7,
      contentSafety = 'standard',
      aiPersona = 'Professional & Authoritative',
      captionStyle = 'Storytelling',
      responseLength = 'medium',
      multilingual = 'auto',
      aiMemory = 'long-term'
    } = preferences;

    console.log('[AIServiceManager] Generating JSON using model:', aiModel, 'creativity:', creativityLevel);

    const globalSystemContext = \`
[SYSTEM CONFIGURATION OVERRIDE]
You must strictly follow these brand guidelines for your response:
\${aiPersona ? \`- Persona: \${aiPersona}\` : ''}
\${captionStyle ? \`- Tone/Style: \${captionStyle}\` : ''}
\${responseLength ? \`- Response Length constraint: \${responseLength}\` : ''}
\${multilingual && multilingual !== 'auto' ? \`- Target Language: \${multilingual}\` : ''}
\${aiMemory === 'long-term' ? \`- Memory Context: Retain continuity with typical brand interactions.\` : ''}
[/SYSTEM CONFIGURATION OVERRIDE]\\n\\n\`;

    const finalPrompt = globalSystemContext + prompt;

    const tryGemini = async (modelName: string) => {
      const generationConfig = { temperature: creativityLevel, responseMimeType: "application/json" };
      const safetySettings = this.getSafetySettings(contentSafety);
      const client = preferences.googleAiStudioKey ? new require('@google/generative-ai').GoogleGenerativeAI(preferences.googleAiStudioKey) : this.genAI;
      const model = client.getGenerativeModel({ model: modelName, generationConfig, safetySettings });
      const result = await model.generateContent(finalPrompt);
      const text = result.response.text();
      const cleaned = text.replace(/^\\\`\\\`(?:json)?\\n?/, '').replace(/\\n?\\\`\\\`$/, '');
      return JSON.parse(cleaned);
    };

    const tryOpenAI = async (modelName: string) => {
      const client = preferences.openAiKey ? new require('openai').default({ apiKey: preferences.openAiKey }) : this.openai;
      if (!client) throw new Error('OpenAI is not configured.');
      const completion = await client.chat.completions.create({
        messages: [{ role: "system", content: "You must respond with valid JSON." }, { role: "user", content: finalPrompt }],
        model: modelName,
        temperature: creativityLevel,
        response_format: { type: "json_object" }
      });
      return JSON.parse(completion.choices[0]?.message?.content || '{}');
    };

    if (aiModel === 'openai-gpt4o') {
      return await tryOpenAI('gpt-4o');
    } else if (aiModel === 'gemini-1.5-flash') {
      return await tryGemini('gemini-1.5-flash');
    } else if (aiModel === 'gemini-2.0-flash-exp' || aiModel === 'google-ai-studio') {
      return await tryGemini('gemini-2.0-flash-exp');
    } else {
      try {
        return await tryGemini('gemini-2.0-flash-exp');
      } catch (err) {
        console.warn('[AIServiceManager] Hybrid fallback to OpenAI due to error:', err);
        return await tryOpenAI('gpt-4o-mini');
      }
    }
  }
`;

content = content.replace('}\n\nexport const aiServiceManager', jsonMethod + '\n}\n\nexport const aiServiceManager');
fs.writeFileSync(path, content);
console.log('Restored generateJSON');
