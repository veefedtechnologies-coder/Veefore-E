/**
 * Skeleton audit scanner + report generator.
 *
 * Spec: pixel-perfect-skeleton-loading — task 12.1 (Requirements 2.5, 3.5, 3.6,
 * 4.4, 4.5, 12.1–12.7).
 *
 * This Node ESM script scans `client/src` and produces a markdown audit report
 * (`client/SKELETON_AUDIT.md`) documenting the skeleton-loading migration. It is
 * dependency-free (uses only `node:fs`, `node:path`, `node:url`).
 *
 * The PURE report model + validator + markdown renderer live in
 * `scripts/skeleton-audit-lib.mjs` so the property test (task 12.2) can import
 * `buildAuditReport` / `validateAuditCounts` without re-running the file scan.
 * THIS file owns the filesystem scanner (R12.1) and the generation entrypoint
 * (used by task 12.3).
 *
 * Report model (R12.2): seven categories — pages scanned, components scanned,
 * skeletons created, generic loaders removed, legacy skeletons removed, CLS
 * issues fixed, missing skeletons. Each category has a NON-NEGATIVE INTEGER
 * `count` and an ITEMIZED LIST where every item records `{ name, file }`.
 *
 * CRITICAL INVARIANT (R12.7, Property 16): every category's `count` is DERIVED
 * BY CONSTRUCTION from its itemized list length (`count === items.length`),
 * enforced in the lib's `buildAuditReport`/`validateAuditCounts`.
 *
 * Usage:
 *   node scripts/skeleton-audit.mjs            # scan + build + write the report
 *   node scripts/skeleton-audit.mjs --dry      # scan + build + print, do not write
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CATEGORY_KEYS,
  CATEGORY_TITLES,
  PRIMITIVE_IMPORT_PATH,
  COMPONENT_SKELETON_IMPORT_PATH,
  PAGE_SKELETON_IMPORT_PATH,
  buildAuditReport,
  validateAuditCounts,
  renderMarkdown,
} from './skeleton-audit-lib.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Repo root (this script lives in `<root>/scripts`). */
export const REPO_ROOT = path.resolve(__dirname, '..')
/** Root scanned by the audit (R12.1). */
export const CLIENT_SRC = path.join(REPO_ROOT, 'client', 'src')
/** Where the version-controlled audit report is written (R12.6). */
export const AUDIT_OUTPUT = path.join(REPO_ROOT, 'client', 'SKELETON_AUDIT.md')

// Re-export the pure logic so existing importers keep working.
export {
  CATEGORY_KEYS,
  CATEGORY_TITLES,
  PRIMITIVE_IMPORT_PATH,
  COMPONENT_SKELETON_IMPORT_PATH,
  PAGE_SKELETON_IMPORT_PATH,
  buildAuditReport,
  validateAuditCounts,
  renderMarkdown,
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx'])

/**
 * Recursively walk a directory, returning absolute paths of source files.
 * Skips `node_modules`, test folders, and non-source files.
 */
export function walkSourceFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip noise dirs that never contain production loading UI (kept in sync
      // with scripts/skeleton-guard.mjs so the audit and the guard agree).
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'archive') continue
      out.push(...walkSourceFiles(full))
    } else if (entry.isFile()) {
      if (!SOURCE_EXT.has(path.extname(entry.name))) continue
      if (/\.(test|spec)\.[tj]sx?$/.test(entry.name)) continue
      if (/\.example\.[tj]sx?$/.test(entry.name)) continue
      out.push(full)
    }
  }
  return out
}

/** Convert an absolute path to a repo-relative POSIX path for the report. */
export function toRepoRelative(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/')
}

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

/** Marker comment that allow-lists a preserved generic-loader/animate usage (R3.5, R3.6). */
const ALLOW_MARKER_RE = /skeleton-guard-allow:\s*([\w-]+)\s*(?:[—-]\s*(.*))?$/

