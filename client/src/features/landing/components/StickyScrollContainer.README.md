# StickyScrollContainer Component

A reusable container component that implements sticky scroll behavior with smooth transitions between feature cards. Extracted from `StickyScrollFeaturesV2.tsx` as part of the codebase refactoring effort.

## Overview

**File**: `/client/src/features/landing/components/StickyScrollContainer.tsx`  
**Lines**: ~509 lines  
**Requirements**: 22.1, 22.5  
**Task**: 14.2 - Extract StickyScrollContainer component

## Features

- ✅ **Sticky Scroll Behavior**: Container stays fixed while content scrolls
- ✅ **IntersectionObserver Integration**: Triggers animations when entering viewport
- ✅ **Smooth Transitions**: Rate-limited sequential transitions between sections
- ✅ **Scroll Progress Tracking**: Uses Framer Motion's useScroll for accurate progress
- ✅ **Sequential Transitions**: Forces UI to visit each step even on fast scrolls
- ✅ **Customizable Configuration**: Highly configurable behavior through props
- ✅ **GPU-Accelerated Animations**: Optimized for 60 FPS performance
- ✅ **Mobile-Optimized**: Responsive design with mobile-specific adjustments
- ✅ **Accessibility**: Respects reduced motion preferences
- ✅ **TypeScript**: Fully typed with comprehensive interfaces

## Architecture

The component follows a **render props pattern** to provide maximum flexibility:

```tsx
<StickyScrollContainer
  items={dataArray}
  renderContent={(props) => <ContentComponent {...props} />}
  renderVisual={(props) => <VisualComponent {...props} />}
  renderAmbient={(props) => <AmbientComponent {...props} />}
  renderProgress={(activeIndex, total) => <ProgressComponent />}
/>
```

### Core Hooks

#### `useStickyScroll`
Internal hook that manages:
- Scroll progress tracking via `useScroll`
- Active index calculation via `useTransform`
- Rate-limited sequential transitions
- IntersectionObserver for viewport detection

#### `useAmbientGlow` (Exported)
Helper hook for creating ambient glow effects that fade in/out based on scroll progress.

## Props API

### `StickyScrollContainerProps<T>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `items` | `T[]` | Yes | Array of items to display |
| `renderContent` | `(props: RenderItemProps<T>) => ReactNode` | Yes | Render function for content (left side) |
| `renderVisual` | `(props: RenderItemProps<T>) => ReactNode` | Yes | Render function for visual (right side) |
| `renderAmbient` | `(props: RenderItemProps<T>) => ReactNode` | No | Render function for ambient effects |
| `renderProgress` | `(activeIndex: number, total: number) => ReactNode` | No | Custom progress indicator |
| `config` | `StickyScrollConfig` | No | Configuration options |
| `className` | `string` | No | Additional CSS classes |
| `onActiveChange` | `(index: number) => void` | No | Callback when active item changes |

### `RenderItemProps<T>`

Props passed to render functions:

```typescript
interface RenderItemProps<T> {
  item: T;              // The current item data
  index: number;        // Item index in array
  isActive: boolean;    // Is this item currently active?
  isPast: boolean;      // Has this item already been passed?
  isUpcoming: boolean;  // Is this item still upcoming?
  progress: MotionValue<number>; // Scroll progress (0-1)
}
```

### `StickyScrollConfig`

Configuration options:

```typescript
interface StickyScrollConfig {
  heightMultiplier?: number;        // Default: 4 (400vh)
  transitionDelay?: number;         // Default: 600ms
  sequentialTransitions?: boolean;  // Default: true
  useIntersectionObserver?: boolean; // Default: true
  intersectionThreshold?: number;   // Default: 0.1
  snapStrength?: number;            // Default: 0.25 (not implemented)
  showProgress?: boolean;           // Default: true
}
```

## Usage Examples

### Basic Usage

```tsx
import { StickyScrollContainer } from '@/features/landing/components/StickyScrollContainer';

interface Feature {
  id: string;
  title: string;
  description: string;
}

const features: Feature[] = [
  { id: '1', title: 'Feature 1', description: 'Description 1' },
  { id: '2', title: 'Feature 2', description: 'Description 2' },
  { id: '3', title: 'Feature 3', description: 'Description 3' },
];

function FeaturesSection() {
  return (
    <StickyScrollContainer
      items={features}
      renderContent={({ item, isActive }) => (
        <div className={isActive ? 'opacity-100' : 'opacity-0'}>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
        </div>
      )}
      renderVisual={({ item, isActive }) => (
        <div className={isActive ? 'scale-100' : 'scale-95'}>
          <img src={`/images/${item.id}.jpg`} alt={item.title} />
        </div>
      )}
    />
  );
}
```

### With Custom Progress Indicator

```tsx
function FeaturesWithCustomProgress() {
  return (
    <StickyScrollContainer
      items={features}
      renderContent={renderContent}
      renderVisual={renderVisual}
      renderProgress={(activeIndex, total) => (
        <div className="flex space-x-2">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                i === activeIndex ? 'bg-blue-500' : 'bg-gray-500'
              }`}
            />
          ))}
        </div>
      )}
    />
  );
}
```

### With Ambient Effects

```tsx
import { useAmbientGlow } from '@/features/landing/components/StickyScrollContainer';

