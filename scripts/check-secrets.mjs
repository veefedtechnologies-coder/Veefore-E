#!/usr/bin/env node
/**
 * Secret-hygiene check (spec: production-security-hardening, Requirement 14.3).
 *
 * Fails when a file matching a secret pattern is TRACKED by git. Run in CI and,
 * ideally, as a pre-commit hook.
 *
 * Scope note: this inspects the git INDEX, not file contents. It catches the
 * "someone committed a key file" mistake, which is the common one. It does not
 * attempt inline-secret detection (an API key pasted into a source file) — that
 * needs a dedicated scanner such as gitleaks and is out of scope here.
 *
 * IMPORTANT: removing a committed secret from the working tree does NOT invalidate
 * it. Anything this script finds must also be ROTATED (Requirement 14.4).
 */

import { execSync } from 'node:child_process';

/** Filenames/paths that should never be tracked. */
const SECRET_PATTERNS = [
  { re: /(^|\/)\.env$/, why: 'populated environment file' },
  { re: /(^|\/)\.env\.(local|production|prod|staging|development|dev)$/, why: 'populated environment file' },
  { re: /\.pem$/, why: 'PEM key or certificate' },
  { re: /\.key$/, why: 'private key' },
  { re: /\.p12$|\.pfx$/, why: 'PKCS#12 keystore' },
  { re: /(^|\/)id_rsa$|(^|\/)id_ed25519$/, why: 'SSH private key' },
  { re: /service-?account.*\.json$/i, why: 'service account credentials' },
  { re: /(^|\/)credentials\.json$/i, why: 'credentials file' },
];

/**
 * Paths that are legitimately tracked despite matching a pattern.
 * Every entry needs a justification — this list is the audit trail.
 */
const ALLOWLIST = [
  // Templates carry placeholders only, never real values.
  { re: /\.env\.example$/, why: 'template with placeholder values' },
  { re: /\.env\.litellm\.example$/, why: 'template with placeholder values' },
  { re: /\.env\.(railway|vercel)$/, why: 'deployment variable NAME manifests (no values)' },
];

function tracked() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (error) {
    console.error('[check-secrets] could not read the git index:', error.message);
    // Exit non-zero: an unrunnable check must not silently "pass" in CI.
    process.exit(2);
  }
}

const findings = [];
for (const file of tracked()) {
  if (ALLOWLIST.some((a) => a.re.test(file))) continue;
  const hit = SECRET_PATTERNS.find((p) => p.re.test(file));
  if (hit) findings.push({ file, why: hit.why });
}

if (findings.length === 0) {
  console.log('[check-secrets] OK — no secret-shaped files are tracked by git.');
  process.exit(0);
}

console.error('\n[check-secrets] FAILED — secret-shaped files are tracked by git:\n');
for (const f of findings) {
  console.error(`  ✗ ${f.file}\n      ${f.why}`);
}
console.error(
  '\nTo remediate:\n' +
    '  1. git rm --cached <file>   (and add it to .gitignore)\n' +
    '  2. ROTATE the secret. Removing the file does NOT invalidate a key that has\n' +
    '     already been committed — it remains in the repository history.\n' +
    '  3. If the value was never sensitive, add it to ALLOWLIST in this script with\n' +
    '     a justification.\n'
);
process.exit(1);
