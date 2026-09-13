/**
 * VeeGPT context debug harness — deterministic proof that the composer path
 * works, run WITHOUT the live server (no API keys, no DB, no model calls).
 *
 * WHAT IT DOES
 * ------------
 * For a spread of representative prompts (simple chat, conceptual, content,
 * analytics, research, scheduling, a MULTI-TOOL compound request, memory recall,
 * a forced tool, an over-tier attempt, and a long conversation) it runs the REAL
 * production pipeline:
 *
 *     classifyIntent → selectModules → selectTools → compose
 *
 * and, for each scenario, records:
 *   • the detected capability intent (+ ambiguous / fail-open flags),
 *   • which Context_Modules were selected (NEW) vs the full registry (baseline),
 *   • which tools were exposed (NEW, narrowed) vs the full tier set (baseline),
 *   • the per-category input-token breakdown, and
 *   • the estimated input tokens NEW vs the "send everything" baseline, with the
 *     percentage reduction.
 *
 * It then writes a human-readable report + machine JSON:
 *   logs/veegpt-context-harness.md
 *   logs/veegpt-context-harness.json
 *
 * TOKENS: these are the app's own ~4-chars/token ESTIMATE (the exact same
 * heuristic the usage tracker falls back to). For EXACT provider counts —
 * including reasoning — enable VEEGPT_CTX_DEBUG and read logs/veegpt-context-debug.jsonl
 * from real requests (see server/routes/veegpt-context-debug.ts).
 *
 * RUN:  npx tsx scripts/veegpt-context-debug-harness.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  classifyIntent,
  type Capability,
} from '../server/routes/veegpt-intent.logic';
import {
  selectModules,
  CONTEXT_MODULES,
  type ComposeInput,
} from '../server/routes/veegpt-modules';
import {
  selectTools,
  ALL_VEEGPT_TOOLS,
} from '../server/routes/veegpt-tool-selection.logic';
import { compose } from '../server/routes/veegpt-context-composer';
import { filterToolsByTier, type VeeGPTTier } from '../server/config/veegpt-tiers';
import type { Msg } from '../server/routes/veegpt-memory.logic';
import type { MemoryItem } from '../server/routes/veegpt-memory-retrieval.logic';

// ---------------------------------------------------------------------------
// Scenario set (varied prompts + a multi-tool compound request)
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  message: string;
  tier: VeeGPTTier;
  priorMessages?: Msg[];
  forcedTool?: string;
  selectedAgentId?: string | null;
  selectedAccountId?: string | null;
  hasMedia?: boolean;
  memory?: MemoryItem[];
  memorySummary?: string;
  workspaceContext?: string;
}

const MEM: MemoryItem[] = [
  { id: 'm1', text: 'brand color is blue' },
  { id: 'm2', text: 'user name is Ravi' },
  { id: 'm3', text: 'posting schedule is Sunday and Monday' },
  { id: 'm4', text: 'target audience is fitness enthusiasts' },
];

const SCENARIOS: Scenario[] = [
  { name: '1. Simple greeting', message: 'hey there!', tier: 'advanced', memory: MEM },
  {
    name: '2. Conceptual question (prose only)',
    message: 'what makes a good hook for short-form video?',
    tier: 'advanced',
    memory: MEM,
  },
  {
    name: '3. Content creation (caption + hashtags)',
    message: 'write me a caption and some hashtags for my new reel',
    tier: 'advanced',
    memory: MEM,
  },
  {
    name: '4. Analytics request',
    message: 'how is my engagement and reach performing this month?',
    tier: 'full',
    selectedAccountId: 'acc1',
    memory: MEM,
  },
  {
    name: '5. Research / trends',
    message: 'research the latest short-form video trends and competitors',
    tier: 'full',
    memory: MEM,
  },
  {
    name: '6. Scheduling',
    message: 'schedule this post for tomorrow at 5pm',
    tier: 'full',
    hasMedia: true,
    selectedAccountId: 'acc1',
    memory: MEM,
  },
  {
    name: '7. MULTI-TOOL compound (schedule + caption + remember)',
    message:
      'schedule my reel for Friday, update the caption on my other post, and remember my brand is Acme',
    tier: 'full',
    memory: MEM,
  },
  {
    name: '8. Memory recall (single fact)',
    message: 'what is my brand color again?',
    tier: 'advanced',
    memory: MEM,
  },
  {
    name: '9. Broad recall (fails open to all memory)',
    message: 'what do you know about me?',
    tier: 'advanced',
    memory: MEM,
  },
  {
    name: '10. Forced tool (search_web)',
    message: 'here is my topic: morning routines',
    tier: 'full',
    forcedTool: 'search_web',
    memory: MEM,
  },
  {
    name: '11. Over-tier attempt (Basic tries to schedule)',
    message: 'schedule this post for tomorrow at 5pm',
    tier: 'basic',
    memory: MEM,
  },
  {
    name: '12. Long conversation w/ summary',
    message: 'so given all that, what should I focus on next?',
    tier: 'advanced',
    priorMessages: Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `earlier turn ${i} about my fitness content plan`,
    })) as Msg[],
    memorySummary:
      'The user is planning a fitness content calendar targeting beginners.',
    memory: MEM,
  },
];

// ---------------------------------------------------------------------------
// Run one scenario through the real pipeline (NEW) and a "send everything"
// baseline (FULL) for an apples-to-apples token comparison.
// ---------------------------------------------------------------------------

function toInput(s: Scenario): ComposeInput {
  return {
    prefs: { contentSafety: 'strict', aiMemory: 'long-term', captionStyle: 'punchy' },
    selectedAgentId: s.selectedAgentId ?? null,
    history: s.priorMessages ?? [],
    currentMessage: s.message,
    memorySummary: s.memorySummary,
    userMemoryProfile: (s.memory ?? []).map((m) => `- [id:${m.id}] ${m.text}`).join('\n'),
    workspaceContext: s.workspaceContext,
    selectedAccountId: s.selectedAccountId ?? null,
    forcedTool: s.forcedTool,
    hasMedia: s.hasMedia,
    tier: s.tier,
  } as ComposeInput;
}

function toolNames(tools: readonly any[]): string[] {
  return tools
    .map((t) => t?.function?.name)
    .filter((n): n is string => Boolean(n))
    .sort();
}

interface Result {
  name: string;
  message: string;
  tier: VeeGPTTier;
  intents: Capability[];
  ambiguous: boolean;
  usedFallback: boolean;
  newModuleCount: number;
  fullModuleCount: number;
  newTools: string[];
  fullTierTools: string[];
  perCategoryTokens: Record<string, number>;
  newInputTokens: number;
  fullInputTokens: number;
  reductionPct: number;
  overTierExposed: string[];
}

function runScenario(s: Scenario): Result {
  const input = toInput(s);

  const intent = classifyIntent({
    message: s.message,
    priorMessages: s.priorMessages ?? [],
    hasMedia: Boolean(s.hasMedia),
    forcedTool: s.forcedTool,
    selectedAccountId: s.selectedAccountId ?? null,
  });

  // NEW (optimized) selection.
  const newModules = selectModules(intent, input);
  const newTools = selectTools({
    tier: s.tier,
    intents: intent.intents,
    ambiguous: intent.ambiguous,
    forcedTool: s.forcedTool ?? null,
  }).tools;
  const composedNew = compose(newModules, newTools, input);

  // FULL baseline: every module + every tool the tier permits ("send it all").
  const fullTierTools = filterToolsByTier([...ALL_VEEGPT_TOOLS], s.tier);
  const composedFull = compose(CONTEXT_MODULES, fullTierTools, input);

  const newInput = composedNew.telemetry.totalInputTokens;
  const fullInput = composedFull.telemetry.totalInputTokens;
  const reductionPct = fullInput > 0 ? ((fullInput - newInput) / fullInput) * 100 : 0;

  // Safety check: no exposed tool may be above the user's tier.
  const tierNames = new Set(toolNames(fullTierTools));
  const overTier = toolNames(newTools).filter((n) => !tierNames.has(n));

  return {
    name: s.name,
    message: s.message,
    tier: s.tier,
    intents: intent.intents,
    ambiguous: intent.ambiguous,
    usedFallback: intent.usedFallback,
    newModuleCount: composedNew.selectedModuleIds.length,
    fullModuleCount: composedFull.selectedModuleIds.length,
    newTools: toolNames(newTools),
    fullTierTools: toolNames(fullTierTools),
    perCategoryTokens: composedNew.telemetry.perCategoryTokens as unknown as Record<string, number>,
    newInputTokens: newInput,
    fullInputTokens: fullInput,
    reductionPct,
    overTierExposed: overTier,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function main(): void {
  const results = SCENARIOS.map(runScenario);

  const outDir = path.join(process.cwd(), 'logs');
  fs.mkdirSync(outDir, { recursive: true });

  const lines: string[] = [];
  lines.push('# VeeGPT context composer — debug harness report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(
    'Tokens are the app\'s ~4-chars/token ESTIMATE (the same fallback the usage ' +
      'tracker uses). "NEW" = what the composer selects for the message. "FULL" = ' +
      'composing EVERY module + EVERY tier-permitted tool (the "send everything" ' +
      'baseline). Reduction is how much smaller the input is because the composer ' +
      'only includes what the message needs.'
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Scenario | Tier | Intent | Tools NEW/FULL | Modules NEW/FULL | Input tokens NEW | Input tokens FULL | Reduction |');
  lines.push('|---|---|---|---|---|---:|---:|---:|');
  for (const r of results) {
    lines.push(
      `| ${r.name} | ${r.tier} | ${r.intents.join(',')}${r.ambiguous ? ' (ambiguous)' : ''} | ` +
        `${r.newTools.length}/${r.fullTierTools.length} | ${r.newModuleCount}/${r.fullModuleCount} | ` +
        `${fmt(r.newInputTokens)} | ${fmt(r.fullInputTokens)} | ${r.reductionPct.toFixed(1)}% |`
    );
  }
  lines.push('');

  const totalNew = results.reduce((s, r) => s + r.newInputTokens, 0);
  const totalFull = results.reduce((s, r) => s + r.fullInputTokens, 0);
  const overallPct = totalFull > 0 ? ((totalFull - totalNew) / totalFull) * 100 : 0;
  lines.push(
    `**Across all ${results.length} scenarios:** NEW=${fmt(totalNew)} input tokens vs ` +
      `FULL=${fmt(totalFull)} → **${overallPct.toFixed(1)}% smaller** on this set.`
  );
  lines.push('');

  // Safety roll-up.
  const anyOverTier = results.filter((r) => r.overTierExposed.length > 0);
  lines.push('## Safety check (tier gating)');
  lines.push('');
  lines.push(
    anyOverTier.length === 0
      ? '✅ No scenario exposed a tool above the user\'s tier.'
      : `❌ ${anyOverTier.length} scenario(s) exposed an over-tier tool: ` +
          anyOverTier.map((r) => `${r.name} → ${r.overTierExposed.join(',')}`).join('; ')
  );
  lines.push('');

  lines.push('## Per-scenario detail');
  lines.push('');
  for (const r of results) {
    lines.push(`### ${r.name}`);
    lines.push('');
    lines.push(`- **Message:** ${JSON.stringify(r.message)}`);
    lines.push(`- **Tier:** ${r.tier}`);
    lines.push(
      `- **Detected intent:** ${r.intents.join(', ')}` +
        `${r.ambiguous ? '  (ambiguous → widened)' : ''}${r.usedFallback ? '  (fail-open)' : ''}`
    );
    lines.push(`- **Tools exposed (NEW):** ${r.newTools.length ? r.newTools.join(', ') : '(none)'}`);
    lines.push(`- **Tools available at tier (FULL):** ${r.fullTierTools.length}`);
    lines.push(`- **Modules selected:** ${r.newModuleCount} of ${r.fullModuleCount}`);
    lines.push(
      `- **Input tokens:** NEW ${fmt(r.newInputTokens)} vs FULL ${fmt(r.fullInputTokens)} ` +
        `→ ${r.reductionPct.toFixed(1)}% smaller`
    );
    const cats = Object.entries(r.perCategoryTokens)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}=${fmt(v)}`)
      .join(', ');
    lines.push(`- **Where the NEW tokens go:** ${cats || '(none)'}`);
    lines.push('');
  }

  const mdPath = path.join(outDir, 'veegpt-context-harness.md');
  const jsonPath = path.join(outDir, 'veegpt-context-harness.json');
  fs.writeFileSync(mdPath, lines.join('\n'));
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

  // Console summary so the run is self-verifying.
  console.log(`\nWrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}\n`);
  console.log(`Scenarios: ${results.length}`);
  console.log(`Overall input tokens: NEW=${fmt(totalNew)}  FULL=${fmt(totalFull)}  (${overallPct.toFixed(1)}% smaller)`);
  console.log(
    anyOverTier.length === 0
      ? 'Tier safety: OK (no over-tier tool exposed)'
      : `Tier safety: FAIL (${anyOverTier.length} scenario(s))`
  );
}

main();