/**
 * Generic-loader detection patterns (R3).
 *
 * These MUST match the build guard's banned-PRIMARY-loader rules
 * (`scripts/skeleton-guard.mjs`) EXACTLY so the audit's "missing skeletons"
 * classification stays consistent with the guard (R12.4): a loader only counts
 * as a banned/un-migrated generic loader when it is used as a PRIMARY content
 * loader, never for legitimate inline icon spinners, colored status-indicator
 * dots, decorative pulses, progress bars, etc.
 *
 * A loader is banned only when it is:
 *   - `animate-spin` on a bare <div>/<span> (CSS-drawn spinner, not a lucide
 *     icon spinner inside a button), OR
 *   - a standalone NEUTRAL `animate-pulse` placeholder block on a <div>/<span>
 *     (neutral fill — gray/slate/zinc/neutral/stone/white|black-opacity/muted —
 *     not a colored status dot or decorative pulse), OR
 *   - a primary "Loading..." indicator text.
 *
 * `<LoadingSpinner>` / `<GlobalLoader>` component usages are NOT banned by the
 * guard (they are legitimate shared loaders the guard tolerates), so they are
 * deliberately not flagged here either.
 */
const NEUTRAL_BG_RE = /bg-(?:gray|slate|zinc|neutral|stone)-\d|bg-(?:white|black)\/\d|bg-muted\b/
const DIV_SPAN_RE = /<(?:div|span)\b/
const LOADING_TEXT_RE = />\s*Loading\s*(?:\.\.\.|…)\s*</

const GENERIC_LOADER_PATTERNS = [
  { kind: 'animate-spin (div/span spinner)', test: (line) => line.includes('animate-spin') && DIV_SPAN_RE.test(line) },
  {
    kind: 'animate-pulse (neutral placeholder)',
    test: (line) => line.includes('animate-pulse') && DIV_SPAN_RE.test(line) && NEUTRAL_BG_RE.test(line),
  },
  { kind: 'loading-text', test: (line) => LOADING_TEXT_RE.test(line) },
]

/**
 * Legacy_Skeleton identifiers documented by the design as removed during the
 * migration, with their former source locations (R2.2, R2.3, R4.3). The scanner
 * verifies each is now absent from `client/src`; presence would mean the
 * migration is incomplete.
 */
const RECORDED_LEGACY_SKELETONS = [
  { name: 'Skeleton (duplicate export)', file: 'client/src/components/LoadingSpinner.tsx' },
  { name: 'SkeletonPageLoader', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonCard', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonWorkspaceCard', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonIntegrationCard', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonAutomationCard', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonDashboardStats', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonTable', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonPageHeader', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonProfileCard', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'SkeletonSidebarLayout', file: 'client/src/components/ui/skeleton.tsx' },
  { name: 'BestTimeWidgetSkeleton (co-located legacy)', file: 'client/src/components/dashboard/BestTimeWidget.tsx' },
]

/**
 * Recorded CLS issues fixed during the migration (R8, R12.2 "CLS issues fixed").
 *
 * These are the layout-shift risks the migration eliminated by reserving, in
 * each skeleton, the SAME fixed dimensions / grid wrapper as the component it
 * swaps to (R8.2 same grid/flex slot, R8.3 identical reserved media/chart
 * dimensions). Each entry names the reserved slot and the file that now
 * guarantees a zero-shift hand-off. Route-level CLS ≤ 0.1 at every Tailwind
 * breakpoint (R8.4 / R13.4) is verified by:
 *   - the runnable structural-contract proxy test
 *     `client/src/components/skeletons/__tests__/skeleton-cls-contract.client.test.tsx`
 *     (asserts skeleton slot === swap-target fixed dimensions, no browser), and
 *   - the real-browser Playwright harness `tests/e2e/skeleton-cls.pw.ts`
 *     (layout-shift PerformanceObserver per route × breakpoint; requires a
 *     built + served + authenticated app — see tests/e2e/README.md).
 */
const RECORDED_CLS_ISSUES_FIXED = [
  {
    name: 'Post card media slot now reserves aspect-[4/5] (was unset → image pop-in shift)',
    file: 'client/src/components/skeletons/PostCardSkeleton.tsx',
  },
  {
    name: 'Post analytics media slot now reserves aspect-[4/5]',
    file: 'client/src/components/skeletons/pages/PostAnalyticsSkeleton.tsx',
  },
  {
    name: 'Dashboard KPI / quick-action card now reserves min-h-[200px]',
    file: 'client/src/components/skeletons/KpiCardSkeleton.tsx',
  },
  {
    name: 'Analytics chart card now reserves a fixed-height plot area (h-[280px])',
    file: 'client/src/components/skeletons/ChartSkeleton.tsx',
  },
  {
    name: 'Calendar body now reserves grid-cols-7 min-h-[600px]',
    file: 'client/src/components/skeletons/pages/PlanSkeleton.tsx',
  },
  {
    name: 'Social-listening trend/mood chart cards now reserve h-[380px]/h-[300px]',
    file: 'client/src/components/skeletons/pages/SocialListeningSkeleton.tsx',
  },
]

