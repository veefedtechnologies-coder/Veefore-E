/**
 * Skeleton audit — pure report-builder / validator library.
 *
 * Spec: pixel-perfect-skeleton-loading — task 12.1 (Requirements 2.5, 3.5, 3.6,
 * 4.4, 4.5, 12.1–12.7).
 *
 * This module contains ONLY pure logic (no filesystem access, no side effects),
 * so it can be imported by:
 *   - `scripts/skeleton-audit.mjs` (the filesystem scanner / generator), and
 *   - the property test (task 12.2) running under vitest, which imports
 *     `buildAuditReport` / `validateAuditCounts` directly.
 *
 * Report model (R12.2): seven categories — pages scanned, components scanned,
 * skeletons created, generic loaders removed, legacy skeletons removed, CLS
 * issues fixed, missing skeletons. Each category has a NON-NEGATIVE INTEGER
 * `count` and an ITEMIZED LIST where every item records `{ name, file }`.
 *
 * CRITICAL INVARIANT (R12.7, Property 16): every category's `count` is DERIVED
 * BY CONSTRUCTION from its itemized list length (`count === items.length`). The
 * builder never sets a count independently, and `validateAuditCounts` enforces
 * it.
 */

/**
 * The single documented import path for the Skeleton primitive and shared
 * Component_Skeletons (R2.5). Recorded verbatim in the report.
 */
export const PRIMITIVE_IMPORT_PATH = '@/components/ui/skeleton'
/** Documented barrel for the shared Component_Skeleton library. */
export const COMPONENT_SKELETON_IMPORT_PATH = '@/components/skeletons'
/** Documented barrel for the per-route Page_Skeleton library. */
export const PAGE_SKELETON_IMPORT_PATH = '@/components/skeletons/pages'

/** The seven audit category keys, in report order (R12.2). */
export const CATEGORY_KEYS = [
  'pagesScanned',
  'componentsScanned',
  'skeletonsCreated',
  'genericLoadersRemoved',
  'legacySkeletonsRemoved',
  'clsIssuesFixed',
  'missingSkeletons',
]

/** Human-readable titles for each category in the rendered markdown. */
export const CATEGORY_TITLES = {
  pagesScanned: 'Pages scanned',
  componentsScanned: 'Components scanned',
  skeletonsCreated: 'Skeletons created',
  genericLoadersRemoved: 'Generic loaders removed',
  legacySkeletonsRemoved: 'Legacy skeletons removed',
  clsIssuesFixed: 'CLS issues fixed',
  missingSkeletons: 'Missing skeletons',
}

// ---------------------------------------------------------------------------
// Per-page verification (R13.7, R13.8)
// ---------------------------------------------------------------------------

/**
 * The six per-page verification checks (Requirement 13, criteria 1–6), in
 * canonical order. Mirrors `CHECK_IDS` in
 * `client/src/components/skeletons/page-verification.ts` so the audit's
 * per-page verification section and the pure recorder agree on the check set
 * and ordering (R13.7).
 */
export const CHECK_IDS = ['dimensions', 'responsive', 'theme', 'cls', 'shimmer', 'conditionalParity']

/** Human-readable titles for each per-page verification check. */
export const CHECK_TITLES = {
  dimensions: 'Dimensions (R13.1)',
  responsive: 'Responsive (R13.2)',
  theme: 'Theme (R13.3)',
  cls: 'CLS (R13.4)',
  shimmer: 'Shimmer (R13.5)',
  conditionalParity: 'Conditional parity (R13.6)',
}

/**
 * Derive the overall production-ready status from a page's six check outcomes.
 *
 * Returns `'production-ready'` if and only if ALL six checks pass; otherwise
 * `'not-production-ready'` (Property 17, R13.7, R13.8). Kept consistent with
 * `derivePageStatus` in `page-verification.ts`.
 *
 * Pure: no side effects, deterministic for a given input.
 *
 * @param {Record<string, {passed: boolean, observedValue?: string|number}>} checks
 */
