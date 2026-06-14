/**
 * Phase 1 Review Mode flag
 *
 * Centralized so all landing sections/components read the same value.
 * When VITE_META_PHASE_1_REVIEW_MODE === 'true' the copy switches to the
 * "scheduling / analytics" narrative instead of the "engagement / DM" one.
 */
export const isPhase1 = import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true'
