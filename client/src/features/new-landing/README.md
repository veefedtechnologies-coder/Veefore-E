# New Landing Page Feature

Self-contained React feature for the brand-new Veefore marketing landing page, served only at `/landing`. Built from the design brief in `VEEFORE_LANDING_PAGE_PROMPT_COMPLETE.md` and fully isolated from the existing `client/src/features/landing/` feature (which is left untouched).

All styling is scoped under a single `.veef-landing` root class (see `newLanding.css`) using the fixed Veefore colour system — deep navy backgrounds with coral, cyan, gold, mint, and rose accents, and zero purple.

## Structure

```
new-landing/
├── index.ts              # Public exports (NewLandingPage named + default)
├── NewLandingPage.tsx    # Orchestrator root (placeholder until task 16.2)
├── newLanding.css        # Scoped colour tokens, font imports, keyframes
├── context/              # LandingMotionProvider (reduced-motion / mobile / pointer)
├── primitives/           # ScrollPath, CustomCursor, SplitText, TiltCard, GlowButton
├── hooks/                # useScrollPath, useLenis, useReducedMotion, etc.
├── constants/            # colours, scroll path config, content, pricing
├── sections/             # one component per page section
│   └── hero/             # hero subcomponents (R3F scene, card, badges, etc.)
├── api/                  # client fetch wrapper for the caption proxy
└── __tests__/            # unit + property tests
```
