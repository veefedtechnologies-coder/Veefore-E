# client/src/shared

Client-side shared modules used across all feature domains in the Veefore-E frontend application.

---

## Overview

This directory contains UI components, hooks, services, and utilities that are:
- Used by **two or more** feature modules
- Not specific to any single domain
- Stable and well-tested

Do not put feature-specific code here. If something is only used by one feature, it belongs in `/client/src/features/<feature>/`.

---

## Directory Structure

```
client/src/shared/
├── components/              — Reusable UI components
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Form.tsx
│   │   └── ...
│   └── layout/
│       ├── PageLayout.tsx
│       └── SectionLayout.tsx
├── hooks/                   — Reusable cross-feature hooks
│   ├── useDebounce.ts
│   ├── useLocalStorage.ts
│   └── useMediaQuery.ts
├── services/                — Client-side service classes
│   └── MobileOptimizationService.ts
├── types/                   — Shared TypeScript interfaces
│   ├── api.types.ts
│   └── ui.types.ts
└── utils/
    └── mobile/              — Mobile-specific utilities
        ├── touchHandlers.ts
        ├── responsive.ts
        └── performance.ts
```

---

## Services

### MobileOptimizationService

Unified mobile detection and optimization service. Replaces the three deprecated libraries (`mobile-excellence.ts`, `mobile-optimization.ts`, `mobile-performance.ts`).

```typescript
import { MobileOptimizationService } from '@/shared/services/MobileOptimizationService';

const mobile = MobileOptimizationService.getInstance();

// Device detection
console.log(mobile.isMobile);     // boolean
console.log(mobile.isTablet);     // boolean
console.log(mobile.os);           // 'ios' | 'android' | 'windows' | ...

// Breakpoints
console.log(mobile.breakpoint);   // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

// Subscribe to breakpoint changes
const unsubscribe = mobile.onBreakpointChange((bp) => {
  console.log('Breakpoint changed:', bp);
});

// Network quality
console.log(mobile.getNetworkQuality()); // 'fast' | 'medium' | 'slow' | 'offline'
```

---

## Mobile Utilities

### `utils/mobile/responsive.ts`

```typescript
import { isMobile, isTablet, getBreakpoint, getContainerWidth } from '@/shared/utils/mobile/responsive';

isMobile()                  // boolean — based on UA + viewport
isTablet()                  // boolean
getBreakpoint(768)          // 'md'
getContainerWidth('md')     // 768
```

### `utils/mobile/touchHandlers.ts`

```typescript
import { createSwipeHandler, onSwipeLeft, onSwipeRight } from '@/shared/utils/mobile/touchHandlers';

// Attach swipe listeners
const cleanup = createSwipeHandler(element, {
  onSwipeLeft: () => goToNextSlide(),
  onSwipeRight: () => goToPreviousSlide(),
  threshold: 50,  // minimum swipe distance in px
});

// Call cleanup() to remove listeners
```

### `utils/mobile/performance.ts`

```typescript
import { getNetworkQuality, getAdaptiveImageSize } from '@/shared/utils/mobile/performance';

getNetworkQuality()                    // 'fast' | 'medium' | 'slow' | 'offline'
getAdaptiveImageSize(containerWidth)   // optimal image size in px
```

---

## Hooks

### `useDebounce`

```typescript
import { useDebounce } from '@/shared/hooks/useDebounce';

const debouncedSearch = useDebounce(searchQuery, 300);
```

### `useMediaQuery`

```typescript
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

const isMobile = useMediaQuery('(max-width: 768px)');
const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
```

### `useLocalStorage`

```typescript
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';

const [theme, setTheme] = useLocalStorage('theme', 'dark');
```

---

## Adding New Shared Modules

Before adding something to this directory, ask:

1. Is it used by **2+ features**? (If not, keep it in the feature)
2. Is it **stable**? (Frequently changing code in shared slows down all features)
3. Does it have **tests**? (Shared code is higher-risk — unit tests required)
4. Is there a **clearly documented API**? (Other teams will use this)

If all four are true, add it here and document it in this README.