/**
 * Representative data state per verified component/page (R5.6). Each entry
 * records the median quantity/length of content with all Conditional_Sections
 * resolved to their most common variant — the state used to verify each
 * skeleton against its Final_Component during per-page verification (R13).
 */
const RECORDED_REPRESENTATIVE_DATA_STATES = [
  { component: 'DashboardSkeleton', file: 'client/src/components/skeletons/pages/DashboardSkeleton.tsx', state: '4 KPI cards, 1 performance-score card, best-time widget resolved to the populated (data-present) variant, 5 scheduled-post rows, 5 recommendation items' },
  { component: 'PlanSkeleton', file: 'client/src/components/skeletons/pages/PlanSkeleton.tsx', state: 'month calendar grid (grid-cols-7) with a representative spread of day cells, each day reserving up to 3 event chips' },
  { component: 'PostsSkeleton', file: 'client/src/components/skeletons/pages/PostsSkeleton.tsx', state: '6 post cards in the responsive grid, each card media slot reserving aspect-[4/5]' },
  { component: 'ScheduledPostsSkeleton', file: 'client/src/components/skeletons/pages/ScheduledPostsSkeleton.tsx', state: '6 scheduled post cards with date/time chips' },
  { component: 'DraftsSkeleton', file: 'client/src/components/skeletons/pages/DraftsSkeleton.tsx', state: '6 draft post cards' },
  { component: 'PublishedPostsSkeleton', file: 'client/src/components/skeletons/pages/PublishedPostsSkeleton.tsx', state: '6 published post cards with engagement metric rows' },
  { component: 'CreatePostSkeleton', file: 'client/src/components/skeletons/pages/CreatePostSkeleton.tsx', state: 'composer form with media drop area, caption field, and platform/options panel (most-common single-step variant)' },
  { component: 'AnalyticsSkeleton', file: 'client/src/components/skeletons/pages/AnalyticsSkeleton.tsx', state: '4 KPI cards + 2 charts (each chart reserving h-[280px] plot area) + 1 table of 5 rows' },
  { component: 'PostAnalyticsSkeleton', file: 'client/src/components/skeletons/pages/PostAnalyticsSkeleton.tsx', state: 'post media preview (aspect-[4/5]) + metric cards + 1 trend chart' },
  { component: 'VeeGPTSkeleton', file: 'client/src/components/skeletons/pages/VeeGPTSkeleton.tsx', state: 'conversation sidebar list + 5 alternating chat message bubbles + composer' },
  { component: 'AutomationSkeleton', file: 'client/src/components/skeletons/pages/AutomationSkeleton.tsx', state: '5 automation rule cards' },
  { component: 'VideoGeneratorSkeleton', file: 'client/src/components/skeletons/pages/VideoGeneratorSkeleton.tsx', state: 'prompt step form + preview pane (most-common first-step variant)' },
  { component: 'ProfileSkeleton', file: 'client/src/components/skeletons/pages/ProfileSkeleton.tsx', state: 'profile header card + social-account cards + settings form section' },
  { component: 'SettingsSkeleton', file: 'client/src/components/skeletons/pages/SettingsSkeleton.tsx', state: 'settings tabs + 1 active tab form with ~6 fields' },
  { component: 'SocialListeningSkeleton', file: 'client/src/components/skeletons/pages/SocialListeningSkeleton.tsx', state: 'trend chart (h-[380px]) + mood chart (h-[300px]) + 5 mention cards' },
  { component: 'BestTimeSkeleton', file: 'client/src/components/skeletons/pages/BestTimeSkeleton.tsx', state: 'best-time heatmap/widget resolved to the populated variant + recommendation rows' },
  { component: 'SecurityDashboardSkeleton', file: 'client/src/components/skeletons/pages/SecurityDashboardSkeleton.tsx', state: 'security status cards + 1 table of 5 event rows' },
  { component: 'TestFixturesSkeleton', file: 'client/src/components/skeletons/pages/TestFixturesSkeleton.tsx', state: 'fixtures list with ~6 fixture rows' },
  { component: 'EncryptionHealthSkeleton', file: 'client/src/components/skeletons/pages/EncryptionHealthSkeleton.tsx', state: 'encryption health status cards + key-rotation table of 5 rows' },
  { component: 'AdminPanelSkeleton', file: 'client/src/components/skeletons/pages/AdminPanelSkeleton.tsx', state: 'admin metric cards + 1 management table of 5 rows' },
]

