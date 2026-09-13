// Reproduce the EXACT dev failure: transform client/src/pages/VeeGPT.tsx through
// vite in middleware mode with the config server/vite.ts loads. That is the file
// and the code path that reported:
//   Failed to resolve import "@shared/attachment-support" from "client/src/pages/VeeGPT.tsx"
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = process.cwd();
const server = await createServer({
  configFile: path.join(ROOT, 'client', 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});

const FILES = [
  'src/pages/VeeGPT.tsx',
  'src/features/chat/components/ComposerPlusMenu.tsx',
  'src/features/chat/components/ChatInterface.tsx',
];

let failed = 0;
try {
  for (const rel of FILES) {
    try {
      const out = await server.transformRequest('/' + rel);
      if (!out?.code) throw new Error('no code emitted');
      console.log(`ok    ${rel}  (${out.code.length} bytes)`);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${rel}\n        ${String(err.message).split('\n')[0]}`);
    }
  }
} finally {
  await server.close();
}
console.log(failed ? `\n${failed} FILE(S) STILL FAIL` : '\nPASS — dev server transforms all of these');
process.exit(failed ? 1 : 0);
