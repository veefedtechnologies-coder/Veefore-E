#!/usr/bin/env node
/**
 * Tenant-isolation coverage check
 * (spec: production-security-hardening, Requirement 13.4).
 *
 * WHY THIS EXISTS
 * ---------------
 * A manual audit found real cross-tenant holes: unauthenticated destructive
 * Instagram endpoints, 16 unguarded `/:workspaceId` social-listening routes, an
 * IDOR on `:ruleId`, and unguarded reads of another tenant's AI configuration.
 * Every one was found by a human reading files. Without an automated equivalent, the
 * NEXT unguarded route is found the same way — or by an attacker.
 *
 * WHAT IT DOES
 * ------------
 * Statically scans route files for registrations that accept a workspace identifier
 * from the CLIENT and reports any that apply no membership guard.
 *
 * BASELINE MODEL
 * --------------
 * This ships with a reviewed baseline of currently-known findings, so it can be
 * adopted without an immediately-red build. The point is the DELTA: a NEW unguarded
 * route fails the check. Shrinking the baseline is follow-up work, and the baseline
 * is stored as an explicit list so it is reviewable in diff.
 *
 * HONEST LIMITATIONS — read before trusting a green result:
 *  - This is regex-based static analysis, NOT an AST or a runtime probe. It can miss
 *    a guard applied indirectly (spread middleware arrays, a guard composed inside
 *    another module) and can miss a hole reached by an unusual registration shape.
 *  - A PASS therefore means "no NEW findings of the shapes this script recognises",
 *    not "tenant isolation is proven". It complements review; it does not replace it.
 *  - It cannot see whether a handler that received a verified workspaceId then
 *    queries with a DIFFERENT, unverified one.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['server/routes', 'server/features'];
const BASELINE_PATH = 'scripts/tenant-isolation-baseline.json';

/** Middleware//helpers that constitute a real membership check. */
const GUARD_TOKENS = [
  'validateWorkspaceAccess',
  'validateWorkspace',
  'validateWorkspaceFromParams',
  'validateWorkspaceFromQuery',
  'validateWorkspaceFromBody',
  'validateWorkspaceMembership',
  'optionalWorkspace',
  'createWorkspaceAccessValidator',
  'requireWorkspaceMember',
  'requireResourceWorkspaceAccess',
];

/**
 * In-handler checks that authorize without middleware. Included because several
 * routes legitimately verify ownership inline.
 *
 * NOTE: `requireWorkspaceAccessible` is deliberately NOT here. It reads like a guard
 * but only enforces the plan's maxWorkspaces limit and fails OPEN on error — treating
 * it as isolation is exactly the mistake that left several routes exposed.
 */
const INLINE_CHECK_TOKENS = [
  'userCanAccessWorkspace',
  'getAuthorizedWorkspace',
  'listAccessibleWorkspaceIds',
  'userOwnsWorkspace',
  'validateWorkspaceAccess',      // private controller methods share this name
  'WorkspaceMemberModel',
  'getWorkspacesByUserId',
];

