// Patch the remaining OpenAI-compatible (direct SDK) bodies.
// A method-scoped `tempParams` const is used rather than `this.temperatureFor(...)`
// because some of these live inside bound generator functions where `this` is
// re-typed; a plain const is unambiguous.
import fs from 'node:fs';
const F = 'server/services/AIServiceManager.ts';
let s = fs.readFileSync(F, 'utf8');
const one = (a, b, what) => {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error(`${what}: ${n} matches, need 1`);
  s = s.replace(a, b);
  console.log('ok  ' + what);
};

// ── declare tempParams in each of the three methods ──────────────────────────
one(
  `    const globalSystemContext = \`
[SYSTEM CONFIGURATION OVERRIDE]
You must strictly follow these brand guidelines for your response:
\${aiPersona ? \`- Persona: \${aiPersona}\` : ''}
\${captionStyle ? \`- Tone/Style: \${captionStyle}\` : ''}
\${responseLength ? \`- Response Length constraint: \${responseLength}\` : ''}
\${multilingual && multilingual !== 'auto' ? \`- Target Language: \${multilingual}\` : ''}
\${aiMemory === 'long-term' ? \`- Memory Context: Retain continuity with typical brand interactions.\` : ''}
[/SYSTEM CONFIGURATION OVERRIDE]\\n\\n\`;
    const finalPrompt = globalSystemContext + prompt;

    const githubModel`,
  `    const globalSystemContext = \`
[SYSTEM CONFIGURATION OVERRIDE]
You must strictly follow these brand guidelines for your response:
\${aiPersona ? \`- Persona: \${aiPersona}\` : ''}
\${captionStyle ? \`- Tone/Style: \${captionStyle}\` : ''}
\${responseLength ? \`- Response Length constraint: \${responseLength}\` : ''}
\${multilingual && multilingual !== 'auto' ? \`- Target Language: \${multilingual}\` : ''}
\${aiMemory === 'long-term' ? \`- Memory Context: Retain continuity with typical brand interactions.\` : ''}
[/SYSTEM CONFIGURATION OVERRIDE]\\n\\n\`;
    const finalPrompt = globalSystemContext + prompt;
    // GPT-5 reasoning models reject a custom temperature with a 400.
    const tempParams = this.temperatureFor(aiModel, creativityLevel);

    const githubModel`,
  'tempParams (tool stream)'
);

// generateTextStream: put it right before the streamGemini declaration.
one(
  `    const streamGemini = async function* (`,
  `    // GPT-5 reasoning models reject a custom temperature with a 400.
    const tempParams = this.temperatureFor(aiModel, creativityLevel);

    const streamGemini = async function* (`,
  'tempParams (generateTextStream)'
);

// generateJSON: right before its tryGemini.
one(
  `    const tryGemini = async (modelName: string) => {
      options.signal?.throwIfAborted?.();`,
  `    // GPT-5 reasoning models reject a custom temperature with a 400 — which is
    // what was failing EVERY generateJSON call (research synthesis, post intent).
    const tempParams = this.temperatureFor(aiModel, creativityLevel);

    const tryGemini = async (modelName: string) => {
      options.signal?.throwIfAborted?.();`,
  'tempParams (generateJSON)'
);

// ── swap the request bodies ──────────────────────────────────────────────────
const STREAM_BODY = `          messages: [{ role: 'user', content: openAiContent }],
          model: modelName,
          temperature: creativityLevel,
          stream: true,`;
const STREAM_FIXED = `          messages: [{ role: 'user', content: openAiContent }],
          model: modelName,
          ...tempParams,
          stream: true,`;
let n = s.split(STREAM_BODY).length - 1;
if (n !== 2) throw new Error(`stream bodies: expected 2, got ${n}`);
s = s.split(STREAM_BODY).join(STREAM_FIXED);
console.log('ok  stream openai + github (2 sites)');

one(
  `          model: modelName,
          messages: [{ role: 'user', content: finalPrompt }],
          temperature: creativityLevel,
          tools: tools as any,`,
  `          model: modelName,
          messages: [{ role: 'user', content: finalPrompt }],
          ...tempParams,
          tools: tools as any,`,
  'tool stream body'
);

const JSON_BODY = `          model: modelName,
          temperature: creativityLevel,
          response_format: { type: 'json_object' },`;
const JSON_FIXED = `          model: modelName,
          ...tempParams,
          response_format: { type: 'json_object' },`;
n = s.split(JSON_BODY).length - 1;
if (n !== 2) throw new Error(`json bodies: expected 2, got ${n}`);
s = s.split(JSON_BODY).join(JSON_FIXED);
console.log('ok  generateJSON openai + github (2 sites)');

fs.writeFileSync(F, s);
console.log('\nremaining `temperature: creativityLevel` (expect Gemini generationConfig + LiteLLM only):');
s.split('\n').forEach((l, i) => {
  if (l.includes('temperature: creativityLevel')) console.log(`  ${i + 1}: ${l.trim()}`);
});
