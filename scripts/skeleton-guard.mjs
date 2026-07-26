#!/usr/bin/env node
/**
 * skeleton-guard.mjs
 *
 * Build-time guard for the consolidated pixel-perfect skeleton loading system.
 * Scans `client/src` and EXITS NON-ZERO (failing the build) when it finds any of:
 *
 *   1. More than one module defining a `Skeleton` PRIMITIVE component.
 *      The canonical definition lives in `client/src/components/ui/skeleton.tsx`.
 *      (Requirement 2.6)
 *   2. Any `Skeleton` export remaining in `LoadingSpinner.tsx`.            (R2.2)
 *   3. Any reference to the monolithic `SkeletonPageLoader`.              (R2.3)
 *   4. Any banned generic-loader pattern used as a PRIMARY loader:
 *        - `animate-spin` on a bare <div>/<span> (CSS-drawn spinner)
 *        - standalone neutral placeholder `animate-pulse` block
 *        - "Loading..." text used as a primary indicator
 *      EXCEPT lines that carry (on the line itself or an immediately adjacent
 *      comment line) an allow marker comment `skeleton-guard-allow:`.
 *      (Requirements 3.2, 3.3, 3.4)
 *
 * Design notes / how false positives are avoided:
 *   - Inline ICON spinners (lucide `<Loader2 .. animate-spin>`, `<RefreshCw>`,
 *     `<Sparkles>`, raw `<svg .. animate-spin>`, etc.) inside buttons are
 *     legitimate micro-interactions, NOT primary content loaders, so the
 *     animate-spin rule only fires on plain <div>/<span> spinner elements.
 *   - Colored status-indicator dots (`bg-green-…`, `bg-red-…`, etc.) and
 *     decorative pulses are NOT neutral placeholder blocks, so the
 *     animate-pulse rule only fires on neutral fills (gray/slate/zinc/neutral/
 *     white|black opacity / muted).
 *   - The composed `*Skeleton` library names (e.g. `KpiCardSkeleton`,
 *     `DashboardSkeleton`) are never mistaken for the `Skeleton` primitive
 *     because the primitive matcher requires the exact identifier `Skeleton`
 *     with word boundaries on both sides.
 *   - Tests, archived code, and `*.example.*` files are skipped.
 *   - The sanctioned single loading status text in `LoadingStatusProvider`
 *     and allow-marked exceptions (pre-auth boot loader, status dots, action
 *     spinners, progress bars, image placeholders, etc.) are tolerated.
 *
 * Usage: `node scripts/skeleton-guard.mjs`
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SCAN_ROOT = join(REPO_ROOT, 'client', 'src');

const CANONICAL_PRIMITIVE = join('client', 'src', 'components', 'ui', 'skeleton.tsx');
const LOADING_SPINNER_FILE = 'LoadingSpinner.tsx';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ALLOW_MARKER = 'skeleton-guard-allow:';

// ── helpers ────────────────────────────────────────────────────────────────

/** Recursively collect source files under a directory, skipping noise. */
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip directories that never contain production loading UI.
      if (entry === 'node_modules' || entry === 'archive' || entry === '__tests__') continue;
      out.push(...collectSourceFiles(full));
      continue;
    }
    const ext = entry.slice(entry.lastIndexOf('.'));
    if (!SOURCE_EXT.has(ext)) continue;
    // Skip test and example files.
    if (/\.(test|spec)\.[jt]sx?$/.test(entry)) continue;
    if (/\.example\.[jt]sx?$/.test(entry)) continue;
    if (/\.d\.ts$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Heuristic: does this line look like part of a comment (JS or JSX)? */
function looksLikeComment(line) {
  const t = line.trim();
  if (t === '') return false;
  return (
    t.startsWith('//') ||
    t.startsWith('/*') ||
    t.startsWith('*') ||
    t.startsWith('{/*') ||
    t.includes('*/') ||
    t.includes('skeleton-guard-allow:')
  );
}

/**
 * True if the line carries an allow marker, or the marker appears in the
 * comment block immediately preceding the line (handles multi-line JSX/JS
 * comments where the marker keyword is on the first comment line), or on the
 * single line immediately following.
 */
function isAllowed(lines, idx) {
  if ((lines[idx] ?? '').includes(ALLOW_MARKER)) return true;
  if ((lines[idx + 1] ?? '').includes(ALLOW_MARKER)) return true;

  // Walk upward through a contiguous comment block looking for the marker.
  for (let j = idx - 1; j >= 0; j--) {
    const line = lines[j] ?? '';
    if (line.includes(ALLOW_MARKER)) return true;
    if (!looksLikeComment(line)) break;
  }
  return false;
}

/** A line is "code" (not a pure comment / doc line) for primitive detection. */
function stripLineComment(line) {
  // Best-effort: drop // line comments and /* */ inline comments for matching.
  return line.replace(/\/\/.*$/, '').replace(/\/\*[^]*?\*\//g, '');
}

// ── detectors ────────────────────────────────────────────────────────────────

/**
 * Detects a `Skeleton` PRIMITIVE definition in a file: a declaration of a
 * component named EXACTLY `Skeleton`. Matches function/const/let/var/class forms.
 * Does NOT match `*Skeleton` composed names (word boundary required before
 * `Skeleton`), and does NOT match re-export statements like `export { Skeleton }`.
 */
const PRIMITIVE_DEF_RE =
  /(?:^|\b)(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+Skeleton\b(?![A-Za-z0-9_$])/;

function definesPrimitive(content) {
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = stripLineComment(raw);
    if (PRIMITIVE_DEF_RE.test(line)) return true;
  }
  return false;
}

/** Detect a `Skeleton` export inside LoadingSpinner.tsx. */
function exportsSkeleton(content) {
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = stripLineComment(raw);
    if (PRIMITIVE_DEF_RE.test(line) && /\bexport\b/.test(line)) return true;
    // `export { Skeleton }` / `export { Skeleton as X }`
    if (/\bexport\s*\{[^}]*\bSkeleton\b[^}]*\}/.test(line)) return true;
    // `export ... Skeleton` default re-export forms
    if (/\bexport\s+\{[^}]*\bSkeleton\s+as\b/.test(line)) return true;
  }
  return false;
}

