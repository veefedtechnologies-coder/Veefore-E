/**
 * Meta Phase 1 Review Mode
 * =========================
 *
 * Veefore applies for Meta API permissions in phases:
 *   • Phase 1 — Basic + Scheduler permissions (no DM / comment automation)
 *   • Phase 2 — DM and comment automation
 *
 * While the Phase 1 application is under Meta review, the public landing page
 * must NOT advertise any DM / comment automation capability (those permissions
 * are not yet granted). When this flag is on, every automation-specific block,
 * ticker item, comparison row, FAQ entry and copy fragment is hidden or
 * replaced with a non-automation feature (scheduling, analytics, AI content).
 *
 * Toggle with the client env var:
 *   VITE_META_PHASE_1_REVIEW_MODE=true
 *
 * (The server mirrors this with META_PHASE_1_REVIEW_MODE for any server-side
 *  gating.)
 */
export const PHASE_1_REVIEW_MODE: boolean =
  import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true'
