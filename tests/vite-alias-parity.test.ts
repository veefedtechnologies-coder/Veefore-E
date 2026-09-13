/**
 * Alias parity across the FOUR vite configs (plus two vitest configs).
 *
 * This repo has separate configs for prod client, SSR, the root config, and — the
 * one that bit us — `client/vite.config.ts`, which is what the dev middleware in
 * server/vite.ts loads. `@shared/attachment-support` built fine in production and
 * then failed at dev time with "Failed to resolve import", because only that
 * config was missing the alias.
 *
 * Rather than trusting them to stay in sync, resolve each config for real and
 * assert the shared aliases exist and point at directories that actually exist.
 */
import { describe, it, expect } from 'vitest';
import { resolveConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

/** Configs that build or serve the CLIENT app and therefore need the aliases. */
const CONFIGS = [
  'vite.config.ts',
  'vite.client.config.ts',
  'vite.ssr.config.ts',
  'client/vite.config.ts',
];

/** Aliases every client-facing config must provide. */
const REQUIRED = ['@', '@shared'];

function aliasMap(resolved: any): Record<string, string> {
  const alias = resolved.resolve?.alias;
  const out: Record<string, string> = {};
  if (Array.isArray(alias)) {
    for (const a of alias) {
      if (typeof a.find === 'string') out[a.find] = a.replacement;
    }
  } else if (alias && typeof alias === 'object') {
    Object.assign(out, alias);
  }
  return out;
}

describe.each(CONFIGS)('%s', configFile => {
  it('declares the required aliases, pointing at real directories', async () => {
    const resolved = await resolveConfig(
      { configFile: path.join(ROOT, configFile) },
      'build'
    );
    const map = aliasMap(resolved);

    for (const key of REQUIRED) {
      expect(map[key], `${configFile} is missing the "${key}" alias`).toBeTruthy();
      const target = map[key];
      expect(
        fs.existsSync(target),
        `${configFile}: "${key}" → ${target} does not exist`
      ).toBe(true);
    }
  }, 60_000);
});

describe('the shared module the aliases are for', () => {
  it('exists at shared/attachment-support.ts', () => {
    expect(fs.existsSync(path.join(ROOT, 'shared/attachment-support.ts'))).toBe(true);
  });

  it('every @shared alias resolves to the SAME directory', async () => {
    const targets = new Set<string>();
    for (const configFile of CONFIGS) {
      const resolved = await resolveConfig(
        { configFile: path.join(ROOT, configFile) },
        'build'
      );
      targets.add(path.resolve(aliasMap(resolved)['@shared']));
    }
    expect(targets.size, `@shared points at different dirs: ${[...targets].join(' | ')}`).toBe(1);
    expect([...targets][0]).toBe(path.join(ROOT, 'shared'));
  }, 60_000);
});