function FeaturesWithAmbient() {
  return (
    <StickyScrollContainer
      items={features}
      renderContent={renderContent}
      renderVisual={renderVisual}
      renderAmbient={({ index, progress }) => {
        const opacity = useAmbientGlow(index, progress, features.length);
        
        return (
          <motion.div
            style={{ opacity }}
            className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 blur-3xl"
          />
        );
      }}
    />
  );
}
```

### With Custom Configuration

```tsx
function CustomizedFeatures() {
  return (
    <StickyScrollContainer
      items={features}
      renderContent={renderContent}
      renderVisual={renderVisual}
      config={{
        heightMultiplier: 5,        // 500vh total scroll height
        transitionDelay: 800,       // 800ms between transitions
        sequentialTransitions: true, // Force sequential visits
        showProgress: true,         // Show progress indicators
        useIntersectionObserver: true, // Enable viewport detection
        intersectionThreshold: 0.2, // 20% visibility threshold
      }}
      onActiveChange={(index) => {
        console.log('Active feature changed to:', index);
      }}
    />
  );
}
```

## Component Structure

```
StickyScrollContainer/
├── Main Container (section)
│   ├── Background Gradient
│   └── Sticky Wrapper (sticky top-0)
│       ├── Progress Indicators (top-left)
│       ├── Content Area (left 45%)
│       │   └── ContentSlide × N (animated)
│       ├── Visual Area (right 55%)
│       │   └── VisualSlide × N (animated)
│       └── Ambient Effects (overlay)
│           └── Custom ambient × N
```

## Animation Behavior

### Content Slides
- **Active**: `y: 0, opacity: 1`
- **Past**: `y: -40, opacity: 0` (slides up and fades out)
- **Upcoming**: `y: 40, opacity: 0` (slides down and fades in)

### Visual Slides
- **Active**: `y: 0, scale: 1, opacity: 1`
- **Past**: `y: -window.innerHeight * 1.2, scale: 0.85` (slides up off-screen)
- **Upcoming**: `y: window.innerHeight * 1.2, scale: 0.85` (slides up from below)

### Transitions
- Spring animation with `stiffness: 120, damping: 25, mass: 1`
- Rate-limited to prevent jarring rapid transitions
- Sequential mode forces visiting each index in order

## Performance Optimizations

1. **GPU Acceleration**: Uses `transform` and `opacity` for animations
2. **Containment**: `contain: 'layout paint style'` on animated elements
3. **Backface Visibility**: Hidden to prevent rendering artifacts
4. **Memoization**: `memo()` on slide components to prevent unnecessary re-renders
5. **Will-Change**: Conditionally applied only when element is active
6. **Mobile Optimization**: Reduced animation complexity on mobile devices

## Browser Support

- ✅ Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- ✅ Mobile browsers (iOS Safari 14+, Chrome Mobile 90+)
- ✅ Respects `prefers-reduced-motion` (via Framer Motion)

## Integration with Existing Code

This component was extracted from `StickyScrollFeaturesV2.tsx`. To migrate existing code:

1. Replace the monolithic component with `StickyScrollContainer`
2. Move feature-specific rendering logic into render props
3. Extract color/style logic into the render functions
4. Use `useAmbientGlow` for ambient background effects

### Before (StickyScrollFeaturesV2.tsx)
```tsx
function StickyScrollFeaturesV2() {
  // 784 lines of mixed concerns
  const [activeFeature, setActiveFeature] = useState(0);
  // ... scroll logic
  // ... animation logic
  // ... rendering logic
}
```

### After (Using StickyScrollContainer)
```tsx
function StickyScrollFeatures() {
  return (
    <StickyScrollContainer
      items={features}
      renderContent={({ item, isActive }) => (
        <FeatureContent feature={item} isActive={isActive} />
      )}
      renderVisual={({ item, isActive }) => (
        <FeatureVisual feature={item} isActive={isActive} />
      )}
    />
  );
}
```

## Testing

Basic structural tests are included in `__tests__/StickyScrollContainer.test.tsx`.

For comprehensive testing:
1. Test with different item counts (1, 3, 5+ items)
2. Test custom render functions
3. Test configuration options
4. Test onActiveChange callback
5. Integration test with real scroll behavior

## Future Enhancements

- [ ] Implement snap strength configuration
- [ ] Add keyboard navigation support
- [ ] Add touch/swipe gesture support on mobile
- [ ] Add scroll velocity detection for smoother transitions
- [ ] Add ability to jump to specific index programmatically
- [ ] Add support for horizontal scroll variant

## Related Files

- `/client/src/components/StickyScrollFeaturesV2.tsx` - Original implementation
- `/client/src/features/landing/hooks/useScrollAnimation.ts` - Scroll animation utilities
- `/client/src/lib/animation-performance.ts` - Performance optimization constants

## Contributing

When modifying this component:
1. Maintain backward compatibility with existing render props
2. Add comprehensive JSDoc comments for new features
3. Update this README with usage examples
4. Consider mobile performance impact
5. Test with different content types and sizes

## License

Part of the Veefore-E codebase.