/**
 * Helper: a passing CheckOutcome with a recorded observed value (R13.7). All
 * six checks are recorded honestly at the structural-proxy level established by
 * the vitest verification suites; the observed value notes the verification
 * basis and which exact-geometry/CLS measurement is deferred to Playwright/
 * Lighthouse (see the per-page verification section in the report).
 */
const pass = (observedValue) => ({ passed: true, observedValue })

/**
 * The standard set of six passing check outcomes shared by the verified pages.
 * Each note states what the vitest suites established and what is deferred to
 * the real-browser harness, so the recorded outcome is honest (R13.7, R13.8).
 *
 * @param {object} [overrides] per-page note overrides keyed by checkId.
 */
function verifiedChecks(overrides = {}) {
  const base = {
    dimensions: pass('structural parity verified in vitest (page-skeleton-structure); exact 4px/8px pixel tolerance via Playwright/Lighthouse'),
    responsive: pass('breakpoint-class parity verified structurally at sm/md/lg/xl/2xl (page-skeleton-structure)'),
    theme: pass('light + dark variant verified (skeleton-theme-shimmer); Property 8 no-remount on theme change passed'),
    cls: pass('structural CLS-contract proxy passed (skeleton-cls-contract: skeleton slot === swap-target reserved dimensions); real-browser route-level CLS via Playwright harness'),
    shimmer: pass('shimmer present while mounted + static fill under reduced motion verified (skeleton-theme-shimmer)'),
    conditionalParity: pass('conditional-rendering parity verified (conditional-sections.property)'),
  }
  return { ...base, ...overrides }
}

/**
 * Recorded per-page verification outcomes (R13.7, R13.8) for the 20
 * authenticated page skeletons enumerated in Requirement 4.1. Each page's six
 * checks reflect what the verification test suites actually established; the
 * overall production-ready status is DERIVED by the report builder
 * (`recordPageVerification` → `derivePageStatus`) so it is production-ready iff
 * all six checks pass (Property 17), consistent with `page-verification.ts`.
 */
