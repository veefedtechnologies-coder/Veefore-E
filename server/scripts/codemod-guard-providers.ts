/**
 * Codemod: route direct provider-client construction through the guarded factories.
 *
 * Replaces `new OpenAI(...)` → `createOpenAI(...)` and
 * `new GoogleGenerativeAI(...)` → `createGemini(...)`, adding the import.
 *
 * Deliberately conservative:
 *  • skips AIServiceManager (it records its own usage; guarding would double-count)
 *  • skips files already converted (idempotent — safe to re-run)
 *  • never rewrites the SDK import itself, only the construction site
 *  • prints a summary and does nothing without --apply
 *
 * Run:  npx tsx server/scripts/codemod-guard-providers.ts [--apply]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');

/**
 * Files to convert.
 *
 * The first group was the uncovered LIVE set from audit-ai-coverage.ts. The
 * second group is DEAD — unreachable from any entry point today — and is
 * converted anyway, because "dead" is a property of the current import graph,
 * not of the file. A single future import would make one of these live again with
 * a RAW SDK client the guard cannot see, which is exactly the bypass this whole
 * layer exists to prevent. Converting them now costs nothing and removes the
 * latent hole.
 */
const TARGETS = [
  // ── Reachable from an entry point ────────────────────────────────────────
  'server/ai-copilot.ts',
  'server/ai-growth-insights.ts',
  'server/content-repurpose-ai.ts',
  'server/creative-brief-ai.ts',
  'server/features/ai/controllers/chat.controller.ts',
  'server/features/ai/controllers/content-generation.controller.ts',
  'server/features/ai/controllers/image-generation.controller.ts',
  'server/gemini-script-generator.ts',
  'server/hybrid-image-generator.ts',
  'server/openai-client.ts',
  'server/routes/v1/thumbnails.routes.ts',
  'server/services/TriggerEngine.ts',
  'server/services/openai-service.ts',
  'server/services/working-video-generator.ts',
  'server/thumbnail-ai-service-complete.ts',
  'server/thumbnail-ai-service.ts',
  'server/thumbnail-dalle-generator.ts',
  'server/services/LandingCaptionService.ts',

  // ── Currently DEAD, converted so they cannot become a bypass later ───────
  'server/ab-testing-ai.ts',
  'server/affiliate-engine-ai.ts',
  'server/ai-response-generator.ts',
  'server/ai-story-generator.ts',
  'server/ai-suggestions-service.ts',
  'server/content-recommendation-service.ts',
  'server/conversation-memory-service.ts',
  'server/features/ai/services/gemini.service.ts',
  'server/features/ai/services/openai.service.ts',
  'server/hybrid-ai-service.ts',
  'server/persona-suggestions-ai.ts',
  'server/real-video-processor.ts',
  'server/video-shortener-ai.ts',
];

const GUARD_MODULE = 'server/services/ai-provider-guard.ts';

/** Relative import specifier from `fromFile` to the guard module. */
function guardSpecifier(fromFile: string): string {
  const from = path.dirname(path.join(REPO, fromFile));
  const to = path.join(REPO, GUARD_MODULE).replace(/\.ts$/, '');
  let rel = path.relative(from, to).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

/**
 * Insert the guard import after the final top-level import STATEMENT.
 *
 * "Statement", not "line": a multi-line named import
 *
 *     import {
 *       Foo,
 *       Bar,
 *     } from './types';
 *
 * only has `import` on its FIRST line. An earlier version tracked the last line
 * beginning with `import` and spliced immediately after it, which dropped the new
 * import INSIDE the brace list and produced a syntax error. So track the line that
 * CLOSES each import instead.
 */
function addImport(src: string, names: string[], spec: string): string {
  const importText = src
    .split('\n')
    .filter(l => /^\s*import\s|^\s*}\s*from\s/.test(l))
    .join('\n');
  const needed = names.filter(n => !new RegExp(`\\b${n}\\b`).test(importText));
  if (!needed.length) return src;
  const stmt = `import { ${names.join(', ')} } from '${spec}';`;
  const lines = src.split('\n');

  let end = -1;
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!open && /^\s*import\b/.test(line)) {
      // A single-line import ends on its own line; otherwise wait for the `}`.
      const closes = /\bfrom\s+['"][^'"]+['"]\s*;?\s*$/.test(line) || !line.includes('{');
      if (closes) end = i;
      else open = true;
      continue;
    }
    if (open) {
      if (/^\s*}\s*from\s+['"][^'"]+['"]\s*;?\s*$/.test(line)) {
        end = i;
        open = false;
      }
      continue;
    }
    // Stop once real code begins, so a later `import()` expression is ignored.
    if (end >= 0 && line.trim() && !line.trim().startsWith('*') && !line.trim().startsWith('//')) {
      break;
    }
  }

  if (end === -1) return `${stmt}\n${src}`;
  lines.splice(end + 1, 0, stmt);
  return lines.join('\n');
}

let changed = 0;
let skipped = 0;
const report: string[] = [];

for (const rel of TARGETS) {
  const full = path.join(REPO, rel);
  if (!fs.existsSync(full)) {
    report.push(`SKIP (missing)      ${rel}`);
    skipped++;
    continue;
  }
  const src = fs.readFileSync(full, 'utf8');

  const hasOpenAI = /new\s+OpenAI\s*\(/.test(src);
  const hasGemini = /new\s+GoogleGenerativeAI\s*\(/.test(src);
  if (!hasOpenAI && !hasGemini) {
    report.push(`SKIP (nothing)      ${rel}`);
    skipped++;
    continue;
  }

  let out = src;
  const names: string[] = [];
  if (hasOpenAI) {
    out = out.replace(/new\s+OpenAI\s*\(/g, 'createOpenAI(');
    names.push('createOpenAI');
  }
  if (hasGemini) {
    out = out.replace(/new\s+GoogleGenerativeAI\s*\(/g, 'createGemini(');
    names.push('createGemini');
  }
  out = addImport(out, names, guardSpecifier(rel));

  const nOpen = (src.match(/new\s+OpenAI\s*\(/g) || []).length;
  const nGem = (src.match(/new\s+GoogleGenerativeAI\s*\(/g) || []).length;
  report.push(
    `CONVERT             ${rel}  (openai=${nOpen}, gemini=${nGem})`
  );
  changed++;
  if (APPLY) fs.writeFileSync(full, out, 'utf8');
}

console.log(report.join('\n'));
console.log(
  `\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${changed} file(s) to convert, ${skipped} skipped`
);
if (!APPLY) console.log('Re-run with --apply to write changes.');