export function derivePageStatus(checks) {
  const c = checks || {}
  const allPass = CHECK_IDS.every((id) => c[id]?.passed === true)
  return allPass ? 'production-ready' : 'not-production-ready'
}

/**
 * Collect the failing checks (and their observed values) from a page's check
 * outcomes, in canonical {@link CHECK_IDS} order (R13.8). Returns an empty
 * array when every check passes.
 *
 * @param {Record<string, {passed: boolean, observedValue?: string|number}>} checks
 */
export function getFailingChecks(checks) {
  const c = checks || {}
  return CHECK_IDS.filter((id) => c[id]?.passed !== true).map((id) => ({
    checkId: id,
    observedValue: c[id]?.observedValue,
  }))
}

/**
 * Record a page's verification result: derive the overall production-ready
 * status and, on any failure, the list of failing checks with their observed
 * values (R13.7, R13.8). Mirrors `recordPageVerification` in
 * `page-verification.ts`.
 *
 * @param {{pageId: string, route?: string, skeleton?: string, checks: object}} page
 */
export function recordPageVerification(page) {
  const checks = page?.checks || {}
  const status = derivePageStatus(checks)
  return {
    pageId: String(page?.pageId ?? ''),
    route: page?.route ? String(page.route) : '',
    skeleton: page?.skeleton ? String(page.skeleton) : '',
    checks,
    status,
    failingChecks: status === 'production-ready' ? [] : getFailingChecks(checks),
  }
}

/**
 * Construct a category object whose `count` is derived from the item list
 * length BY CONSTRUCTION (R12.7 / Property 16). Items are normalized to
 * `{ name, file }`. A count can never be supplied independently.
 *
 * @param {Array<{name: unknown, file: unknown}>} [items]
 * @returns {{ count: number, items: Array<{name: string, file: string}> }}
 */
export function makeCategory(items) {
  const normalized = (Array.isArray(items) ? items : []).map((it) => ({
    name: String(it?.name ?? ''),
    file: String(it?.file ?? ''),
  }))
  return { count: normalized.length, items: normalized }
}

/**
 * Build the audit report model from a category map of itemized lists.
 *
 * Every category's `count` is DERIVED FROM its itemized list length via
 * `makeCategory` — the count is never supplied independently, guaranteeing the
 * R12.7 / Property-16 invariant (`count === items.length`) holds by
 * construction. Unknown/missing categories default to empty lists.
 *
 * @param {Partial<Record<typeof CATEGORY_KEYS[number], Array<{name:unknown,file:unknown}>>>} categories
 *   itemized lists keyed by category (extra/unknown keys are ignored).
 * @param {object} [meta] non-category metadata recorded in the report.
 * @param {string} [meta.generatedAt] ISO timestamp.
 * @param {string} [meta.primitiveImportPath]
 * @param {string} [meta.componentSkeletonImportPath]
 * @param {string} [meta.pageSkeletonImportPath]
 * @param {number} [meta.primitiveDefinitionCount]
 * @param {Array<{name:string,file:string}>} [meta.primitiveDefinitions]
 * @param {Array<object>} [meta.exceptions] preserved/allow-listed usages (R3.5, R3.6).
 * @param {Array<{component:string,file?:string,state:string}>} [meta.representativeDataStates] (R5.6).
 */
export function buildAuditReport(categories, meta = {}) {
  const cats = categories || {}
  const builtCategories = {}
  for (const key of CATEGORY_KEYS) {
    builtCategories[key] = makeCategory(cats[key])
  }

  return {
    generatedAt: meta.generatedAt || new Date().toISOString(),
    primitiveImportPath: meta.primitiveImportPath || PRIMITIVE_IMPORT_PATH,
    componentSkeletonImportPath: meta.componentSkeletonImportPath || COMPONENT_SKELETON_IMPORT_PATH,
    pageSkeletonImportPath: meta.pageSkeletonImportPath || PAGE_SKELETON_IMPORT_PATH,
    primitiveDefinitionCount:
      typeof meta.primitiveDefinitionCount === 'number'
        ? meta.primitiveDefinitionCount
        : Array.isArray(meta.primitiveDefinitions)
          ? meta.primitiveDefinitions.length
          : 0,
    primitiveDefinitions: Array.isArray(meta.primitiveDefinitions) ? meta.primitiveDefinitions : [],
    categories: builtCategories,
    exceptions: Array.isArray(meta.exceptions) ? meta.exceptions : [],
    representativeDataStates: Array.isArray(meta.representativeDataStates)
      ? meta.representativeDataStates
      : [],
    pageVerifications: Array.isArray(meta.pageVerifications)
      ? meta.pageVerifications.map((p) => recordPageVerification(p))
      : [],
  }
}