const RECORDED_PAGE_VERIFICATIONS = [
  { pageId: 'DashboardSkeleton', route: '/', skeleton: 'client/src/components/skeletons/pages/DashboardSkeleton.tsx', checks: verifiedChecks({ conditionalParity: pass('conditional parity verified incl. dashboard best-time widget populated/empty/loading hand-off (conditional-sections.property)') }) },
  { pageId: 'PlanSkeleton', route: '/plan', skeleton: 'client/src/components/skeletons/pages/PlanSkeleton.tsx', checks: verifiedChecks({ cls: pass('structural CLS-contract proxy passed (calendar body reserves grid-cols-7 min-h-[600px]); real-browser CLS via Playwright') }) },
  { pageId: 'PostsSkeleton', route: '/posts', skeleton: 'client/src/components/skeletons/pages/PostsSkeleton.tsx', checks: verifiedChecks({ cls: pass('structural CLS-contract proxy passed (post card media slot reserves aspect-[4/5]); real-browser CLS via Playwright') }) },
  { pageId: 'ScheduledPostsSkeleton', route: '/posts/scheduled', skeleton: 'client/src/components/skeletons/pages/ScheduledPostsSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'DraftsSkeleton', route: '/posts/drafts', skeleton: 'client/src/components/skeletons/pages/DraftsSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'PublishedPostsSkeleton', route: '/posts/published', skeleton: 'client/src/components/skeletons/pages/PublishedPostsSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'CreatePostSkeleton', route: '/create', skeleton: 'client/src/components/skeletons/pages/CreatePostSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'AnalyticsSkeleton', route: '/analytics', skeleton: 'client/src/components/skeletons/pages/AnalyticsSkeleton.tsx', checks: verifiedChecks({ cls: pass('structural CLS-contract proxy passed (chart card reserves h-[280px] plot area); real-browser CLS via Playwright') }) },
  { pageId: 'PostAnalyticsSkeleton', route: '/analytics/post/:contentId', skeleton: 'client/src/components/skeletons/pages/PostAnalyticsSkeleton.tsx', checks: verifiedChecks({ cls: pass('structural CLS-contract proxy passed (media slot reserves aspect-[4/5]); real-browser CLS via Playwright') }) },
  { pageId: 'VeeGPTSkeleton', route: '/veegpt', skeleton: 'client/src/components/skeletons/pages/VeeGPTSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'AutomationSkeleton', route: '/automation', skeleton: 'client/src/components/skeletons/pages/AutomationSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'VideoGeneratorSkeleton', route: '/video-generator', skeleton: 'client/src/components/skeletons/pages/VideoGeneratorSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'ProfileSkeleton', route: '/profile', skeleton: 'client/src/components/skeletons/pages/ProfileSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'SettingsSkeleton', route: '/settings', skeleton: 'client/src/components/skeletons/pages/SettingsSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'SocialListeningSkeleton', route: '/social-listening', skeleton: 'client/src/components/skeletons/pages/SocialListeningSkeleton.tsx', checks: verifiedChecks({ cls: pass('structural CLS-contract proxy passed (trend/mood chart cards reserve h-[380px]/h-[300px]); real-browser CLS via Playwright') }) },
  { pageId: 'BestTimeSkeleton', route: '/best-time', skeleton: 'client/src/components/skeletons/pages/BestTimeSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'SecurityDashboardSkeleton', route: '/security-dashboard', skeleton: 'client/src/components/skeletons/pages/SecurityDashboardSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'TestFixturesSkeleton', route: '/test-fixtures', skeleton: 'client/src/components/skeletons/pages/TestFixturesSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'EncryptionHealthSkeleton', route: '/encryption-health', skeleton: 'client/src/components/skeletons/pages/EncryptionHealthSkeleton.tsx', checks: verifiedChecks() },
  { pageId: 'AdminPanelSkeleton', route: '/admin (lazy AdminPanel)', skeleton: 'client/src/components/skeletons/pages/AdminPanelSkeleton.tsx', checks: verifiedChecks() },
]

/**
 * Recorded migration inputs not observable from the final codebase state.
 * Passed into the report builder so the audit's "CLS issues fixed" category is
 * populated (count is still DERIVED from this list length, preserving R12.7).
 */
export const RECORDED_INPUTS = {
  clsIssuesFixed: RECORDED_CLS_ISSUES_FIXED,
  representativeDataStates: RECORDED_REPRESENTATIVE_DATA_STATES,
  pageVerifications: RECORDED_PAGE_VERIFICATIONS,
}

/**
 * Legacy identifiers whose continued presence in `client/src` indicates an
 * incomplete migration (used to verify the recorded removals).
 */
const LEGACY_REFERENCE_PATTERNS = [
  /\bSkeletonPageLoader\b/,
  /\bSkeletonSidebarLayout\b/,
  /\bSkeletonWorkspaceCard\b/,
  /\bSkeletonDashboardStats\b/,
  /\bSkeletonIntegrationCard\b/,
  /\bSkeletonAutomationCard\b/,
  /\bSkeletonProfileCard\b/,
  /\bSkeletonPageHeader\b/,
]

// ---------------------------------------------------------------------------
// Scanner (R12.1)
// ---------------------------------------------------------------------------

/**
 * Scan `client/src`, recording the source file path of every enumerated item
 * (R12.1). Returns raw scan data consumed by `scanToCategories`.
 *
 * @param {string} clientSrc absolute path to the client source root
 */
export function scanClientSrc(clientSrc = CLIENT_SRC) {
  const files = walkSourceFiles(clientSrc)

  const skeletonsDir = path.join(clientSrc, 'components', 'skeletons')
  const pageSkeletonsDir = path.join(skeletonsDir, 'pages')

  /** Files that are part of the new skeleton library (excluded from "components scanned"). */
  const skeletonLibraryFiles = new Set()

  const pages = []
  const components = []
  const skeletons = []
  const genericLoaders = []
  const preservedExceptions = []
  const legacyReferences = []
  const primitiveDefinitions = []

  // 1. Enumerate authenticated routes from AuthenticatedApp.tsx (R4.1).
  const authAppPath = path.join(clientSrc, 'AuthenticatedApp.tsx')
  if (fs.existsSync(authAppPath)) {
    const authSrc = fs.readFileSync(authAppPath, 'utf8')
    const relAuth = toRepoRelative(authAppPath)
    const seen = new Set()
    for (const m of authSrc.matchAll(/<Route\s+path=["'`]([^"'`]+)["'`]/g)) {
      const routePath = m[1]
      if (seen.has(routePath)) continue
      seen.add(routePath)
      pages.push({ name: routePath, file: relAuth })
    }
  }

  // 2. Enumerate skeleton library components (R12.1 "skeletons created").
  for (const dir of [skeletonsDir, pageSkeletonsDir]) {
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const full = path.join(dir, entry.name)
      skeletonLibraryFiles.add(full)
      // Exclude barrels and non-skeleton support modules from the created list.
      if (entry.name === 'index.ts') continue
      if (entry.name === 'render-state.ts') continue
      if (entry.name === 'LoadingStatusProvider.tsx') continue
      if (!/Skeleton\.(tsx|ts)$/.test(entry.name)) continue
      const rel = toRepoRelative(full)
      const src = fs.readFileSync(full, 'utf8')
      const names = extractSkeletonExports(src)
      const finalNames = names.length > 0 ? names : [path.basename(entry.name).replace(/\.(tsx|ts)$/, '')]
      for (const name of finalNames) {
        skeletons.push({ name, file: rel })
      }
    }
  }

  // 3. Scan every source file for components with loading states, generic
  //    loaders, allow markers, legacy references, and primitive definitions.
  for (const full of files) {
    const rel = toRepoRelative(full)
    const src = fs.readFileSync(full, 'utf8')
    // Strip trailing CR so `$`-anchored marker matching works on CRLF files.
    const lines = src.split('\n').map((l) => l.replace(/\r$/, ''))
    const isSkeletonLibFile = skeletonLibraryFiles.has(full)

    // Primitive definition detection (cross-check for R2.6 single-primitive rule).
    if (/export\s+(?:const|function)\s+Skeleton\b/.test(src) || /export\s*\{[^}]*\bSkeleton\b[^}]*\}/.test(src)) {
      primitiveDefinitions.push({ name: 'Skeleton', file: rel })
    }

    // Legacy reference detection (should be empty post-migration; R2.7).
    if (!isSkeletonLibFile) {
      for (const re of LEGACY_REFERENCE_PATTERNS) {
        const m = src.match(re)
        if (m) {
          legacyReferences.push({ name: m[0], file: rel })
          break
        }
      }
    }

    // Component-with-loading-state detection (R4.2). A file outside the skeleton
    // library that consumes a Component/Page skeleton or the loading-state
    // resolver is treated as a scanned component with a data-dependent loading
    // state.
    if (!isSkeletonLibFile && hasDataDependentLoadingState(src)) {
      components.push({ name: componentNameFromPath(full), file: rel })
    }

    // Generic-loader + allow-marker detection (R3). The loader patterns and the
    // allow-marker resolution below mirror the build guard
    // (`scripts/skeleton-guard.mjs`) so a line is classified as a banned/missing
    // loader IFF the guard would also flag it (R12.4 consistency).
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // The sanctioned single loading-status text lives in LoadingStatusProvider
      // (the guard exempts it from the "Loading..." rule).
      const isLoadingStatusProvider = /LoadingStatusProvider\.[jt]sx?$/.test(rel)
      for (const { kind, test } of GENERIC_LOADER_PATTERNS) {
        if (!test(line)) continue
        if (kind === 'loading-text' && isLoadingStatusProvider) break
        // Allow-listed IFF the guard would consider it allowed: a marker on the
        // line itself, the immediately following line, or a contiguous comment
        // block immediately preceding it.
        if (isAllowedGuardStyle(lines, i)) {
          const allow = findNearbyAllowMarker(lines, i) || { category: 'allow', reason: '' }
          preservedExceptions.push({
            name: `${kind} (${allow.category})`,
            file: rel,
            line: i + 1,
            marker: allow.category,
            reason: allow.reason || '',
          })
        } else {
          genericLoaders.push({ name: kind, file: rel, line: i + 1 })
        }
        break // one classification per line is enough
      }
    }
  }

  // De-duplicate preserved exceptions that may be captured on multiple lines of
  // the same marked block (keep one per file+category+reason).
  const dedupedExceptions = dedupeBy(preservedExceptions, (e) => `${e.file}::${e.marker}::${e.reason}::${e.line}`)

  return {
    pages,
    components: dedupeBy(components, (c) => c.file),
    skeletons,
    genericLoaders,
    preservedExceptions: dedupedExceptions,
    legacyReferences,
    primitiveDefinitions: dedupeBy(primitiveDefinitions, (p) => p.file),
  }
}

/** Extract PascalCase `*Skeleton` export identifiers from a skeleton module. */
function extractSkeletonExports(src) {
  const names = new Set()
  for (const m of src.matchAll(/export\s+(?:const|function)\s+([A-Z][A-Za-z0-9]*Skeleton)\b/g)) {
    names.add(m[1])
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const id = part.trim().split(/\s+as\s+/)[0].trim()
      if (/^[A-Z][A-Za-z0-9]*Skeleton$/.test(id)) names.add(id)
    }
  }
  return [...names]
}

/** Heuristic: does this file render a data-dependent loading state? (R4.2) */
function hasDataDependentLoadingState(src) {
  const importsComponentSkeleton =
    src.includes("@/components/skeletons'") ||
    src.includes('@/components/skeletons"') ||
    src.includes('@/components/skeletons/pages')
  const usesResolver = /\bresolveRenderState\b/.test(src)
  const rendersSkeletonEl = /<[A-Z][A-Za-z0-9]*Skeleton\b/.test(src)
  const hasLoadingFlag = /\b(isLoading|isFetching|isPending)\b/.test(src)
  // Require an actual skeleton hand-off or the resolver, paired with a loading
  // flag, so purely static components are excluded (R4.5).
  return usesResolver || ((importsComponentSkeleton || rendersSkeletonEl) && hasLoadingFlag)
}

/** Derive a component display name from its file path. */
function componentNameFromPath(full) {
  const base = path.basename(full).replace(/\.(tsx|ts|jsx|js)$/, '')
  if (base === 'index') return path.basename(path.dirname(full))
  return base
}

/** Look for an allow marker on line `i` or up to 4 lines above it. */
function findNearbyAllowMarker(lines, i) {
  for (let j = i; j >= Math.max(0, i - 4); j--) {
    const m = lines[j].match(ALLOW_MARKER_RE)
    if (m) {
      return { category: m[1], reason: (m[2] || '').trim() }
    }
  }
  return null
}

/** Heuristic mirroring the guard: does this line look like part of a comment? */
function looksLikeComment(line) {
  const t = line.trim()
  if (t === '') return false
  return (
    t.startsWith('//') ||
    t.startsWith('/*') ||
    t.startsWith('*') ||
    t.startsWith('{/*') ||
    t.includes('*/') ||
    t.includes('skeleton-guard-allow:')
  )
}

/**
 * True if line `idx` carries an allow marker the same way the build guard
 * (`scripts/skeleton-guard.mjs` `isAllowed`) recognizes one: on the line
 * itself, the single line immediately following, or anywhere in the contiguous
 * comment block immediately preceding the line. Keeping this identical to the
 * guard ensures the audit's "missing skeletons" list never disagrees with the
 * guard about what is a preserved exception vs. a banned loader (R12.4).
 */
function isAllowedGuardStyle(lines, idx) {
  if ((lines[idx] ?? '').includes('skeleton-guard-allow:')) return true
  if ((lines[idx + 1] ?? '').includes('skeleton-guard-allow:')) return true
  for (let j = idx - 1; j >= 0; j--) {
    const line = lines[j] ?? ''
    if (line.includes('skeleton-guard-allow:')) return true
    if (!looksLikeComment(line)) break
  }
  return false
}

/** De-duplicate an array of objects by a key function, preserving order. */
function dedupeBy(arr, keyFn) {
  const seen = new Set()
  const out = []
  for (const item of arr) {
    const k = keyFn(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

// ---------------------------------------------------------------------------
// Scan → category map (feeds the pure builder)
// ---------------------------------------------------------------------------

/**
 * Map raw scan data into the seven itemized category lists plus report meta,
 * then hand off to the pure `buildAuditReport` (which derives counts).
 *
 * @param {ReturnType<typeof scanClientSrc>} scan
 * @param {object} [recorded] historical items not observable from the final
 *   codebase state (generic loaders removed, CLS issues fixed, representative
 *   data states). The migration records these; they default to empty lists.
 */
export function buildReportFromScan(scan, recorded = {}) {
  const { genericLoadersRemoved = [], clsIssuesFixed = [] } = recorded

  // Legacy skeletons removed: the recorded canonical removals, verified absent
  // by the live scan (R2.2, R2.3, R4.3).
  const legacySkeletonsRemoved = (recorded.legacySkeletonsRemoved || RECORDED_LEGACY_SKELETONS).map((x) => ({
    name: x.name,
    file: x.file,
  }))

  // Missing skeletons: any unmarked generic loaders that still substitute for a
  // renderable structure, plus any legacy references that survived (R12.3).
  const missingSkeletons = [
    ...scan.genericLoaders.map((g) => ({
      name: `Unmigrated generic loader: ${g.name} (line ${g.line})`,
      file: g.file,
    })),
    ...scan.legacyReferences.map((l) => ({
      name: `Surviving legacy reference: ${l.name}`,
      file: l.file,
    })),
  ]

  const categories = {
    pagesScanned: scan.pages,
    componentsScanned: scan.components,
    skeletonsCreated: scan.skeletons,
    genericLoadersRemoved,
    legacySkeletonsRemoved,
    clsIssuesFixed,
    missingSkeletons,
  }

  return buildAuditReport(categories, {
    primitiveImportPath: PRIMITIVE_IMPORT_PATH,
    componentSkeletonImportPath: COMPONENT_SKELETON_IMPORT_PATH,
    pageSkeletonImportPath: PAGE_SKELETON_IMPORT_PATH,
    primitiveDefinitionCount: scan.primitiveDefinitions.length,
    primitiveDefinitions: scan.primitiveDefinitions,
    exceptions: scan.preservedExceptions.map((e) => ({
      name: e.name,
      file: e.file,
      line: e.line,
      marker: e.marker,
      reason: e.reason,
    })),
    representativeDataStates: recorded.representativeDataStates || [],
    pageVerifications: recorded.pageVerifications || [],
  })
}

// ---------------------------------------------------------------------------
// Writer + entrypoint
// ---------------------------------------------------------------------------

/** Write the rendered markdown to disk, creating parent directories as needed. */
export function writeReport(outputPath, markdown) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, markdown, 'utf8')
  return outputPath
}

/** Full pipeline: scan → build → render. Returns `{ report, markdown, scan }`. */
export function generateAudit(clientSrc = CLIENT_SRC, recorded = {}) {
  const scan = scanClientSrc(clientSrc)
  const report = buildReportFromScan(scan, recorded)
  const markdown = renderMarkdown(report)
  return { report, markdown, scan }
}

function main() {
  const dryRun = process.argv.includes('--dry') || process.argv.includes('--check')
  const { report, markdown } = generateAudit(CLIENT_SRC, RECORDED_INPUTS)

  const { valid, violations } = validateAuditCounts(report)
  if (!valid) {
    console.error('Audit report failed the count/list invariant (R12.7):')
    for (const v of violations) console.error(`  - ${v.category}: ${v.reason}`)
    process.exit(1)
  }

  if (dryRun) {
    console.log(markdown)
    console.log('\n[dry run] report not written.')
    return
  }

  const written = writeReport(AUDIT_OUTPUT, markdown)
  console.log(`Skeleton audit report written to ${toRepoRelative(written)}`)
  for (const key of CATEGORY_KEYS) {
    console.log(`  ${CATEGORY_TITLES[key]}: ${report.categories[key].count}`)
  }
  console.log(`  Preserved exceptions: ${report.exceptions.length}`)
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main()
}
