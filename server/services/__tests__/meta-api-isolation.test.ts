/**
 * Architectural Enforcement Test: Meta API Isolation
 *
 * This test ensures that NO NEW file outside GovernedHttpClient.ts makes direct
 * HTTP calls (via axios, fetch, or URL construction) to Meta's Graph API
 * endpoints (graph.facebook.com / graph.instagram.com).
 *
 * All Meta API calls MUST flow through the GovernedHttpClient to ensure
 * usage headers are captured and rate-limit governance is enforced.
 *
 * Files in KNOWN_VIOLATIONS_PENDING_MIGRATION are tracked legacy code that
 * predates GovernedHttpClient. They should be migrated progressively (see task 4.2).
 * Adding new files here is NOT allowed — new code must use GovernedHttpClient.
 *
 * Validates: Requirement 1.8 — Architectural isolation enforcement
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Root directory to scan (server source code) */
const SERVER_ROOT = path.resolve(__dirname, '../../');

/**
 * Files that are ALLOWED to reference Meta Graph API URLs directly.
 * GovernedHttpClient is the sole governed wrapper.
 * rateLimitConfig may contain documentation/comments referencing the URLs.
 */
const ALLOWED_FILES: string[] = [
  'services/GovernedHttpClient.ts',
  'services/BackfillService.ts',
  'config/rateLimitConfig.ts',
];

/**
 * Known violations — legacy files that predate GovernedHttpClient and are
 * pending migration (tracked by task 4.2). These files are allowed to have
 * Meta API URLs for now but MUST be migrated.
 *
 * DO NOT ADD NEW FILES HERE. New code must use GovernedHttpClient.
 * When a file is migrated, remove it from this list.
 */
const KNOWN_VIOLATIONS_PENDING_MIGRATION: string[] = [
  'index.ts',
  'instagram-api.ts',
  'instagram-diagnostics.ts',
  'instagram-oauth.ts',
  'instagram-permission-helper.ts',
  'instagram-token-manager.ts',
  'instagram-token-refresh.ts',
  'middleware/cors-security.ts',
  'real-content-service.ts',
  'services/api-monitor.ts',
  'services/instagramApi.ts',
  'shared/auth/controllers/OAuthController.ts',
  'workers/automationWorker.ts',
  'workers/messageWorker.ts',
  'features/instagram/services/instagram.service.ts',
  'authentic-hashtags.ts',
  'automation-system.ts',
  'direct-instagram-publisher.ts',
];

/**
 * Directories/paths to EXCLUDE from scanning entirely.
 * - scripts/: ad-hoc test/debug scripts not part of production code
 * - archive/: archived/deprecated code not in production
 * - __tests__/: test files may reference URLs for mocking/assertion
 * - node_modules/: third-party code
 * - dist/: build output
 */
const EXCLUDED_PATTERNS: string[] = [
  '/scripts/',
  '/archive/',
  '/__tests__/',
  '/node_modules/',
  '/dist/',
  '.test.ts',
  '.spec.ts',
  '.test.tsx',
  '.spec.tsx',
];

/**
 * Patterns that indicate a direct Meta API call or URL construction.
 * We look for string literals or template literals containing these domains.
 */
