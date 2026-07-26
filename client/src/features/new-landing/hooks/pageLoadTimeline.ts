/**
 * Veefore New Landing Page — Page Load Timeline Descriptor
 *
 * Pure, DOM-free description of the choreographed entrance sequence. This is
 * the single source of truth for the ordering and start times consumed by
 * `usePageLoadSequence`, ported 1:1 from the design brief.
 *
 * The timeline spans 2.4s (Requirement 19.1) with this exact ordering:
 * nav (0.0s) → eyebrow (0.3s) → headline (0.5s) → subheadline (1.0s) →
 * CTAs (1.3s) → trust stats (1.5s) → 3D card (1.7s) → orbiting badges (2.0s) →
 * particle field (2.2s) → scroll path (2.4s).
 *
 * @see design.md — "Page load sequence orchestration" + "Property 15"
 * @see requirements.md — Requirement 19.1
 */

/** A choreographed element in the page load entrance sequence. */
export type PageLoadElement =
  | 'nav'
  | 'eyebrow'
  | 'headline'
  | 'subheadline'
  | 'ctas'
  | 'trustStats'
  | 'card3d'
  | 'badges'
  | 'particles'
  | 'scrollPath';

/** A single timeline entry: an element and its scheduled start time (seconds). */
export interface PageLoadEntry {
  /** The element being choreographed. */
  element: PageLoadElement;
  /** Scheduled start time relative to mount, in seconds. */
  start: number;
}

/**
 * Returns the page load timeline entries in choreographed order.
 *
 * Entries are ordered by non-decreasing start time, matching the design
 * brief's element ordering exactly. Pure and DOM-free.
 *
 * @returns The ordered list of timeline entries.
 */
export function pageLoadTimeline(): PageLoadEntry[] {
  return [
    { element: 'nav', start: 0.0 },
    { element: 'eyebrow', start: 0.3 },
    { element: 'headline', start: 0.5 },
    { element: 'subheadline', start: 1.0 },
    { element: 'ctas', start: 1.3 },
    { element: 'trustStats', start: 1.5 },
    { element: 'card3d', start: 1.7 },
    { element: 'badges', start: 2.0 },
    { element: 'particles', start: 2.2 },
    { element: 'scrollPath', start: 2.4 },
  ];
}
