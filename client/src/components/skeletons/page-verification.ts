/**
 * Pure per-page quality-verification recording and production-ready status
 * derivation for the pixel-perfect skeleton loading system.
 *
 * This module contains no DOM/CLS/visual measurement — only the pure,
 * deterministic logic that records the pass/fail outcome of the six
 * verification checks for a page and derives an overall production-ready
 * status from them (Property 17). The actual measurement of each check
 * (dimensions, breakpoints, theme, CLS, shimmer, conditional parity) is
 * performed by the DOM/Lighthouse/Playwright test tasks (13.3–13.5), which
 * feed their observed outcomes into {@link recordPageVerification}.
 *
 * See design.md → "Per-page verification procedure (R13)" and
 * "Property 17: Per-page production-ready status derivation".
 *
 * _Requirements: 13.7, 13.8_
 */

/**
 * The six per-page verification checks (Requirement 13, criteria 1–6).
 *
 * - `dimensions`           → element dimensions/spacing within the 4px
 *                            per-dimension and 8px outer-height tolerances (R13.1)
 * - `responsive`           → responsive parity at the page's Tailwind
 *                            breakpoints (R13.2)
 * - `theme`                → correct rendering in `light` + ≥1 dark variant (R13.3)
 * - `cls`                  → route-level CLS contribution ≤ 0.1 (R13.4)
 * - `shimmer`              → shimmer present while mounted + static fill under
 *                            reduced motion (R13.5)
 * - `conditionalParity`    → conditional-rendering parity per Requirement 9 (R13.6)
 */
export type CheckId =
  | 'dimensions'
  | 'responsive'
  | 'theme'
  | 'cls'
  | 'shimmer'
  | 'conditionalParity';

/**
 * The frozen, ordered set of the six verification check ids (criteria 1–6).
 * Iterating this guarantees a stable, complete check ordering.
 */
export const CHECK_IDS: readonly CheckId[] = Object.freeze([
  'dimensions',
  'responsive',
  'theme',
  'cls',
  'shimmer',
  'conditionalParity',
] as const);

/**
 * The recorded outcome of a single verification check.
 *
 * - `passed`        → whether the check passed
 * - `observedValue` → the measured value that produced the outcome (e.g. an
 *                     outer-height delta in px, a CLS number, a theme label).
 *                     Always recorded on failure (R13.8); optional on pass.
 */
export interface CheckOutcome {
  passed: boolean;
  observedValue?: string | number;
}

/**
 * The complete set of six check outcomes for a page.
 */
export type PageChecks = Record<CheckId, CheckOutcome>;

/**
 * The raw verification input for a page: its identifier plus the six check
 * outcomes.
 */
export interface PageVerification {
  pageId: string;
  checks: PageChecks;
}

/**
 * Overall production-ready status for a page (R13.7).
 *
 * - `production-ready`     → all six checks passed
 * - `not-production-ready` → at least one check failed
 */
export type PageStatus = 'production-ready' | 'not-production-ready';

/**
 * A single failing check together with the observed value that caused the
 * failure (R13.8).
 */
export interface FailingCheck {
  checkId: CheckId;
  observedValue?: string | number;
}

/**
 * The recorded verification result for a page, suitable for writing into the
 * Audit_Report (R13.7, R13.8).
 *
 * - `pageId`         → the page identifier
 * - `checks`         → the six recorded check outcomes
 * - `status`         → the derived overall production-ready status
 * - `failingChecks`  → on any failure, the failing checks and their observed
 *                      values; empty when the page is production ready
 */
export interface PageVerificationRecord {
  pageId: string;
  checks: PageChecks;
  status: PageStatus;
  failingChecks: FailingCheck[];
}

/**
 * Derive the overall production-ready status from a page's six check outcomes.
 *
 * Returns `production-ready` if and only if ALL six checks pass; otherwise
 * `not-production-ready` (Property 17, R13.7, R13.8).
 *
 * Pure: no side effects, deterministic for a given input.
 */
export function derivePageStatus(checks: PageChecks): PageStatus {
  const allPass = CHECK_IDS.every((id) => checks[id]?.passed === true);
  return allPass ? 'production-ready' : 'not-production-ready';
}

/**
 * Collect the failing checks (and their observed values) from a page's check
 * outcomes, in canonical {@link CHECK_IDS} order (R13.8).
 *
 * Returns an empty array when every check passes.
 *
 * Pure: no side effects, deterministic for a given input.
 */
export function getFailingChecks(checks: PageChecks): FailingCheck[] {
  return CHECK_IDS.filter((id) => checks[id]?.passed !== true).map((id) => ({
    checkId: id,
    observedValue: checks[id]?.observedValue,
  }));
}

/**
 * Record a page's verification result: derive the overall production-ready
 * status and, on any failure, the list of failing checks with their observed
 * values (R13.7, R13.8).
 *
 * The returned record is exactly what gets written into the Audit_Report by
 * task 13.6.
 *
 * Pure: no side effects, deterministic for a given input.
 */
export function recordPageVerification(
  pageId: string,
  checks: PageChecks,
): PageVerificationRecord {
  const status = derivePageStatus(checks);
  return {
    pageId,
    checks,
    status,
    failingChecks: status === 'production-ready' ? [] : getFailingChecks(checks),
  };
}
