/**
 * useScrollPath — the New Landing Page's signature animated SVG scroll path.
 *
 * Re-expresses the brief's `VeefScrollPath` class as a lifecycle-bound React
 * effect. On mount it injects an absolutely-positioned SVG into the supplied
 * container ref (NOT `document.body`, so teardown is scoped), builds a cubic
 * bezier winding through every section waypoint, and draws it on scroll via
 * `stroke-dashoffset`. A colour-shifting tip dot rides the drawn frontier and
 * each section node springs in (with a ripple ring + label) as the frontier
 * passes it.
 *
 * Drawing prefers GSAP `ScrollTrigger` (scrubbed) and falls back to a passive
 * rAF-throttled scroll listener when ScrollTrigger is unavailable, exactly as
 * the brief specifies. Geometry is recalculated on viewport resize (debounced)
 * and after the page finishes loading.
 *
 * On unmount the effect kills the ScrollTrigger instance + any GSAP tweens it
 * created, detaches the scroll/resize/load listeners, and removes the injected
 * `.scroll-path-container` from the DOM.
 *
 * Design ref: design.md "Scroll_Path system design" + sequence diagram.
 * Brief ref: VEEFORE_LANDING_PAGE_PROMPT_COMPLETE.md "SCROLL PATH SYSTEM".
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13.
 */
import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { SCROLL_PATH_CONFIG } from '../constants/scrollPath';
import {
  buildBezierPath,
  gradientZoneIndex,
  type PathNode,
  type Waypoint,
} from './scrollPathMath';

// Register the ScrollTrigger plugin exactly once at module load — browser only
// (it touches the DOM and breaks SSR import).
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Threshold (px) below the frontier within which a node activates. */
const NODE_ACTIVATION_THRESHOLD = 20;

/** A single section node managed by the hook (mirrors the brief's node shape). */
interface ScrollPathNode extends PathNode {
  dot: SVGCircleElement;
  label: SVGTextElement;
  color: string;
}

/** A waypoint that may carry a label + colour for a section node. */
interface PathWaypoint extends Waypoint {
  label?: string;
  color?: string;
}

/** Round to 2 decimal places — keeps SVG attribute data clean (brief's `R`). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Drive the animated SVG scroll path for the page rooted at `containerRef`.
 *
 * @param containerRef - The page root element the SVG is injected into and
 *   measured against. The caller is responsible for giving it `position:
 *   relative` (or similar) so the absolutely-positioned overlay aligns.
 * @param opts.enabled - When `false` (caller passes `!isMobile && !reducedMotion`),
 *   the hook does nothing and renders no SVG (Requirements 5.11, 5.12).
 */
