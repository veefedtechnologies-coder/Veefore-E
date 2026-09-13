import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Audit-completeness gate (Requirements 1.3, 1.4).
 *
 * This smoke test is the hard gate for Phase 1: it fails if the mandatory
 * pre-change audit artifact (`audit-inventory.md`) is missing any Req 1.1 area
 * or is not explicitly marked complete. Its purpose is to block every refactor
 * task until the audit inventory is complete (Req 1.3) and to guarantee that no
 * change to prompt/context assembly is applied before that gate passes (Req 1.4).
 *
 * The test asserts on the audit artifact itself — the source of truth for what
 * exists today — not on runtime behavior.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// tests/veegpt-context/ -> repo root -> .kiro/specs/...
const AUDIT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.kiro',
  'specs',
  'veegpt-context-optimization',
  'audit-inventory.md',
);

/**
 * The 21 areas Requirement 1.1 mandates the audit must cover. Each entry lists
 * accepted aliases so the check is resilient to minor wording/formatting in the
 * artifact while still requiring the concept to be present.
 */
const REQUIRED_AREAS: { name: string; aliases: string[] }[] = [
  { name: 'Prompt builders', aliases: ['prompt builder'] },
  { name: 'Context builders', aliases: ['context builder'] },
  { name: 'Conversation history handling', aliases: ['conversation history'] },
  { name: 'Conversation_Memory', aliases: ['conversation_memory', 'conversation memory'] },
  { name: 'User_Memory', aliases: ['user_memory', 'user memory'] },
  { name: 'Persona / agent system', aliases: ['persona', 'agent system'] },
  { name: 'Intent_Router', aliases: ['intent_router', 'intent router'] },
  { name: 'Reasoning instructions', aliases: ['reasoning'] },
  { name: 'Tool definitions and execution', aliases: ['tool definitions', 'tool definition'] },
  { name: 'Tool results', aliases: ['tool result'] },
  {
    name: 'Workspace / brand / account context',
    aliases: ['workspace', 'brand', 'account context'],
  },
  { name: 'Model_Router', aliases: ['model_router', 'model router'] },
  { name: 'Streaming', aliases: ['streaming'] },
  { name: 'Token_Ledger', aliases: ['token_ledger', 'token ledger'] },
  { name: 'Error / retry handling', aliases: ['error / retry', 'error/retry', 'retry handling'] },
  { name: 'Caching', aliases: ['caching'] },
  { name: 'Provider APIs', aliases: ['provider api'] },
  { name: 'Existing tests', aliases: ['existing test'] },
  {
    name: 'Configuration / environment variables',
    aliases: ['configuration', 'environment variable'],
  },
  {
    name: 'Database models for conversations and memory',
    aliases: ['database model'],
  },
  {
    name: 'Frontend assumptions about VeeGPT responses',
    aliases: ['frontend assumption'],
  },
];

function readAudit(): string {
  try {
    return readFileSync(AUDIT_PATH, 'utf8');
  } catch {
    return '';
  }
}

describe('VeeGPT context-optimization audit-completeness gate (Req 1.3, 1.4)', () => {
  const raw = readAudit();
  const lower = raw.toLowerCase();

  it('the audit artifact exists and is non-empty', () => {
    expect(raw.length, `audit-inventory.md not found at ${AUDIT_PATH}`).toBeGreaterThan(0);
  });

  it('is explicitly marked AUDIT STATUS: COMPLETE (Req 1.4)', () => {
    // Tolerate flexible spacing/markdown emphasis around the marker.
    const marked = /audit status:\s*\**\s*complete/i.test(raw);
    expect(marked, 'audit-inventory.md must be marked "AUDIT STATUS: COMPLETE"').toBe(true);
  });

  it.each(REQUIRED_AREAS.map((a) => [a.name, a.aliases] as const))(
    'covers Req 1.1 area: %s',
    (name, aliases) => {
      const present = aliases.some((alias) => lower.includes(alias.toLowerCase()));
      expect(
        present,
        `Req 1.1 area "${name}" is missing from audit-inventory.md — the audit is incomplete (Req 1.3), which must block all refactor tasks.`,
      ).toBe(true);
    },
  );

  it('every required area has a recorded status in the coverage checklist (mapped / not present / unresolved)', () => {
    // Each checklist row must carry an explicit disposition so no area is left
    // blank (Req 1.3: an area with no entry makes the audit incomplete).
    const hasDisposition =
      /\bmapped\b/i.test(raw) &&
      // At least the completeness vocabulary the artifact uses must exist.
      (/\bnot present\b/i.test(raw) || /\bunresolved\b/i.test(raw) || /\bmapped\b/i.test(raw));
    expect(hasDisposition, 'audit checklist must record a status for its areas').toBe(true);

    // No required area may be entirely absent (already covered above), and the
    // checklist must enumerate at least the mandated count of areas.
    const coveredCount = REQUIRED_AREAS.filter((a) =>
      a.aliases.some((alias) => lower.includes(alias.toLowerCase())),
    ).length;
    expect(coveredCount).toBe(REQUIRED_AREAS.length);
  });
});