const META_API_PATTERNS: RegExp[] = [
  /['"`]https?:\/\/graph\.facebook\.com/,
  /['"`]https?:\/\/graph\.instagram\.com/,
  /graph\.facebook\.com/,
  /graph\.instagram\.com/,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all TypeScript files in a directory.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip excluded directories
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'scripts') {
        continue;
      }
      results.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Check if a file path should be excluded from scanning.
 */
function isExcluded(filePath: string): boolean {
  const relativePath = path.relative(SERVER_ROOT, filePath).replace(/\\/g, '/');

  // Check if it's an explicitly allowed file
  for (const allowed of ALLOWED_FILES) {
    if (relativePath === allowed) {
      return true;
    }
  }

  // Check excluded patterns
  for (const pattern of EXCLUDED_PATTERNS) {
    if (filePath.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a file is a known legacy violation pending migration.
 */
function isKnownViolation(filePath: string): boolean {
  const relativePath = path.relative(SERVER_ROOT, filePath).replace(/\\/g, '/');

  for (const known of KNOWN_VIOLATIONS_PENDING_MIGRATION) {
    if (relativePath === known) {
      return true;
    }
  }

  return false;
}

/**
 * Scan a file for direct Meta API URL references.
 * Returns an array of violations with line numbers.
 */
function scanFileForViolations(filePath: string): Array<{ line: number; content: string }> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: Array<{ line: number; content: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments (single-line and JSDoc/block comment lines)
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    // Check each Meta API pattern
    for (const pattern of META_API_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          line: i + 1,
          content: trimmed.substring(0, 120), // Truncate long lines
        });
        break; // Only report each line once
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Meta API Architectural Isolation', () => {
  it('should not have NEW direct Meta Graph API calls outside GovernedHttpClient.ts', () => {
    const tsFiles = collectTsFiles(SERVER_ROOT);
    const newViolations: Array<{
      file: string;
      violations: Array<{ line: number; content: string }>;
    }> = [];

    for (const filePath of tsFiles) {
      // Skip excluded files, allowed files, and known legacy violations
      if (isExcluded(filePath) || isKnownViolation(filePath)) continue;

      const violations = scanFileForViolations(filePath);
      if (violations.length > 0) {
        newViolations.push({
          file: path.relative(SERVER_ROOT, filePath).replace(/\\/g, '/'),
          violations,
        });
      }
    }

    if (newViolations.length > 0) {
      const report = newViolations
        .map(({ file, violations }) => {
          const details = violations
            .map((v) => `    Line ${v.line}: ${v.content}`)
            .join('\n');
          return `  ${file}:\n${details}`;
        })
        .join('\n\n');

      expect.fail(
        `Found NEW direct Meta Graph API references outside GovernedHttpClient.ts.\n` +
          `All Meta API calls must go through GovernedHttpClient for rate-limit governance.\n\n` +
          `New violations:\n${report}\n\n` +
          `To fix: use GovernedHttpClient.request() instead of direct axios/fetch calls.\n` +
          `Do NOT add these files to KNOWN_VIOLATIONS_PENDING_MIGRATION — new code must use the governed wrapper.`
      );
    }

    expect(newViolations).toHaveLength(0);
  });

  it('should have GovernedHttpClient.ts as the sole Meta API gateway', () => {
    const governedClientPath = path.join(SERVER_ROOT, 'services', 'GovernedHttpClient.ts');
    expect(
      fs.existsSync(governedClientPath),
      'GovernedHttpClient.ts must exist as the sole Meta API gateway'
    ).toBe(true);

    // Verify it actually contains Meta API URL references (it's the wrapper)
    const content = fs.readFileSync(governedClientPath, 'utf-8');
    const hasMetaReference = META_API_PATTERNS.some((p) => p.test(content));
    expect(
      hasMetaReference,
      'GovernedHttpClient.ts should reference Meta Graph API endpoints'
    ).toBe(true);
  });

  it('should track all known legacy violations (none should be removed without migration)', () => {
    // This test verifies that our known violations list is accurate.
    // If a file no longer exists or no longer has violations, it should be
    // removed from KNOWN_VIOLATIONS_PENDING_MIGRATION.
    const staleEntries: string[] = [];

    for (const knownFile of KNOWN_VIOLATIONS_PENDING_MIGRATION) {
      const fullPath = path.join(SERVER_ROOT, knownFile);
      if (!fs.existsSync(fullPath)) {
        staleEntries.push(`${knownFile} (file does not exist)`);
        continue;
      }

      const violations = scanFileForViolations(fullPath);
      if (violations.length === 0) {
        staleEntries.push(`${knownFile} (no longer has violations — migrated!)`);
      }
    }

    if (staleEntries.length > 0) {
      expect.fail(
        `The following entries in KNOWN_VIOLATIONS_PENDING_MIGRATION are stale and should be removed:\n` +
          staleEntries.map((e) => `  - ${e}`).join('\n') +
          `\n\nRemove migrated files from the list to keep it accurate.`
      );
    }
  });
});