export function useScrollPath(
  containerRef: React.RefObject<HTMLElement>,
  opts: { enabled: boolean },
): void {
  const { enabled } = opts;

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container || typeof document === 'undefined') return;

    const config = SCROLL_PATH_CONFIG;

    // ── SVG namespace helper ──────────────────────────────────────────────
    const ns = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
      document.createElementNS(SVG_NS, tag);

    // ── Build the SVG skeleton (once) ─────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'scroll-path-container';
    // Scoped inline styles so the overlay works without relying on global CSS
    // (Requirements 5.9, 5.10): below content (z-index 2), never blocks clicks.
    Object.assign(wrap.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '2',
      overflow: 'visible',
    } satisfies Partial<CSSStyleDeclaration>);

    const svg = ns('svg');
    svg.id = 'scroll-path-svg';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.overflow = 'visible';

    const defs = ns('defs');

    // Linear gradient — runs top → bottom of the full page in user space.
    const gradient = ns('linearGradient');
    gradient.id = 'veefPathGrad';
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('x2', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('y2', '1000');
    config.gradientStops.forEach((s) => {
      const stop = ns('stop');
      stop.setAttribute('offset', s.offset);
      stop.setAttribute('stop-color', s.color);
      gradient.appendChild(stop);
    });

    // PERF: no feGaussianBlur filters. Blurring a path that spans the whole
    // page and animating its stroke-dashoffset forces a full re-rasterisation
    // of the blurred region every scroll frame (the source of the jank). The
    // glow is instead faked with a wide, low-opacity round-cap stroke, which
    // costs nothing to redraw.
    defs.append(gradient);
    svg.appendChild(defs);

    // Glow path — wide, translucent, round-capped copy (cheap neon glow).
    const glowPath = ns('path');
    glowPath.id = 'scroll-glow-path';
    glowPath.setAttribute('stroke', 'url(#veefPathGrad)');
    glowPath.setAttribute('stroke-width', String(config.glowStrokeWidth));
    glowPath.setAttribute('fill', 'none');
    glowPath.setAttribute('opacity', String(config.glowOpacity));
    glowPath.setAttribute('stroke-linecap', 'round');

    // Main path — thin crisp line (Requirement 5.5).
    const mainPath = ns('path');
    mainPath.id = 'scroll-main-path';
    mainPath.setAttribute('stroke', 'url(#veefPathGrad)');
    mainPath.setAttribute('stroke-width', String(config.mainStrokeWidth));
    mainPath.setAttribute('fill', 'none');
    mainPath.setAttribute('stroke-linecap', 'round');

    // Tip dot — rides the drawn frontier (Requirement 5.6).
    const tipDot = ns('circle');
    tipDot.setAttribute('class', 'path-tip-dot');
    tipDot.setAttribute('r', String(config.tipDotRadius));
    tipDot.setAttribute('fill', '#FFFFFF');
    tipDot.setAttribute('opacity', '0');

    svg.append(glowPath, mainPath, tipDot);
    wrap.appendChild(svg);
    container.prepend(wrap);

    // ── Mutable geometry state ────────────────────────────────────────────
    let waypoints: PathWaypoint[] = [];
    let nodes: ScrollPathNode[] = [];
    let pathLength = 0;
    let lenSamples: { len: number; x: number; y: number }[] = [];
    const gsapTweens: gsap.core.Tween[] = [];

    // ── Section nodes are intentionally NOT rendered ──────────────────────
    // Per design: only the running path line (+ its tip dot) is shown. The
    // per-section checkpoint dots, labels (e.g. "HERO", "LIVE"), and ripple
    // rings are disabled so the path reads as a single clean stroke.
    const buildNodes = (): void => {
      nodes.forEach((n) => {
        n.dot.remove()
        n.label.remove()
      })
      nodes = []
    };

    // ── True content height ───────────────────────────────────────────────
    // The injected SVG overlay is absolutely positioned and sized in px. If we
    // ever measure the page via document.scrollHeight (which counts the SVG's
    // own height), the value can only grow on each resize — latching a blank
    // strip below the footer where the fixed grid shows through. Measuring the
    // footer's bottom edge in document space is independent of the overlay, so
    // it is stable across resizes. Falls back to scrollHeight only pre-footer.
    const measureContentHeight = (): number => {
      const footerEl = container.querySelector('footer');
      if (footerEl) {
        const bottom = footerEl.getBoundingClientRect().bottom + window.scrollY;
        if (bottom > 0) return Math.ceil(bottom);
      }
      return document.documentElement.scrollHeight;
    };

    // ── Recalculate geometry (load / resize) — Requirement 5.8 ────────────
    const recalculate = (): void => {
      const W = document.documentElement.clientWidth;
      const H = measureContentHeight();

      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(H));
      svg.style.height = `${H}px`;

      // Stretch gradient to real page height (userSpaceOnUse).
      gradient.setAttribute('y2', String(H));

      // Build waypoints: entry top-center, one per section, exit bottom-center.
      // IMPORTANT: collect section waypoints from their REAL vertical position
      // and sort by Y, so the path always flows monotonically top → bottom
      // regardless of the DOM order of sections (otherwise the curve zig-zags
      // backwards when sections are reordered).
      const sectionWaypoints: PathWaypoint[] = [];
      config.sectionIds.forEach((id, i) => {
        const el = container.querySelector(id);
        if (!el) return;

        // If a section marks explicit waypoint anchors (e.g. the staggered
        // "how it works" steps), thread the path through EACH of their real
        // centres instead of a single section centre. This lets the one global
        // scroll path connect every step — no separate per-section SVG.
        //
        // IMPORTANT: only count VISIBLE anchors. The "how it works" section
        // renders two layouts (mobile + desktop) and hides one with
        // `display:none`; hidden anchors report a (0,0) rect which would drag
        // the path to the top-left corner. `offsetParent === null` reliably
        // detects display:none elements.
        const anchors = Array.from(
          el.querySelectorAll<HTMLElement>('[data-veef-waypoint]'),
        ).filter((a) => a.offsetParent !== null && a.getClientRects().length > 0);
        if (anchors.length > 0) {
          anchors.forEach((a, j) => {
            const ar = a.getBoundingClientRect();
            sectionWaypoints.push({
              x: ar.left + window.scrollX + ar.width / 2,
              y: ar.top + window.scrollY + ar.height / 2,
              label: a.dataset.veefWaypoint || config.nodeLabels[i],
              color: a.dataset.veefColor || config.nodeColors[(i + j) % config.nodeColors.length],
            });
          });
          return;
        }

        const rect = el.getBoundingClientRect();
        const y = rect.top + window.scrollY + rect.height * 0.45;
        const x = W * config.xPattern[i % config.xPattern.length];
        sectionWaypoints.push({
          x,
          y,
          label: config.nodeLabels[i],
          color: config.nodeColors[i],
        });
      });
      // Sort top → bottom by Y so the bezier never doubles back on itself.
      sectionWaypoints.sort((a, b) => a.y - b.y);

      waypoints = [];
      // Start the path below the hero fold so it never bleeds into the hero
      // headline/eyebrow. ~85vh keeps the entry just past the first screen.
      waypoints.push({ x: W * 0.5, y: window.innerHeight * 0.85 });
      waypoints.push(...sectionWaypoints);

      // End the path just ABOVE the footer so it never enters that section.
      // Look up the footer element's real top; fall back to 120px above the
      // page bottom if no footer is found.
      const footerEl = container.querySelector('footer');
      const pathEndY = footerEl
        ? footerEl.getBoundingClientRect().top + window.scrollY - 80
        : H - 120;
      waypoints.push({ x: W * 0.5, y: pathEndY });

      // Build + apply the bezier path (Requirement 5.3).
      const d = buildBezierPath(waypoints, config.tension);
      mainPath.setAttribute('d', d);
      glowPath.setAttribute('d', d);

      // Dash setup — start fully undrawn (Requirement 5.2).
      // Batch both writes into one cssText assignment so the browser styles
      // each path in a single pass (runs only on resize/load, not per frame).
      pathLength = mainPath.getTotalLength();
      const dashCss = `stroke-dasharray:${pathLength};stroke-dashoffset:${pathLength};`;
      mainPath.style.cssText = dashCss;
      glowPath.style.cssText = dashCss;

      // Build a length→Y sample table. Because the path winds left/right, its
      // arc-length does NOT map linearly to vertical position — drawing by raw
      // scroll fraction makes the frontier race ahead of the viewport. We
      // instead look up the path length whose Y matches the current scroll
      // position so the drawn frontier always tracks what's on screen.
      lenSamples = [];
      const SAMPLES = 240;
      for (let i = 0; i <= SAMPLES; i++) {
        const len = (pathLength * i) / SAMPLES;
        const pt = mainPath.getPointAtLength(len);
        lenSamples.push({ len, x: pt.x, y: pt.y });
      }

      buildNodes();
    };

    // Map an absolute page Y to the path length whose point sits at that Y
    // (binary-ish linear scan over the monotonic-by-construction samples).
    const lengthAtY = (y: number): number => {
      if (lenSamples.length === 0) return 0;
      if (y <= lenSamples[0].y) return 0;
      const last = lenSamples[lenSamples.length - 1];
      if (y >= last.y) return last.len;
      for (let i = 1; i < lenSamples.length; i++) {
        const a = lenSamples[i - 1];
        const b = lenSamples[i];
        if (y <= b.y) {
          const span = b.y - a.y || 1;
          const t = (y - a.y) / span;
          return a.len + (b.len - a.len) * t;
        }
      }
      return last.len;
    };

    // Interpolate the path point (x, y) at a given length from the precomputed
    // samples — avoids calling the expensive SVG `getPointAtLength()` on every
    // scroll frame (a key source of scroll jank on long pages).
    const pointAtLen = (len: number): { x: number; y: number } => {
      if (lenSamples.length === 0) return { x: 0, y: 0 };
      const last = lenSamples[lenSamples.length - 1];
      if (len <= 0) return { x: lenSamples[0].x, y: lenSamples[0].y };
      if (len >= last.len) return { x: last.x, y: last.y };
      // Samples are evenly spaced by length, so the index is directly computable.
      const step = last.len / (lenSamples.length - 1) || 1;
      const idx = Math.min(lenSamples.length - 2, Math.floor(len / step));
      const a = lenSamples[idx];
      const b = lenSamples[idx + 1];
      const span = b.len - a.len || 1;
      const t = (len - a.len) / span;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };

    // ── Per-frame progress handler (0 → 1) ────────────────────────────────
    // `progress` is overall page scroll 0..1 (used as a fallback). The real
    // draw target is the path length whose Y sits near the bottom of the
    // current viewport, so the frontier tracks what the user is actually
    // looking at instead of racing ahead.
    const onProgress = (progress: number): void => {
      if (pathLength <= 0) return;

      // Draw up to a point a little below the viewport centre — the line leads
      // the eye slightly but never feels "already there".
      const targetY = window.scrollY + window.innerHeight * 0.62;
      const drawnLen = lenSamples.length ? lengthAtY(targetY) : pathLength * progress;
      const remaining = pathLength - drawnLen;

      mainPath.style.strokeDashoffset = String(remaining);
      glowPath.style.strokeDashoffset = String(remaining);

      // Show the tip dot once the path has meaningfully started; keep it at the
      // path's end when fully drawn (the end already sits just above the footer,
      // so it no longer parks in a blank gap now that the SVG height tracks the
      // real content height).
      const drawnFrac = drawnLen / pathLength;
      if (drawnFrac > 0.004) {
        const pt = pointAtLen(drawnLen);
        tipDot.setAttribute('cx', String(round2(pt.x)));
        tipDot.setAttribute('cy', String(round2(pt.y)));
        tipDot.setAttribute('opacity', '1');

        // Tip dot colour follows the current gradient zone (Requirement 5.6).
        const idx = gradientZoneIndex(drawnFrac, config.gradientStops.length);
        tipDot.setAttribute('fill', config.gradientStops[idx].color);
      } else {
        tipDot.setAttribute('opacity', '0');
      }
    };

    // ── Initial geometry ──────────────────────────────────────────────────
    recalculate();

    // ── Bind scroll: prefer GSAP ScrollTrigger, fall back to rAF ──────────
    let scrollTriggerInstance: ScrollTrigger | null = null;
    let scrollListener: (() => void) | null = null;

    if (typeof ScrollTrigger !== 'undefined') {
      const tween = gsap.to(
        {},
        {
          scrollTrigger: {
            trigger: 'body',
            start: 'top top',
            end: 'bottom bottom',
            scrub: config.scrub,
            onUpdate: (self) => onProgress(self.progress),
          },
        },
      );
      gsapTweens.push(tween);
      scrollTriggerInstance = (tween.scrollTrigger as ScrollTrigger) ?? null;
    } else {
      let pending = false;
      scrollListener = () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          const prog = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
          onProgress(prog);
          pending = false;
        });
      };
      window.addEventListener('scroll', scrollListener, { passive: true });
    }

    // ── Recalculate on resize (debounced) and load (Requirement 5.8) ──────
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRecalc = (): void => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        recalculate();
        ScrollTrigger.refresh();
        // Re-apply the current scroll progress so the drawn frontier matches
        // the freshly-measured geometry instead of staying stale.
        onProgress(0);
      }, 200);
    };
    const onResize = (): void => scheduleRecalc();
    const onLoad = (): void => scheduleRecalc();

    window.addEventListener('resize', onResize);
    window.addEventListener('load', onLoad);

    // The page height changes AFTER mount (fonts load, entrance animations
    // settle, lazy/responsive sections expand). The path is measured against
    // absolute document positions, so stale geometry makes it misbehave. A
    // ResizeObserver on the container re-measures whenever the total height
    // changes — the robust fix for the path drifting out of alignment.
    let lastHeight = measureContentHeight();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        const h = measureContentHeight();
        if (Math.abs(h - lastHeight) > 4) {
          lastHeight = h;
          scheduleRecalc();
        }
      });
      ro.observe(container);
    }

    // Settle pass: re-measure a few times during the first couple of seconds
    // to catch async layout shifts (web fonts, images, framer entrance).
    const settleTimers = [400, 1000, 2000].map((ms) =>
      setTimeout(() => {
        recalculate();
        onProgress(0);
      }, ms),
    );

    // ── Cleanup (Requirement 5.13) ────────────────────────────────────────
    return () => {
      clearTimeout(resizeTimer);
      settleTimers.forEach(clearTimeout);
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('load', onLoad);
      if (scrollListener) {
        window.removeEventListener('scroll', scrollListener);
      }
      // Kill the ScrollTrigger instance + every GSAP tween created here.
      scrollTriggerInstance?.kill();
      gsapTweens.forEach((t) => t.kill());
      // Remove the injected SVG overlay from the DOM.
      wrap.remove();
    };
  }, [enabled, containerRef]);
}
