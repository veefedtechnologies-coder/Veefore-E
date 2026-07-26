/**
 * Pure, DOM-free scroll-path math for the New Landing Page Scroll_Path system.
 *
 * These functions encapsulate the deterministic geometry/colour/activation
 * calculations behind the animated SVG scroll path, isolated from any DOM,
 * React, GSAP, or rAF concerns so they can be unit/property-tested in
 * isolation.
 *
 * Design ref: design.md "Scroll_Path system design", Correctness Properties 2-5.
 * Requirements: 5.2, 5.3, 5.6, 5.7.
 */

/** A waypoint coordinate in SVG user space. */
export interface Waypoint {
  x: number;
  y: number;
}

/** A node on the scroll path that activates once as the frontier passes it. */
export interface PathNode {
  /** Vertical position of the node along the path. */
  y: number;
  /** Whether the node has been activated (one-shot, never reverts). */
  activated: boolean;
}

/** Round to 2 decimal places — keeps SVG path data clean (mirrors brief's `R`). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Clamp a progress value to the closed interval [0, 1].
 *
 * Non-finite inputs (NaN) clamp to 0.
 */
export function clamp01(p: number): number {
  if (Number.isNaN(p)) return 0;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

/**
 * The SVG `stroke-dashoffset` to apply for a given scroll progress.
 *
 * Equals `pathLength * (1 - clamp01(p))`, so at p=0 the whole path is undrawn
 * (offset === pathLength) and at p=1 it is fully drawn (offset === 0).
 *
 * Validates: Requirements 5.2 (Property 2).
 */
export function dashOffset(pathLength: number, p: number): number {
  return pathLength * (1 - clamp01(p));
}

/**
 * The fraction of the path that is drawn for a given scroll progress.
 *
 * Equals `clamp01(p)`, which is monotonically non-decreasing in p.
 *
 * Validates: Requirements 5.2 (Property 2).
 */
export function drawnFraction(p: number): number {
  return clamp01(p);
}

/**
 * The gradient stop zone index for the tip dot at a given scroll progress.
 *
 * For a gradient with `stopCount` stops there are `stopCount - 1` zones between
 * consecutive stops. The returned index is bounded to `[0, stopCount - 2]` so it
 * can always index a valid "from" stop of a zone.
 *
 * Validates: Requirements 5.6 (Property 4).
 */
export function gradientZoneIndex(p: number, stopCount: number): number {
  // With fewer than 2 stops there are no zones; clamp to 0 defensively.
  const maxIndex = Math.max(0, stopCount - 2);
  const raw = Math.floor(clamp01(p) * (stopCount - 1));
  const upperBounded = Math.min(raw, maxIndex);
  return Math.max(0, upperBounded);
}

/**
 * Build the absolute x-coordinates of the path waypoints from the configured
 * `xPattern` (fractions of width) and the current page width.
 *
 * Validates: Requirements 5.3 (Property 3).
 */
export function buildWaypointXs(xPattern: number[], width: number): number[] {
  return xPattern.map((f) => f * width);
}

/**
 * Whether the path winds horizontally rather than running as a single vertical
 * line — true when there are at least two distinct x-coordinates.
 *
 * Validates: Requirements 5.3 (Property 3).
 */
export function windsHorizontally(waypointXs: number[]): boolean {
  return new Set(waypointXs).size >= 2;
}

/**
 * One-shot node activation reducer.
 *
 * Returns a new array where any node whose `y` is at or above the current
 * frontier (within `threshold` px below it) becomes `activated: true`. Already
 * activated nodes always stay activated — activation never reverts.
 *
 * Validates: Requirements 5.7 (Property 5).
 */
export function activateNodes(
  nodes: PathNode[],
  frontierY: number,
  threshold = 20,
): PathNode[] {
  return nodes.map((node) => {
    if (node.activated) return node;
    if (node.y <= frontierY + threshold) {
      return { ...node, activated: true };
    }
    return node;
  });
}

/**
 * Build the cubic-bezier path `d` string winding through the given waypoints,
 * with control handles pulled vertically by `tension` to create an organic
 * S-curve. Coordinates are rounded to 2 decimals.
 *
 * Mirrors the brief's `_buildBezier` exactly.
 *
 * Validates: Requirements 5.3 (Property 3).
 */
export function buildBezierPath(waypoints: Waypoint[], tension: number): string {
  if (waypoints.length < 2) return '';
  let d = `M ${round2(waypoints[0].x)} ${round2(waypoints[0].y)}`;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const dy = b.y - a.y;
    // Cubic bezier: control points pull handles vertically for organic S-curve.
    d += ` C ${round2(a.x)} ${round2(a.y + dy * tension)}, ${round2(b.x)} ${round2(
      b.y - dy * tension,
    )}, ${round2(b.x)} ${round2(b.y)}`;
  }
  return d;
}