// Banned generic-loader patterns.
const NEUTRAL_BG_RE = /bg-(?:gray|slate|zinc|neutral|stone)-\d|bg-(?:white|black)\/\d|bg-muted\b/;
const DIV_SPAN_RE = /<(?:div|span)\b/;
const LOADING_TEXT_RE = />\s*Loading\s*(?:\.\.\.|…)\s*</;

/**
 * Scan a single file's lines for banned primary-loader patterns.
 * Returns an array of { line, reason, text } violations.
 */
function scanGenericLoaders(relPath, content) {
  const violations = [];
  const lines = content.split(/\r?\n/);

  // The sanctioned single loading-status text lives in LoadingStatusProvider.
  const isLoadingStatusProvider = /LoadingStatusProvider\.[jt]sx?$/.test(relPath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isAllowed(lines, i)) continue;

    // (4a) CSS-drawn spinner on a bare <div>/<span>.
    if (line.includes('animate-spin') && DIV_SPAN_RE.test(line)) {
      violations.push({
        line: i + 1,
        reason: 'CSS `animate-spin` spinner used as a primary loader (use a Skeleton; annotate with skeleton-guard-allow: if it is an action/status spinner)',
        text: line.trim(),
      });
      continue;
    }

    // (4b) standalone NEUTRAL placeholder `animate-pulse` block.
    if (line.includes('animate-pulse') && DIV_SPAN_RE.test(line) && NEUTRAL_BG_RE.test(line)) {
      violations.push({
        line: i + 1,
        reason: 'Standalone neutral `animate-pulse` placeholder block (use a Skeleton; annotate with skeleton-guard-allow: if decorative)',
        text: line.trim(),
      });
      continue;
    }

    // (4c) "Loading..." primary indicator text.
    if (!isLoadingStatusProvider && LOADING_TEXT_RE.test(line)) {
      violations.push({
        line: i + 1,
        reason: '"Loading..." text used as a primary loading indicator (use a Skeleton)',
        text: line.trim(),
      });
      continue;
    }

    // (3) SkeletonPageLoader reference (also reported structurally below, but
    // surfaced here per-line for a precise location).
    if (line.includes('SkeletonPageLoader')) {
      violations.push({
        line: i + 1,
        reason: 'Reference to the removed monolithic `SkeletonPageLoader` (use a dedicated Page_Skeleton)',
        text: line.trim(),
      });
      continue;
    }
  }
  return violations;
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  let files;
  try {
    files = collectSourceFiles(SCAN_ROOT);
  } catch (err) {
    console.error(`skeleton-guard: failed to scan ${SCAN_ROOT}: ${err.message}`);
    process.exit(2);
  }

  const primitiveDefiners = [];
  const loadingSpinnerSkeletonExports = [];
  const genericViolations = []; // { file, line, reason, text }

  for (const file of files) {
    const relPath = relative(REPO_ROOT, file);
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // (1) Skeleton primitive definitions.
    if (definesPrimitive(content)) {
      primitiveDefiners.push(relPath);
    }

    // (2) Skeleton export still in LoadingSpinner.tsx.
    if (basename(file) === LOADING_SPINNER_FILE && exportsSkeleton(content)) {
      loadingSpinnerSkeletonExports.push(relPath);
    }

    // (3) + (4) Generic-loader / SkeletonPageLoader scan.
    for (const v of scanGenericLoaders(relPath, content)) {
      genericViolations.push({ file: relPath, ...v });
    }
  }

  // ── report ──────────────────────────────────────────────────────────────
  const problems = [];

  // Rule 1: exactly one primitive definition, and it must be the canonical file.
  const nonCanonical = primitiveDefiners.filter(
    (p) => p.replace(/\\/g, '/') !== CANONICAL_PRIMITIVE.replace(/\\/g, '/')
  );
  if (primitiveDefiners.length === 0) {
    problems.push(
      `[primitive] No \`Skeleton\` primitive definition found. Expected exactly one in ${CANONICAL_PRIMITIVE}.`
    );
  } else if (nonCanonical.length > 0) {
    problems.push(
      `[primitive] More than one module defines the \`Skeleton\` primitive (R2.6). ` +
        `Canonical: ${CANONICAL_PRIMITIVE}. Duplicate definition(s):\n` +
        nonCanonical.map((p) => `    - ${p}`).join('\n')
    );
  }

  // Rule 2: no Skeleton export in LoadingSpinner.tsx.
  if (loadingSpinnerSkeletonExports.length > 0) {
    problems.push(
      `[loading-spinner] \`Skeleton\` export still present in (R2.2):\n` +
        loadingSpinnerSkeletonExports.map((p) => `    - ${p}`).join('\n')
    );
  }

  // Rules 3 & 4: generic-loader / SkeletonPageLoader line violations.
  if (genericViolations.length > 0) {
    const grouped = new Map();
    for (const v of genericViolations) {
      if (!grouped.has(v.file)) grouped.set(v.file, []);
      grouped.get(v.file).push(v);
    }
    const lines = [`[generic-loaders] ${genericViolations.length} banned loader pattern(s) found (R3.2/3.3/3.4):`];
    for (const [file, vs] of grouped) {
      lines.push(`  ${file}`);
      for (const v of vs) {
        lines.push(`    ${file}:${v.line}  ${v.reason}`);
        lines.push(`        > ${v.text}`);
      }
    }
    problems.push(lines.join('\n'));
  }

  console.log('── skeleton-guard ────────────────────────────────────────────');
  console.log(`Scanned ${files.length} source file(s) under client/src`);
  console.log(`Skeleton primitive definitions: ${primitiveDefiners.length} (${primitiveDefiners.join(', ') || 'none'})`);

  if (problems.length === 0) {
    console.log('Result: PASS — no skeleton-system violations detected.');
    console.log('──────────────────────────────────────────────────────────────');
    process.exit(0);
  }

  console.error('Result: FAIL — skeleton-system violations detected:\n');
  for (const p of problems) {
    console.error(p);
    console.error('');
  }
  console.error(`Total: ${problems.length} violation group(s).`);
  console.error('Fix the violations above or, for legitimate non-content-structure');
  console.error('loaders (status dots, action spinners, decorative pulses, the pre-auth');
  console.error('boot loader, progress bars, image placeholders), add an inline comment');
  console.error('marker `skeleton-guard-allow: <reason>` on or adjacent to the line.');
  console.error('──────────────────────────────────────────────────────────────');
  process.exit(1);
}

main();