/**
 * Validate the count/list invariant for a report (R12.7 / Property 16): the
 * validator passes IFF every category's integer count equals its itemized list
 * length (and is a non-negative integer). Returns `{ valid, violations }`.
 *
 * @param {ReturnType<typeof buildAuditReport>} report
 */
export function validateAuditCounts(report) {
  const violations = []
  for (const key of CATEGORY_KEYS) {
    const cat = report?.categories?.[key]
    if (!cat) {
      violations.push({ category: key, reason: 'missing category' })
      continue
    }
    const len = Array.isArray(cat.items) ? cat.items.length : NaN
    if (!Number.isInteger(cat.count) || cat.count < 0) {
      violations.push({ category: key, reason: `count is not a non-negative integer: ${cat.count}` })
    } else if (cat.count !== len) {
      violations.push({ category: key, reason: `count ${cat.count} !== items.length ${len}` })
    }
  }
  return { valid: violations.length === 0, violations }
}

/**
 * Render the report model to a markdown document string (R12.2, R12.6).
 *
 * @param {ReturnType<typeof buildAuditReport>} report
 */
export function renderMarkdown(report) {
  const lines = []
  lines.push('# Skeleton Loading Audit Report')
  lines.push('')
  lines.push('> Generated by `scripts/skeleton-audit.mjs` (spec: pixel-perfect-skeleton-loading).')
  lines.push('> Each category count is derived from its itemized list length (R12.7).')
  lines.push('')
  lines.push(`- Generated: ${report.generatedAt}`)
  lines.push('- Scanned root: `client/src`')
  lines.push('')

  // Documented import paths (R2.5).
  lines.push('## Documented import paths')
  lines.push('')
  lines.push(`- Skeleton primitive: \`${report.primitiveImportPath}\``)
  lines.push(`- Shared component skeletons: \`${report.componentSkeletonImportPath}\``)
  lines.push(`- Page skeletons: \`${report.pageSkeletonImportPath}\``)
  lines.push(
    `- Skeleton primitive definitions found in \`client/src\`: ${report.primitiveDefinitionCount} (expected 1, R2.6)`,
  )
  lines.push('')

  // Summary table.
  lines.push('## Summary')
  lines.push('')
  lines.push('| Category | Count |')
  lines.push('| --- | --- |')
  for (const key of CATEGORY_KEYS) {
    lines.push(`| ${CATEGORY_TITLES[key]} | ${report.categories[key].count} |`)
  }
  lines.push('')

  // Itemized categories.
  for (const key of CATEGORY_KEYS) {
    const cat = report.categories[key]
    lines.push(`## ${CATEGORY_TITLES[key]} (${cat.count})`)
    lines.push('')
    if (cat.items.length === 0) {
      lines.push('_None._')
    } else {
      for (const item of cat.items) {
        lines.push(`- **${item.name}** — \`${item.file}\``)
      }
    }
    lines.push('')
  }

  // Preserved usages / allow-listed exceptions (R3.5, R3.6).
  lines.push(`## Recorded exceptions / preserved usages (${report.exceptions.length})`)
  lines.push('')
  lines.push('Allow-listed generic-loader and `animate-pulse` usages (marked with')
  lines.push('`skeleton-guard-allow:`) that are intentionally preserved — e.g. the')
  lines.push('pre-auth boot loader in `App.tsx`, live status-indicator dots, decorative')
  lines.push('pulses, progress bars, image placeholders, action/button spinners.')
  lines.push('')
  if (report.exceptions.length === 0) {
    lines.push('_None._')
  } else {
    for (const ex of report.exceptions) {
      const reason = ex.reason ? ` — ${ex.reason}` : ''
      const marker = ex.marker || ex.name || 'allow'
      lines.push(`- **${marker}** in \`${ex.file}:${ex.line ?? '?'}\`${reason}`)
    }
  }
  lines.push('')

  // Representative data state per verified component (R5.6).
  lines.push(`## Representative data state per component (${report.representativeDataStates.length})`)
  lines.push('')
  lines.push('The data state used to verify each skeleton against its final component:')
  lines.push('the median quantity/length of content with all conditional sections resolved')
  lines.push('to their most common variant (R5.6).')
  lines.push('')
  if (report.representativeDataStates.length === 0) {
    lines.push('_None recorded yet._')
  } else {
    for (const r of report.representativeDataStates) {
      const where = r.file ? ` (\`${r.file}\`)` : ''
      lines.push(`- **${r.component}**${where}: ${r.state}`)
    }
  }
  lines.push('')

  // Per-page verification (R13.7, R13.8).
  const pageVerifications = Array.isArray(report.pageVerifications) ? report.pageVerifications : []
  const readyCount = pageVerifications.filter((p) => p.status === 'production-ready').length
  lines.push(`## Per-page verification (R13.7)`)
  lines.push('')
  lines.push('Per verified page: the pass/fail outcome of each of the six checks (R13.1–R13.6)')
  lines.push('and an overall production-ready status, which is `production-ready` if and only if')
  lines.push('all six checks pass (Property 17). Where a failing check exists, its observed value')
  lines.push('is recorded (R13.8).')
  lines.push('')
  lines.push('Verification scope: structural/contract parity is established by the vitest suites')
  lines.push('(`page-skeleton-structure`, `skeleton-cls-contract`, `skeleton-theme-shimmer`,')
  lines.push('`conditional-sections.property`, theme `Property 8` no-remount). The exact real-browser')
  lines.push('pixel tolerances (R5, 4px/8px) and route-level CLS (R8.4) are deferred to the Playwright/')
  lines.push('Lighthouse harness; outcomes below are recorded at the structural-proxy level and noted as such.')
  lines.push('')
  lines.push(`- Pages verified: ${pageVerifications.length}`)
  lines.push(`- Production-ready: ${readyCount} / ${pageVerifications.length}`)
  lines.push('')
  if (pageVerifications.length === 0) {
    lines.push('_None recorded yet._')
    lines.push('')
  } else {
    lines.push(
      `| Page | Route | ${CHECK_IDS.map((id) => CHECK_TITLES[id]).join(' | ')} | Status |`,
    )
    lines.push(`| --- | --- | ${CHECK_IDS.map(() => '---').join(' | ')} | --- |`)
    for (const p of pageVerifications) {
      const cells = CHECK_IDS.map((id) => (p.checks?.[id]?.passed === true ? 'PASS' : 'FAIL'))
      const statusLabel = p.status === 'production-ready' ? '✅ production-ready' : '❌ not-production-ready'
      lines.push(`| ${p.pageId} | \`${p.route || ''}\` | ${cells.join(' | ')} | ${statusLabel} |`)
    }
    lines.push('')

    // Per-page observed values + any failing checks (R13.8).
    lines.push('### Per-page check observations')
    lines.push('')
    for (const p of pageVerifications) {
      lines.push(`- **${p.pageId}** (\`${p.route || ''}\`) — ${p.status}`)
      for (const id of CHECK_IDS) {
        const outcome = p.checks?.[id]
        const mark = outcome?.passed === true ? 'PASS' : 'FAIL'
        const observed = outcome?.observedValue !== undefined ? ` — ${outcome.observedValue}` : ''
        lines.push(`  - ${CHECK_TITLES[id]}: ${mark}${observed}`)
      }
      if (p.failingChecks.length > 0) {
        const failing = p.failingChecks
          .map((f) => `${f.checkId}${f.observedValue !== undefined ? ` (${f.observedValue})` : ''}`)
          .join(', ')
        lines.push(`  - Failing checks: ${failing}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
