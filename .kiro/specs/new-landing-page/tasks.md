# Implementation Plan: New Landing Page

## Overview

This plan implements the new Veefore marketing landing page (`/landing`) as a self-contained React feature under `client/src/features/new-landing/`, plus a server-side caption proxy. It is built incrementally: dependencies and pure logic first, then primitives/hooks, then sections, then orchestration and routing, with property-based and unit tests placed close to the code they validate.

Implementation language: **TypeScript / React 19** (matches the existing codebase and the design's TypeScript interfaces). All property tests use **fast-check** (already installed) under `vitest.client.config.ts` for client units and the default vitest config for server units, each running a minimum of 100 iterations and tagged `// Feature: new-landing-page, Property {n}: ...`.

## Tasks

- [x] 1. Add pinned dependencies and scaffold the feature folder
  - [x] 1.1 Add the two new pinned dependencies
    - Add `gsap` (pinned, e.g. `3.13.0`) and `lenis` (pinned, e.g. `1.1.x`) to `package.json` `dependencies` with exact pinned versions (no `^`/`~`), then install
    - Confirm `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion`, `zod`, `lucide-react`, `wouter` are already present (do NOT add Typed.js, Splitting.js, CountUp.js)
    - _Requirements: 23.1, 23.3_

  - [x] 1.2 Scaffold the feature folder structure and scoped styles
    - Create `client/src/features/new-landing/` with subfolders `context/`, `primitives/`, `hooks/`, `constants/`, `sections/`, `sections/hero/`, `api/`, `__tests__/`
    - Create `index.ts` (re-export `NewLandingPage` named + default), an empty `README.md`, and `newLanding.css` with the single root scope `.veef-landing { ... }` declaring CSS custom properties, `@font-face`/Google Fonts import (Syne, DM Sans, JetBrains Mono), and keyframes — no global/`:root`/element-tag selectors
    - _Requirements: 1.1, 3.4, 4.4, 4.5_

- [x] 2. Implement colour constants and the colour guard
  - [x] 2.1 Create the colour system and scroll-path/content/pricing constants
    - Create `constants/colors.ts` (`COLORS`, `GRADIENTS` exactly per design — zero purple), `constants/scrollPath.ts` (`xPattern`, `sectionIds`, `nodeLabels`, `gradientStops`, `nodeColors`, `tension` 0.48, strokes/opacity/radii/scrub), `constants/content.ts` (nav links, 6 problems, 5 features, 3 how-steps, testimonials, 8 FAQs), `constants/pricing.ts` (Starter/Growth/Agency INR monthly+annual tables, Growth `popular`)
    - _Requirements: 4.1, 4.3, 5.3, 5.4, 9.1, 10.1, 13.1, 15.1_

  - [x] 2.2 Implement `colorGuard.ts` pure logic
    - Export `isInPalette(color)`, `isPurpleHue(color)`, and `assertNoPurple(styleString)` operating over hex/gradient strings using the `COLORS` palette as the single source of truth
    - _Requirements: 4.1, 4.2_

  - [ ]* 2.3 Write property test for colour-system / zero-purple constraint
    - **Property 1: Only Colour_System colours, never purple**
    - **Validates: Requirements 4.1, 4.2, 5.4, 7.8, 10.3**
    - fast-check over arbitrary colour strings + every constant token; assert palette membership and no purple hue resolves

- [x] 3. Implement pure scroll-path math
  - [x] 3.1 Create `hooks/scrollPathMath.ts`
    - Pure functions: `dashOffset(pathLength, p)` = `pathLength * (1 - clamp01(p))`; `drawnFraction(p)` monotonic non-decreasing; `gradientZoneIndex(p, stops)` bounded to `[0, stops.length-2]`; `buildWaypointXs(xPattern, width)`; `windsHorizontally(waypoints)` (>=2 distinct x); `activateNodesReducer(nodes, frontierY)` one-shot activation
    - _Requirements: 5.2, 5.3, 5.6, 5.7_

  - [ ]* 3.2 Write property test for scroll-path draw proportion
    - **Property 2: Scroll path draws in exact proportion to scroll progress**
    - **Validates: Requirements 5.2**
    - fast-check p in [0,1]: assert `dashOffset == pathLength*(1-p)` and drawn fraction monotonic non-decreasing

  - [ ]* 3.3 Write property test for path winding
    - **Property 3: Scroll path winds rather than running straight**
    - **Validates: Requirements 5.3**
    - fast-check over `xPattern`/width: assert generated waypoints contain >=2 distinct x-coordinates

  - [ ]* 3.4 Write property test for tip-dot gradient zone
    - **Property 4: Tip dot colour matches the current gradient zone**
    - **Validates: Requirements 5.6**
    - fast-check p in [0,1]: assert zone index in bounds and tip fill equals that stop's colour

  - [ ]* 3.5 Write property test for one-shot node activation
    - **Property 5: Each section node activates at most once**
    - **Validates: Requirements 5.7**
    - fast-check monotonic non-decreasing progress sequence: assert each node goes inactive→active at most once, never reverts

- [x] 4. Implement remaining pure logic units (tilt, predicates, pixel-ratio, timeline, reducers)
  - [x] 4.1 Create `primitives/tilt.ts` clamp logic
    - Export `clampTilt(rawX, rawY, maxX=8, maxY=6)` returning tilt within `[-maxX,+maxX]`/`[-maxY,+maxY]`
    - _Requirements: 7.4_

  - [x] 4.2 Create visibility predicates and pixel-ratio clamp
    - Create `hooks/visibility.ts`: `shouldRenderScrollPath({ width, reducedMotion, mobileBreakpoint })` and `shouldRenderCustomCursor({ finePointer, reducedMotion, width, mobileBreakpoint })`
    - Create `hooks/pixelRatio.ts`: `clampPixelRatio(dpr)` = `min(dpr, 2)`
    - _Requirements: 5.11, 5.12, 18.4, 18.5, 22.2_

  - [x] 4.3 Create `hooks/pageLoadTimeline.ts` descriptor
    - Export `pageLoadTimeline()` returning ordered entries with start times: nav 0.0, eyebrow 0.3, headline 0.5, subheadline 1.0, CTAs 1.3, trust stats 1.5, 3D card 1.7, badges 2.0, particles 2.2, scroll path 2.4
    - _Requirements: 19.1_

  - [x] 4.4 Create FAQ and pricing reducers
    - Create `sections/faqReducer.ts`: `faqReducer(openIndex, activatedIndex)` → opening a closed item sets it open and closes others; at most one open
    - Create `sections/pricingReducer.ts`: `selectedPrice(tier, period)` returns the table value for the selected period
    - _Requirements: 13.3, 13.4, 15.2_

  - [ ]* 4.5 Write property test for hero tilt clamp
    - **Property 8: Hero card tilt is clamped**
    - **Validates: Requirements 7.4**
    - fast-check arbitrary pointer positions: assert tiltX in [-8,8], tiltY in [-6,6]

  - [ ]* 4.6 Write property test for scroll-path visibility predicate
    - **Property 6: Scroll path renders only on desktop with motion enabled**
    - **Validates: Requirements 5.11, 5.12**
    - fast-check over width × reducedMotion: assert rendered iff width > breakpoint AND not reducedMotion

  - [ ]* 4.7 Write property test for custom-cursor visibility predicate
    - **Property 14: Custom cursor renders only on fine-pointer desktop with motion enabled**
    - **Validates: Requirements 18.4, 18.5**
    - fast-check over finePointer × reducedMotion × width: assert cursor iff finePointer AND not reducedMotion AND width > breakpoint

  - [ ]* 4.8 Write property test for pixel-ratio cap
    - **Property 16: Three.js pixel ratio is capped at 2**
    - **Validates: Requirements 22.2**
    - fast-check arbitrary dpr: assert `clampPixelRatio(dpr) == min(dpr,2)` and never > 2

  - [ ]* 4.9 Write property test for page-load timeline ordering
    - **Property 15: Page load sequence preserves the specified order**
    - **Validates: Requirements 19.1**
    - fast-check/iteration over timeline: assert scheduled start times are non-decreasing in the specified element order

  - [ ]* 4.10 Write property test for pricing toggle round-trip
    - **Property 10: Pricing toggle shows the selected period's value and round-trips**
    - **Validates: Requirements 13.3, 13.4**
    - fast-check over tiers: displayed price equals selected-period table value; monthly→annual→monthly restores original

  - [ ]* 4.11 Write property test for FAQ single-open invariant
    - **Property 13: At most one FAQ item is open**
    - **Validates: Requirements 15.2**
    - fast-check arbitrary activation sequences: assert open count <= 1 and opening a closed item collapses the previous

- [x] 5. Checkpoint - pure logic
  - Ensure all property/unit tests for constants and pure logic pass, ask the user if questions arise.

- [x] 6. Implement motion context and core hooks
  - [x] 6.1 Implement `hooks/useReducedMotion.ts` and `hooks/useMediaQuery.ts`
    - `useReducedMotion` subscribes to `prefers-reduced-motion: reduce`; `useMediaQuery` generic `matchMedia` subscription with cleanup
    - _Requirements: 21.1, 23.2_

  - [x] 6.2 Implement `context/LandingMotionProvider.tsx`
    - Resolve `reducedMotion`, `isMobile` (<=768px), `finePointer` (`(pointer: fine)`) once and expose via `useLandingMotion()` context
    - _Requirements: 18.4, 18.5, 21.1_

  - [x] 6.3 Implement `hooks/useLenis.ts`
    - Init Lenis smooth scroll on mount; disable inertia under reduced motion; destroy on unmount and treat cleanup as incomplete if `destroy()` fails (logged)
    - _Requirements: 18.3, 18.4, 18.6, 23.2_

  - [x] 6.4 Implement `hooks/useScrollProgress.ts`, `useInViewOnce.ts`, `useTypewriter.ts`, `useCountUp.ts`
    - `useScrollProgress` 0..1 page progress; `useInViewOnce` IntersectionObserver one-shot; `useTypewriter` looping typewriter (Typed.js replacement, reduced-motion aware); `useCountUp` rAF count-up (CountUp.js replacement, reduced-motion sets final value, cancels rAF on unmount)
    - _Requirements: 13.3, 22.5, 23.1, 23.2_

  - [ ]* 6.5 Write unit tests for hooks
    - Test reduced-motion gating, matchMedia subscribe/unsubscribe cleanup, useCountUp final-value-on-reduced-motion and rAF cancellation
    - _Requirements: 21.1, 22.5_

- [x] 7. Implement primitives
  - [x] 7.1 Implement `primitives/SplitText.tsx` and `primitives/GlowButton.tsx`
    - `SplitText`: framer-motion per-char/word staggered reveal (Splitting.js replacement); `GlowButton`: coral CTA with hover glow + visible focus ring; both static under reduced motion
    - _Requirements: 4.4, 6.5, 16.3, 21.1, 21.4, 23.1_

  - [x] 7.2 Implement `primitives/TiltCard.tsx`
    - Pointer-tilt wrapper using `clampTilt` (±8°X/±6°Y), holds tilt when pointer stops; no tilt under reduced motion
    - _Requirements: 7.4, 7.5, 21.1_

  - [x] 7.3 Implement `hooks/useScrollPath.ts` and `primitives/ScrollPath.tsx`
    - Hook injects absolutely-positioned SVG into the container ref (not body), builds bezier via `scrollPathMath`, draws via `stroke-dashoffset`, rides colour-shifting tip dot, springs/ripples/labels nodes; prefers GSAP ScrollTrigger with rAF fallback; recalculates on resize/load; kills ScrollTrigger + removes injected SVG + detaches scroll/resize/load listeners on unmount; early-returns when `isMobile` or `reducedMotion`
    - `ScrollPath.tsx` wraps the hook; dual-layer glow, z-index 2, `pointer-events: none`
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13_

  - [x] 7.4 Implement `primitives/CustomCursor.tsx`
    - Dot snaps to pointer, ring follows with lerp + trail, hover-expand on clickable; renders only when `shouldRenderCustomCursor` true (fine pointer, motion on, desktop) else native cursor; removes listeners on unmount and treats removal failure as incomplete cleanup
    - _Requirements: 18.1, 18.2, 18.4, 18.5, 18.6_

  - [ ]* 7.5 Write unit/cleanup tests for ScrollPath and CustomCursor
    - Spy-assert ScrollPath removes injected DOM + detaches listeners + kills ScrollTrigger on unmount; CustomCursor renders native cursor when predicate false and removes listeners on unmount
    - _Requirements: 5.13, 18.5, 18.6_

- [x] 8. Checkpoint - primitives and hooks
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement the server-side caption proxy
  - [x] 9.1 Implement `server/services/LandingCaptionService.ts`
    - Thin server-side AI caller using a server-held key (Anthropic/OpenAI); builds system prompt, parses provider text into JSON, returns exactly 3 captions; one server-side retry with backoff on transient failure; never returns the key or raw provider errors
    - _Requirements: 12.5, 12.7_

  - [x] 9.2 Implement `server/routes/v1/public-landing.routes.ts`
    - `POST /api/public/landing/captions`, unauthenticated, with a `landingCaptionRateLimiter` (express-rate-limit, per-IP) and zod body validation `{ topic, niche, tone }`; map errors per the table: 400 invalid_request, 429 (retryAfter), 502 generation_failed, 504 timeout, 500 internal_error; on success return `{ captions: string[] }` (exactly 3)
    - _Requirements: 12.5, 12.7, 12.8_

  - [x] 9.3 Register the public-landing route
    - Wire `public-landing.routes.ts` into `server/routes/v1/index.ts` (mount at `/api/public/landing`) without altering existing route mappings
    - _Requirements: 12.8_

  - [ ]* 9.4 Write property test for API key non-leakage
    - **Property 11: Caption proxy never leaks the API key**
    - **Validates: Requirements 12.5**
    - fast-check arbitrary request inputs with mocked provider: assert response body and headers never contain the configured key value

  - [ ]* 9.5 Write integration test for the caption proxy
    - `server/routes/v1/public-landing.routes.test.ts`: unauthenticated valid body → 200 with 3 captions (provider mocked); empty/invalid body → 400; exceeding rate limit → 429; key-leak guard on body/headers
    - _Requirements: 12.5, 12.7, 12.8_

- [x] 10. Implement client caption API wrapper
  - [x] 10.1 Implement `api/captions.ts`
    - `generateCaptions(req, signal?)` fetch wrapper to the proxy returning `{ captions }`; supports `AbortController`; maps non-2xx to typed errors
    - _Requirements: 12.2, 12.7_

- [x] 11. Implement Nav, Hero, and hero subcomponents
  - [x] 11.1 Implement `sections/NavSection.tsx`
    - Fixed nav; `scrolled` threshold at 80px toggles transparent↔blurred navy (mutually exclusive); wordmark + center links (Home/Features/How It Works/Pricing/Blog) with `SplitText` letter-rise; "Try Free" `GlowButton`; `<=768px` hamburger → full-screen staggered overlay; instant state changes under reduced motion
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 20.2, 21.1_

  - [ ]* 11.2 Write property test for nav background threshold exclusivity
    - **Property 7: Navigation background state is threshold-exclusive**
    - **Validates: Requirements 6.2, 6.3**
    - fast-check arbitrary scroll offsets: assert exactly one state — blurred iff offset > 80px, transparent iff <= 80px

  - [x] 11.3 Implement hero subcomponents
    - `sections/hero/HeroScene.tsx` (R3F `<Canvas dpr={[1,2]}>` via `clampPixelRatio`, reserved canvas dims, `frameloop="demand"` under reduced motion, disposes resources on unmount), `FloatingCard.tsx` (TiltCard + 3s/12px sine float), `OrbitingBadges.tsx` (continuous orbit + pulse), `NotificationToasts.tsx` (slide-in/pause/slide-out loop), `ParticleField.tsx` (60 dots coral/cyan/gold)
    - _Requirements: 7.2, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 22.1, 22.2, 22.5_

  - [x] 11.4 Implement `sections/HeroSection.tsx`
    - `id="hero"`, 100vh, reserved canvas space; left column eyebrow pill, `SplitText` headline, subheadline, `useTypewriter` audience loop, two CTAs, three `useCountUp` trust stats; right column composes hero subcomponents; static final state under reduced motion
    - _Requirements: 7.1, 7.2, 7.3, 7.9, 20.1, 21.1, 21.2_

  - [ ]* 11.5 Write unit tests for Nav and Hero
    - Independent mount; Nav renders required links/CTA + mobile hamburger overlay opens; Hero has `id="hero"`, reserves canvas dims, renders chart/gauge/metric rows; text alternatives present
    - _Requirements: 3.3, 6.4, 7.1, 7.2, 7.3, 21.2_

- [x] 12. Implement Ticker, Problem, Features sections
  - [x] 12.1 Implement `sections/TickerSection.tsx`
    - Full-width seamless marquee (tripled track), 40s loop, pause on hover when motion allowed via `animation-play-state`, stationary under reduced motion regardless of hover
    - _Requirements: 8.1, 8.2, 8.3, 21.1_

  - [x] 12.2 Implement `sections/ProblemSection.tsx`
    - `id="problem"`; slices content to first 6 cards, hides extras; 2×3 grid alternating coral/cyan/gold borders; Y-axis flip-in with stagger via `useInViewOnce`; reveal without flip under reduced motion
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 20.2, 21.1_

  - [ ]* 12.3 Write property test for Problem six-card cap
    - **Property 9: Problem section shows at most six cards**
    - **Validates: Requirements 9.1, 9.2**
    - fast-check arbitrary item arrays: assert rendered count == min(count,6), never > 6, first six preserved in order

  - [x] 12.4 Implement `sections/FeaturesSection.tsx`
    - `id="features"`; 5 panels accents coral/cyan/gold/mint/rose; desktop GSAP ScrollTrigger pin + horizontal pan over ~400vh (created/killed in effect); `<=768px` vertical stacked, no pin; stacked under reduced motion
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 20.2, 21.1_

  - [ ]* 12.5 Write unit tests for Ticker, Problem, Features
    - Independent mount; correct section ids; Ticker pause-on-hover toggling; Problem caps at 6; Features renders 5 panels with specified accents and stacks at mobile
    - _Requirements: 3.3, 8.1, 9.1, 10.1, 10.3, 10.4_

- [x] 13. Implement HowItWorks, LiveDemo, Pricing sections
  - [x] 13.1 Implement `sections/HowItWorksSection.tsx`
    - `id="how-it-works"`; 3 sequential steps with coral/cyan/gold badges; dotted connector draws via `stroke-dashoffset` on enter; static (no draw/hover/micro-interactions) under reduced motion
    - _Requirements: 11.1, 11.2, 11.3, 21.1_

  - [x] 13.2 Implement `sections/LiveDemoSection.tsx`
    - `id="demo"`; topic field, niche selector, tone selector, generate `GlowButton`; state machine idle→validating→loading→success|error; empty/whitespace topic shows inline prompt and does NOT call proxy; on valid topic call `api/captions.ts` with shimmer skeleton, render 3 caption cards each with copy-to-clipboard; error/no-captions shows descriptive message + retry; `AbortController` cancel on unmount
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7_

  - [x] 13.3 Implement `sections/PricingSection.tsx`
    - `id="pricing"`; 3 INR tiers Starter/Growth/Agency, Growth elevated + "Most Popular" mint badge; monthly/annual toggle animates prices via `useCountUp` using `selectedPrice`; instant prices under reduced motion
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 21.1_

  - [ ]* 13.4 Write property test for empty-topic guard
    - **Property 12: Empty topic never calls the proxy**
    - **Validates: Requirements 12.6**
    - fast-check whitespace-only/empty topics: assert generate does not invoke the proxy (spy) and surfaces the enter-topic prompt

  - [ ]* 13.5 Write unit tests for HowItWorks, LiveDemo, Pricing
    - Independent mount + section ids; LiveDemo copy-to-clipboard, empty-topic prompt, error+retry path (proxy mocked); Pricing elevates middle tier + Most Popular badge
    - _Requirements: 3.3, 11.1, 12.1, 12.4, 12.7, 13.1, 13.2_

- [x] 14. Implement Testimonials, FAQ, FinalCTA, Footer sections
  - [x] 14.1 Implement `sections/TestimonialsSection.tsx`
    - `id="testimonials"`; masonry 3/2/1 columns; stagger-fade on enter; hover accent glow + lift; single column at `<=768px`; no fade/lift under reduced motion
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 20.2, 21.1_

  - [x] 14.2 Implement `sections/FaqSection.tsx`
    - `id="faq"`; 8 accordion items using `faqReducer` (`openIndex`); at most one open; open rotates indicator + slide-down answer; keyboard operable buttons with `aria-expanded`
    - _Requirements: 15.1, 15.2, 15.3, 21.3, 21.4_

  - [x] 14.3 Implement `sections/FinalCtaSection.tsx`
    - `id="cta"`; headline, supporting text, primary + secondary CTAs, trust badges; radial glow + particles in palette colours, particles render even when drift disabled; coral glow hover on primary; no drift under reduced motion
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 21.1_

  - [x] 14.4 Implement `sections/FooterSection.tsx`
    - ≥4 content columns + bottom bar (copyright + legal links); social icons coral glow hover; `bgFooter` `#020810`
    - _Requirements: 17.1, 17.2_

  - [ ]* 14.5 Write unit tests for Testimonials, FAQ, FinalCTA, Footer
    - Independent mount + section ids; Testimonials single-column at mobile; FAQ expand visuals + keyboard operability; FinalCTA renders all required elements + particles when drift disabled; Footer >=4 columns + bottom bar
    - _Requirements: 3.3, 14.1, 14.4, 15.1, 15.3, 16.1, 16.2, 17.1, 21.3_

- [x] 15. Checkpoint - all sections
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement orchestration root and page-load sequence
  - [x] 16.1 Implement `hooks/usePageLoadSequence.ts`
    - Drive the 2.4s entrance timeline from `pageLoadTimeline()` (GSAP/framer-motion); return per-element variants consumed by Hero subcomponents and ScrollPath; under reduced motion the hook does not run and all elements mount in final visible state
    - _Requirements: 19.1, 19.2, 21.1_

  - [x] 16.2 Implement `NewLandingPage.tsx` orchestrator and `index.ts`
    - Compose `LandingMotionProvider`, `CustomCursor`, `ScrollPath`, and the ordered section stack (Nav, Hero, Ticker, Problem, Features, HowItWorks, LiveDemo, Pricing, Testimonials, FAQ, FinalCTA, Footer) under the `.veef-landing` root; own page container ref + page-load sequence + Lenis; preload display/body/mono fonts; lazy-load non-critical images; no large inline section markup; export named + default
    - _Requirements: 3.1, 3.2, 4.5, 18.3, 19.1, 22.3, 22.4_

  - [ ]* 16.3 Write property test for reduced-motion suppression
    - **Property 17: Reduced motion suppresses all animation**
    - **Validates: Requirements 21.1, 7.9, 8.3, 9.4, 10.5, 11.3, 16.4, 19.2**
    - Render each section with reduced motion active; assert no running continuous/entrance/interaction animation and elements shown in final state

  - [ ]* 16.4 Write responsive + accessibility example tests
    - Render the page at 375/768/1024/1440px: assert no horizontal overflow and multi-column→single-column at breakpoint; assert keyboard reachability, visible focus indicators, and text alternatives
    - _Requirements: 20.1, 20.2, 20.3, 21.2, 21.3, 21.4_

- [x] 17. Re-point the `/landing` route in App.tsx (only permitted change)
  - [x] 17.1 Add lazy import and re-point `/landing` into the bare-render branch
    - Add `const NewLanding = React.lazy(() => import('./features/new-landing').then(m => ({ default: m.NewLandingPage })))`; extend the special bare-render branch condition to include `/landing` (rendered without global `MainNavigation`/`MainFooter`, wrapped in existing `RouteErrorBoundary` + `Suspense` minimal fallback); update `renderPublicPage()` `/landing` case to `<NewLanding/>`; keep `/landing` in `publicRoutes`; leave the `/` case byte-for-byte unchanged
    - _Requirements: 1.2, 1.3, 2.1, 2.3, 2.4, 2.5_

  - [ ]* 17.2 Write routing + isolation regression tests
    - `/landing` mounts the new page; `/` still mounts the existing `features/landing/Landing.tsx` (unchanged); loading fallback shows; `/landing` stays public; assert `features/landing/Landing.tsx` content and the `/` mapping are unchanged
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 18. Final checkpoint - full verification
  - Ensure all property, unit, and integration tests pass and the build compiles; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each task references specific requirement clauses and, where applicable, the design correctness property it implements.
- All 17 correctness properties are covered by exactly one property-based test each (tasks 2.3, 3.2, 3.3, 3.4, 3.5, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 9.4, 11.2, 12.3, 13.4, 16.3 — see mapping below).
- Property→task map: P1→2.3, P2→3.2, P3→3.3, P4→3.4, P5→3.5, P6→4.6, P7→11.2, P8→4.5, P9→12.3, P10→4.10, P11→9.4, P12→13.4 (PBT), P13→4.11, P14→4.7, P15→4.9, P16→4.8, P17→16.3.
- Pure logic is factored into testable units (`scrollPathMath`, `tilt`, `colorGuard`, `visibility`, `pixelRatio`, `pageLoadTimeline`, `faqReducer`, `pricingReducer`) so DOM-independent properties run under happy-dom; layout-dependent criteria (375px overflow, true CLS) use example tests + manual visual verification.
- The only change permitted in `App.tsx` is the `/landing` re-point; the `/` case and `features/landing/Landing.tsx` must remain untouched.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1", "4.1", "4.2", "4.3", "4.4", "9.1"] },
    { "id": 2, "tasks": ["2.3", "3.2", "3.3", "3.4", "3.5", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "6.1", "9.2", "10.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "6.4", "7.1", "9.3", "9.4", "9.5"] },
    { "id": 4, "tasks": ["6.5", "7.2", "7.3", "7.4"] },
    { "id": 5, "tasks": ["7.5", "11.1", "11.3", "12.1", "12.2", "13.1", "13.2", "14.1", "14.2", "14.3", "14.4"] },
    { "id": 6, "tasks": ["11.2", "11.4", "12.3", "12.4", "13.3", "14.5"] },
    { "id": 7, "tasks": ["11.5", "12.5", "13.4", "13.5", "16.1"] },
    { "id": 8, "tasks": ["16.2"] },
    { "id": 9, "tasks": ["16.3", "16.4", "17.1"] },
    { "id": 10, "tasks": ["17.2"] }
  ]
}
```