/** Signals that a route takes a workspace id from the client. */
const CLIENT_WORKSPACE_SIGNALS = [
  /req\.params\.workspaceId/,
  /req\.query\.workspaceId/,
  /req\.body\??\.workspaceId/,
  /req\.body\s*\|\|\s*\{\}\s*\)?[\s\S]{0,80}workspaceId/,
  /headers\[['"]x-workspace-id['"]\]/i,
  /headers\[['"]workspace-id['"]\]/i,
  // DESTRUCTURED access — `const { workspaceId } = req.params/query/body`.
  // Omitting this was a real FALSE NEGATIVE: a deliberately unguarded probe route
  // using destructuring was not reported at all, because the file-level gate below
  // saw no workspace signal and skipped the file entirely.
  /\{[^{}]*\bworkspaceId\b[^{}]*\}\s*=\s*req\.(params|query|body)/,
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, out);
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$|\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extract each route registration as { verb, path, args, line }.
 * `args` is the raw text between the opening paren and the balanced close, so
 * middleware names appearing there are detectable.
 */
function extractRoutes(src) {
  const routes = [];
  const re = /\b(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]*)\2/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    // Walk forward to the balanced closing paren of the registration call.
    let depth = 0;
    let i = src.indexOf('(', start);
    const open = i;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    routes.push({
      verb: m[1].toUpperCase(),
      path: m[3],
      args: src.slice(open, Math.min(i + 1, src.length)),
      line: src.slice(0, start).split('\n').length,
    });
  }
  return routes;
}

/** File-wide coverage: `router.param('workspaceId')` or a `router.use` guard. */
function fileLevelCoverage(src) {
  if (/router\.param\s*\(\s*['"`]workspaceId['"`]/.test(src)) return true;
  const useRe = /\b(?:router|app)\.use\s*\(([^;]*)\)/g;
  let m;
  while ((m = useRe.exec(src)) !== null) {
    if (GUARD_TOKENS.some((g) => m[1].includes(g))) return true;
  }
  return false;
}

/**
 * Additional isolation patterns that are genuinely safe and must not be reported.
 *
 * Both were confirmed by reading the code, after an initial version of this script
 * reported ~30 findings of which the large majority were false:
 *
 *  1. CO-SCOPED QUERY — `Model.findOne({ userId, workspaceId })`. Passing another
 *     tenant's workspaceId simply matches nothing, because the query is also bound to
 *     the caller. Verified in `veegpt-chat.routes.ts`.
 *
 *  2. USER-SCOPED SERVICE CALL — `service.doThing(workspaceId, userId)`. The
 *     authorization lives one layer down; e.g. `WorkspaceService.deleteWorkspace`
 *     throws unless `workspace.ownerId === userId`. Verified in
 *     `WorkspaceService.ts`.
 */
const CO_SCOPED_PATTERNS = [
  // { userId, workspaceId } / { workspaceId, userId } in either order.
  /\{[^{}]*\buserId\b[^{}]*\bworkspaceId\b[^{}]*\}/,
  /\{[^{}]*\bworkspaceId\b[^{}]*\buserId\b[^{}]*\}/,
  // A call passing both ids, in either order.
  /\(\s*workspaceId\s*,\s*userId\s*[),]/,
  /\(\s*userId\s*,\s*workspaceId\s*[),]/,
  // A query co-scoped directly to the authenticated user, without an intermediate
  // `userId` binding — e.g. `findOne({ id: x, userId: req.user.id })`.
  /\buserId\s*:\s*req\.user\b/,
];

/**
 * Broader co-scoping detector for filters built INCREMENTALLY, e.g.
 *
 *     const filter: any = { userId, isArchived: { $ne: true } };
 *     if (workspaceId) filter.workspaceId = workspaceId;
 *
 * which the single-object patterns above cannot match. Verified in
 * `veegpt-chat.routes.ts`.
 *
 * HEURISTIC, and a deliberate trade-off: it requires the handler to derive `userId`
 * from the authenticated request AND to use that binding somewhere beyond its own
 * declaration. That accepts a possible FALSE NEGATIVE — a handler could read
 * `userId` purely for logging and still leak — in exchange for a signal-to-noise
 * ratio that keeps the check usable. Every real hole this exercise found
 * (social-listening, automation, the unauthenticated Instagram endpoints) had NO
 * user scoping whatsoever, so it is the right side of the trade.
 */
function looksUserScoped(args) {
  const derivesUserId = /\b(?:const|let)\s+userId\s*=\s*(?:String\()?req\.user/.test(args);
  if (!derivesUserId) return false;
  // Declaration plus at least one further reference.
  const uses = args.match(/\buserId\b/g);
  return (uses?.length ?? 0) >= 2;
}

/**
 * True when the registration ends in a bare identifier reference (a controller
 * method) rather than an inline handler function.
 *
 * This distinction is what keeps the check honest: for a delegated route the
 * authorization may live in the controller or service, which a route-file scan
 * cannot see. Those are surfaced for review rather than failed.
 */
function delegatesToController(args) {
  const hasInlineHandler = /(async\s*)?\([^)]*\)\s*=>|function\s*\(/.test(args);
  return !hasInlineHandler;
}

/** Findings that FAIL the build: inline handler, client workspace id, no check. */
const findings = [];
/** Findings that cannot be decided statically; reported for review only. */
const review = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');

    // A file with no client-supplied workspace id anywhere is out of scope.
    // A `:workspaceId` route path counts on its own — relying only on how the value
    // is READ let a destructuring route slip past this gate entirely.
    const declaresWorkspaceRoute = /['"`][^'"`]*:workspaceId\b/.test(src);
    if (!declaresWorkspaceRoute && !CLIENT_WORKSPACE_SIGNALS.some((re) => re.test(src))) {
      continue;
    }

    if (fileLevelCoverage(src)) continue;

    for (const route of extractRoutes(src)) {
      const declaresParam = /:workspaceId\b/.test(route.path);
      // Only inspect the registration for guards; a guard cannot be applied after.
      if (GUARD_TOKENS.some((g) => route.args.includes(g))) continue;

      // For routes that do NOT declare :workspaceId, require evidence the handler
      // reads a client workspace id — otherwise every unrelated route is reported.
      const readsClientWorkspace =
        declaresParam || CLIENT_WORKSPACE_SIGNALS.some((re) => re.test(route.args));
      if (!readsClientWorkspace) continue;

      // Inline authorization inside the handler body counts.
      if (INLINE_CHECK_TOKENS.some((t) => route.args.includes(t))) continue;
      // Co-scoping / user-scoped service calls are genuine isolation.
      if (CO_SCOPED_PATTERNS.some((re) => re.test(route.args))) continue;
      if (looksUserScoped(route.args)) continue;

      const entry = { file: rel, route: `${route.verb} ${route.path}`, line: route.line };
      if (delegatesToController(route.args)) review.push(entry);
      else findings.push(entry);
    }
  }
}

const key = (f) => `${f.file}::${f.route}`;
const current = new Set(findings.map(key));

let baseline = new Set();
const baselineFile = join(ROOT, BASELINE_PATH);
if (existsSync(baselineFile)) {
  try {
    const parsed = JSON.parse(readFileSync(baselineFile, 'utf8'));
    baseline = new Set(parsed.accepted ?? []);
  } catch (error) {
    console.error(`[tenant-isolation] baseline is unreadable: ${error.message}`);
    process.exit(2);
  }
}

if (process.argv.includes('--update-baseline')) {
  const payload = {
    _comment:
      'Reviewed tenant-isolation findings accepted at the time of writing. The check ' +
      'fails on any finding NOT listed here, so a NEW unguarded route breaks the ' +
      'build. Shrinking this list is the goal; do not add to it without review.',
    generatedAt: new Date().toISOString(),
    accepted: [...current].sort(),
  };
  const { writeFileSync } = await import('node:fs');
  writeFileSync(baselineFile, JSON.stringify(payload, null, 2) + '\n');
  console.log(`[tenant-isolation] baseline written with ${current.size} accepted finding(s).`);
  process.exit(0);
}

const newFindings = findings.filter((f) => !baseline.has(key(f)));
const fixed = [...baseline].filter((k) => !current.has(k));

if (fixed.length > 0) {
  console.log(`[tenant-isolation] ${fixed.length} baseline finding(s) no longer present — ` +
    'run with --update-baseline to shrink the baseline:');
  for (const k of fixed.slice(0, 20)) console.log(`    ✓ ${k}`);
}

if (review.length > 0 && process.argv.includes('--verbose')) {
  console.log(
    `\n[tenant-isolation] ${review.length} route(s) delegate to a controller and ` +
      'cannot be decided statically — authorization may live in the controller or\n' +
      'service (e.g. WorkspaceService.deleteWorkspace checks ownerId). Review, do not assume:\n'
  );
  for (const r of review) console.log(`    ? ${r.file}:${r.line}  ${r.route}`);
  console.log('');
}

if (newFindings.length === 0) {
  console.log(
    `[tenant-isolation] OK — no NEW findings. ` +
      `(${baseline.size} accepted in baseline, ${findings.length} enforceable, ` +
      `${review.length} needing manual review — run with --verbose to list.)`
  );
  process.exit(0);
}

console.error('\n[tenant-isolation] FAILED — route(s) take a client workspace id with no membership guard:\n');
for (const f of newFindings) {
  console.error(`  ✗ ${f.file}:${f.line}\n      ${f.route}`);
}
console.error(
  '\nApply one of:\n' +
    "  • validateWorkspaceAccess({ source: 'params' | 'query' | 'body' })\n" +
    '  • router.param(\'workspaceId\', …) to cover every route in the file\n' +
    '  • requireResourceWorkspaceAccess(param, resolver) when the workspace is only\n' +
    '    knowable after loading the resource (the IDOR shape)\n' +
    '  • an inline membership check via userCanAccessWorkspace / getAuthorizedWorkspace\n' +
    '\nNOTE: requireWorkspaceAccessible() is NOT a membership guard — it only enforces\n' +
    'the plan workspace limit and fails open.\n'
);
process.exit(1);
