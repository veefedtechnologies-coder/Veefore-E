# Landing Page Feature Module

This module contains the refactored landing page components, following the feature-driven architecture pattern as per the codebase refactoring requirements.

## Structure

```
landing/
├── sections/
│   └── HeroSection.tsx      # Main hero section component (~300 lines)
├── components/
│   ├── RotatingText.tsx     # Rotating tagline text component
│   └── VideoBackground.tsx  # Lazy-loaded video background
├── hooks/
│   └── useScrollAnimation.ts # Scroll-based parallax animation hook
├── Landing.tsx              # Main landing page orchestrator
├── index.ts                 # Public exports
└── README.md               # This file
```

## Components

### HeroSection

The main hero section component featuring:
- Cinematic video background with lazy loading
- Rotating tagline text with smooth transitions
- Scroll-based parallax effects (opacity, scale, blur)
- CTA button with early access check
- Mobile-optimized animations

**Requirements**: 21.1, 21.3, 21.5

**Usage**:
```tsx
import { HeroSection } from '@/features/landing'

<HeroSection />
```

### RotatingText

Displays rotating taglines with smooth fade/slide transitions. Optimized for performance with controlled animation timing.

### VideoBackground

Lazy-loaded video background component that handles:
- Browser autoplay restrictions
- Automatic play retry logic
- Mobile optimization
- Graceful fallbacks

## Hooks

### useScrollAnimation

Custom hook providing scroll-based parallax effects:
- `opacity` - Fades out hero as user scrolls
- `scale` - Subtle shrink effect on scroll
- `filter` - Progressive blur (desktop only)
- `overlayOpacity` - Mobile dark overlay fallback

**Usage**:
```tsx
import { useScrollAnimation } from '@/features/landing'

const { opacity, scale, filter, overlayOpacity } = useScrollAnimation()
```

## Design Decisions

### Component Extraction Rationale

The original `CinematicHeroSection.tsx` (~275 lines) was extracted into:

1. **HeroSection.tsx** (~100 lines) - Main orchestrator component
2. **RotatingText.tsx** (~65 lines) - Isolated text animation logic
3. **VideoBackground.tsx** (~95 lines) - Isolated video handling logic
4. **useScrollAnimation.ts** (~50 lines) - Reusable scroll animation hook

**Benefits**:
- Single Responsibility Principle: Each component has one clear purpose
- Reusability: VideoBackground and RotatingText can be reused elsewhere
- Testability: Smaller components are easier to unit test
- Maintainability: Easier to locate and modify specific functionality

### Animation Performance

All animations follow mobile-first optimization:
- Desktop: Full parallax effects with blur filters
- Mobile: Simplified animations with dark overlay instead of blur (better performance)
- GPU acceleration via transform3d and willChange hints
- Respects `prefers-reduced-motion` user preference

### Lazy Loading Strategy

The video background is lazy-loaded to optimize initial page load:
- Gradient placeholder displays immediately
- Video loads asynchronously in background
- Retry logic handles browser autoplay restrictions
- Mobile-optimized with reduced quality/size

## Requirements Validation

- ✅ **21.1**: Landing.tsx refactored into focused sections
- ✅ **21.3**: Lazy loading implemented for video backgrounds
- ✅ **21.5**: Viewport-based lazy loading for sections
- ✅ **22.2**: useReducedMotion hook respects accessibility preferences
- ✅ **22.5**: IntersectionObserver (via Framer Motion viewport) for scroll triggers

## Migration Notes

### From Original Implementation

The old implementation:
```tsx
import CinematicHeroSection from '../components/CinematicHeroSection'
<CinematicHeroSection />
```

New implementation:
```tsx
import { HeroSection } from '../features/landing'
<HeroSection />
```

### Backward Compatibility

The original `CinematicHeroSection.tsx` component is still available in `components/` for backward compatibility during migration. It will be removed once all references are updated.

## Testing

Unit tests should cover:
- [ ] RotatingText animation cycles through all taglines
- [ ] VideoBackground retries playback on failure
- [ ] useScrollAnimation returns correct transform values
- [ ] HeroSection renders without errors
- [ ] CTA button routes correctly based on early access status

## Performance Metrics

Target metrics (per Requirements 21.6, 21.7):
- Initial bundle size: 50% reduction vs original Landing.tsx
- Lighthouse performance score: ≥90
- Lazy loading: Video deferred until after critical content
- Animation performance: 60 FPS on 4x CPU throttling

## Future Enhancements

Potential improvements:
- [ ] A/B testing for different taglines
- [ ] Progressive image loading for video poster
- [ ] WebP/AVIF video formats for better compression
- [ ] Intersection Observer for smarter video play/pause
- [ ] Preconnect to video CDN for faster loading
