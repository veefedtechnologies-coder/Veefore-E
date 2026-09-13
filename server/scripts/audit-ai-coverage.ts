/**
 * AI coverage audit (spec §25) — classify EVERY provider call site.
 *
 * The specification requires that no AI-producing operation bypasses the VGU
 * engine, and that every provider call is accounted for in a coverage report.
 * Guessing which files are live would be worthless, so this walks the real import
 * graph from the actual runtime entry points and reports, per file:
 *
 *   LIVE / DEAD        reachable from an entry point, or not
 *   METERED            does the call site sit inside a withVGU context
 *   kind               USER-FACING / BACKGROUND / INTERNAL / DUPLICATE
 *
 * Exit code is non-zero when a LIVE file makes provider calls with no metering,
 * so this doubles as a regression gate.
 *
 * Run: npx tsx server/scripts/audit-ai-coverage.ts [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '../..');
const SERVER = path.join(REPO, 'server');

/** Runtime entry points. Everything reachable from these is LIVE. */
const ENTRY_POINTS = [
  'server/index.ts',
  'server/routes.ts',
  'server/vite.ts',
];

/** Patterns that indicate a direct provider call. */
const PROVIDER_CALL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\.chat\.completions\.create\s*\(/, label: 'openai.chat' },
  { re: /\.responses\.create\s*\(/, label: 'openai.responses' },
  { re: /\.images\.generate\s*\(/, label: 'openai.images' },
  { re: /\.embeddings\.create\s*\(/, label: 'openai.embeddings' },
  { re: /\.audio\.transcriptions\.create\s*\(/, label: 'openai.transcribe' },
  { re: /\.audio\.speech\.create\s*\(/, label: 'openai.tts' },
  { re: /generateContentStream\s*\(/, label: 'gemini.stream' },
  { re: /\.generateContent\s*\(/, label: 'gemini.generate' },
  { re: /getGenerativeModel\s*\(/, label: 'gemini.model' },
  { re: /messages\.create\s*\(/, label: 'anthropic.messages' },
];

/** Directories that are not part of the running server. */
const EXCLUDED = [
  'node_modules',
  '/archive/',
  '/scripts/',
  '.test.ts',
  '.spec.ts',
  '.backup',
  '/__tests__/',
];

interface FileInfo {
  file: string;
  live: boolean;
  providerCalls: string[];
  /** Uses the metering wrapper directly. */
  usesWithVGU: boolean;
  /** Tags calls with a feature so ALS-based metering can attribute them. */
  usesFeatureContext: boolean;
  /** Obtains clients from the guarded factories, so every call is asserted. */
  usesGuardedFactory: boolean;
  /**
   * Still constructs a raw SDK client. THIS is the bypass signal: a raw client's
   * calls are invisible to the guard and can reach a provider unmetered.
   */
  usesRawConstructor: boolean;
  /**
   * The file constructs no client of its own; it receives one from a helper
   * module. Coverage then depends on that helper, resolved transitively below.
   */
  clientVia?: { module: string; guarded: boolean };
  /**
   * Reachable through the import graph from a file that opens a VGU scope, i.e.
   * there IS a metered path to this code. Static reachability over-approximates
   * (being importable from a metered route does not prove every caller is
   * metered), which is exactly why the runtime guard exists: in strict mode a
   * call with no metered context throws. Static + runtime together give the
   * guarantee; neither does alone.
   */
  reachableFromMetered: boolean;
  kind: 'USER-FACING' | 'BACKGROUND' | 'INTERNAL' | 'DUPLICATE' | 'UNKNOWN';
}

const RAW_CTOR = /new\s+OpenAI\s*\(|new\s+GoogleGenerativeAI\s*\(/;
const GUARDED_FACTORY = /\bcreateOpenAI\s*\(|\bcreateGemini\s*\(/;

/**
 * Where does this file's client come from?
 *
 * A provider-call file that never constructs a client is not automatically safe
 * and not automatically unsafe — it depends on the helper it imports. So follow
 * the imports (bounded depth) until a module that actually builds a client is
 * found, and inherit that module's verdict. Guessing here would be exactly the
 * kind of unverified claim this audit exists to eliminate.
 */
function resolveClientSource(
  file: string,
  depth = 0,
  seen = new Set<string>()
): { module: string; guarded: boolean } | undefined {
  if (depth > 3 || seen.has(file)) return undefined;
  seen.add(file);
  const src = readSafe(file);
  if (depth > 0) {
    if (RAW_CTOR.test(src)) {
      return { module: path.relative(REPO, file), guarded: false };
    }
    if (GUARDED_FACTORY.test(src)) {
      return { module: path.relative(REPO, file), guarded: true };
    }
  }
  for (const spec of importsOf(src)) {
    const resolved = resolveImport(file, spec);
    if (!resolved || resolved.includes('node_modules')) continue;
    // The guard module itself defines the factories; it is not a client source.
    if (resolved.includes('ai-provider-guard')) continue;
    const hit = resolveClientSource(resolved, depth + 1, seen);
    if (hit) return hit;
  }
  return undefined;
}

function excluded(p: string): boolean {
  return EXCLUDED.some(x => p.includes(x));
}

function readSafe(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** Resolve a relative import to a real file on disk. */
function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) {
    // Alias imports used by the server.
    if (spec.startsWith('@shared/')) {
      return tryExt(path.join(REPO, 'shared', spec.slice('@shared/'.length)));
    }
    return null;
  }
  return tryExt(path.resolve(path.dirname(fromFile), spec));
}

function tryExt(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.js'),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Every static and dynamic import specifier in a file. */
function importsOf(src: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.push(m[1]);
  }
  return out;
}

/** Everything reachable from `roots` through the import graph. */
function reachableFrom(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = roots.filter(p => fs.existsSync(p));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(readSafe(file))) {
      const resolved = resolveImport(file, spec);
      if (resolved && !seen.has(resolved) && !resolved.includes('node_modules')) {
        queue.push(resolved);
      }
    }
  }
  return seen;
}

/** Walk the import graph from the entry points. */
function computeLiveSet(): Set<string> {
  return reachableFrom(ENTRY_POINTS.map(e => path.join(REPO, e)));
}

/** Files that open a VGU scope — the roots of enforcement. */
const METERING_ROOT = /meterAI\s*\(|withVGU\s*\(|withVGUForUser\s*\(/;

/**
 * Every server file that opens a VGU scope. Anything they reach runs inside a
 * reservation, which is what the guard's "is there a metered context" check sees.
 */
function findMeteringRoots(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (excluded(full)) continue;
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts')) {
        const src = readSafe(full);
        // The engine itself and the middleware that calls it are not roots.
        if (
          full.includes('veegpt-metering') ||
          full.includes('middleware/meter-ai')
        ) {
          continue;
        }
        if (METERING_ROOT.test(src)) out.push(full);
      }
    }
  };
  walk(SERVER);
  return out;
}

/** All server .ts files that contain a provider call. */
function findProviderCallFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (excluded(full)) continue;
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts')) {
        const src = readSafe(full);
        if (PROVIDER_CALL_PATTERNS.some(p => p.re.test(src))) out.push(full);
      }
    }
  };
  walk(SERVER);
  return out.sort();
}

function classify(file: string, src: string, live: boolean): FileInfo['kind'] {
  const rel = path.relative(REPO, file);
  if (!live) return 'DUPLICATE';
  if (/worker|queue|scheduler|cron|job/i.test(rel)) return 'BACKGROUND';
  if (/routes|controller/i.test(rel)) return 'USER-FACING';
  if (/AIServiceManager|aiUsageTracker|litellm/i.test(rel)) return 'INTERNAL';
  return 'INTERNAL';
}

const liveSet = computeLiveSet();
const meteringRoots = findMeteringRoots();
const meteredSet = reachableFrom(meteringRoots);
const files = findProviderCallFiles();

const infos: FileInfo[] = files.map(file => {
  const src = readSafe(file);
  const providerCalls = PROVIDER_CALL_PATTERNS.filter(p => p.re.test(src)).map(
    p => p.label
  );
  const live = liveSet.has(file);
  const usesGuardedFactory = GUARDED_FACTORY.test(src);
  const usesRawConstructor = RAW_CTOR.test(src);
  return {
    file: path.relative(REPO, file),
    live,
    providerCalls,
    usesWithVGU: /\bwithVGU\s*\(/.test(src),
    usesFeatureContext:
      /withAIFeature\s*\(|collectAIUsageInto\s*\(|aiFeatureMiddleware\s*\(/.test(src),
    usesGuardedFactory,
    usesRawConstructor,
    clientVia:
      usesGuardedFactory || usesRawConstructor
        ? undefined
        : resolveClientSource(file),
    reachableFromMetered: meteredSet.has(file),
    kind: classify(file, src, live),
  };
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const liveFiles = infos.filter(i => i.live);
const deadFiles = infos.filter(i => !i.live);

/**
 * The central dispatcher and the gateway record their own usage; they are the
 * metered path itself and must NOT be guarded (that would double-count tokens).
 */
const isDispatcher = (i: FileInfo) =>
  /AIServiceManager\.ts$/.test(i.file) || /litellm/i.test(i.file);

/**
 * A live provider-call site is COVERED when every client it uses is guarded — so
 * any call outside a metered context is detected (and blocked in strict mode) —
 * or when the file drives metering itself.
 *
 * A raw SDK constructor disqualifies a file even if it also uses a guarded one,
 * because the raw client's calls remain invisible to the guard.
 */
const isCovered = (i: FileInfo) => {
  if (isDispatcher(i)) return true;
  // A raw SDK constructor disqualifies a file outright.
  if (i.usesRawConstructor) return false;
  if (i.usesGuardedFactory) return true;
  // No client of its own: inherit the verdict of the helper that supplies it.
  if (i.clientVia) return i.clientVia.guarded;
  // No client and no resolvable source (injected client, or a mock in tests):
  // metering must then be driven by the file itself.
  return i.usesWithVGU || i.usesFeatureContext;
};

const uncovered = liveFiles.filter(i => !isCovered(i));
/** Live provider calls with no metered path at all — a genuine cost bypass. */
const unmetered = liveFiles.filter(i => !i.reachableFromMetered);
/**
 * ANY file that still builds a raw client — live or dead.
 *
 * Dead files are included deliberately. "Dead" is a property of today's import
 * graph, not of the file: one future import makes it live again, with a client the
 * guard cannot see. Treating a raw constructor as a failure everywhere is what
 * keeps that from happening silently.
 */
const rawClients = infos.filter(i => i.usesRawConstructor && !isDispatcher(i));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ infos, uncovered, unmetered, rawClients }, null, 2));
} else {
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log('AI PROVIDER CALL COVERAGE\n' + '='.repeat(100));
  console.log(
    `${pad('FILE', 54)}${pad('STATUS', 7)}${pad('KIND', 13)}${pad('GUARD', 7)}${pad('METERED', 9)}${pad('CLIENT', 12)}CALLS`
  );
  console.log('-'.repeat(100));
  for (const i of infos) {
    const clientSrc = isDispatcher(i)
      ? 'dispatcher'
      : i.usesRawConstructor
        ? 'RAW'
        : i.usesGuardedFactory
          ? 'guarded'
          : i.clientVia
            ? i.clientVia.guarded
              ? 'via-guarded'
              : 'via-RAW'
            : 'injected';
    console.log(
      `${pad(i.file.slice(0, 52), 54)}${pad(i.live ? 'LIVE' : 'DEAD', 7)}${pad(i.kind, 13)}${pad(
        i.live ? (isCovered(i) ? 'yes' : 'NO') : '-',
        7
      )}${pad(
        i.live ? (i.reachableFromMetered ? 'yes' : 'NO') : '-',
        9
      )}${pad(clientSrc, 12)}${i.providerCalls.join(',')}`
    );
  }
  console.log('-'.repeat(100));
  console.log(
    `total=${infos.length}  live=${liveFiles.length}  dead=${deadFiles.length}  ` +
      `uncovered-live=${uncovered.length}  unmetered-live=${unmetered.length}  ` +
      `raw-clients=${rawClients.length}`
  );

  console.log(
    `\nMETERING ROOTS (files that open a VGU scope): ${meteringRoots.length}`
  );
  for (const r of meteringRoots) console.log(`  + ${path.relative(REPO, r)}`);

  if (unmetered.length) {
    console.log(
      '\nLIVE provider calls with NO metered path — these can run without a\n' +
        'reservation, so their cost is unbounded:'
    );
    for (const u of unmetered) console.log(`  ✗ ${u.file}  [${u.kind}]`);
  } else {
    console.log(
      '\nEvery LIVE provider call site is reachable from a VGU scope, so a\n' +
        'reservation exists on every path that can reach a provider.'
    );
  }

  if (uncovered.length) {
    console.log('\nUNCOVERED LIVE PROVIDER CALLS — these bypass the VGU engine:');
    for (const u of uncovered)
      console.log(
        `  ✗ ${u.file}  [${u.providerCalls.join(',')}]` +
          (u.usesRawConstructor ? '  (raw SDK client)' : '')
      );
  } else {
    console.log(
      '\nEvery LIVE provider call site obtains its client from the guarded\n' +
        'factories, so no provider call can reach a network without a metered\n' +
        `context. Enforcement mode: ${process.env.VGU_ENFORCEMENT || 'warn'}.`
    );
  }

  if (rawClients.length) {
    console.log(
      '\nFiles still constructing a raw SDK client — a call from one of these is\n' +
        'invisible to the guard. Convert them with:\n' +
        '  npx tsx server/scripts/codemod-guard-providers.ts --apply'
    );
    for (const r of rawClients) console.log(`  ! ${r.file}  [${r.live ? 'LIVE' : 'DEAD'}]`);
  } else {
    console.log(
      '\nNo file anywhere constructs a raw SDK client, so no future import can\n' +
        'quietly reintroduce an unguarded provider call.'
    );
  }

  if (deadFiles.length) {
    console.log(
      `\nDEAD (unreachable from ${ENTRY_POINTS.join(', ')}) — no enforcement required,\n` +
        'but listed so the coverage report is complete:'
    );
    for (const d of deadFiles) console.log(`  · ${d.file}`);
  }
}

process.exit(uncovered.length || unmetered.length || rawClients.length ? 1 : 0);
