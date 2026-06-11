# TiltCard Component

## Overview

The `TiltCard` component implements a 3D tilt effect that responds to mouse movement, creating an engaging interactive experience. It uses Framer Motion for smooth animations with spring physics and automatically disables on mobile devices for optimal performance.

## Features

- ✅ **3D Tilt Effect**: Responds to mouse position with smooth rotateX and rotateY transforms
- ✅ **Spring Physics**: Uses spring configuration (stiffness: 200, damping: 25) for natural return to neutral
- ✅ **Mobile Optimization**: Automatically disabled on mobile devices (< 768px)
- ✅ **GPU Accelerated**: Uses transform and backfaceVisibility for optimal performance
- ✅ **Customizable**: Configurable tilt intensity, scale, and perspective
- ✅ **TypeScript**: Full type safety with TypeScript

## Requirements Validation

This component satisfies the following requirements from the Landing Page Sections Redesign spec:

- **Requirement 3.1**: 3D tilt transforms based on mouse position ✅
- **Requirement 3.2**: Smooth return to neutral position within 400ms using spring physics ✅
- **Requirement 4.4**: Disabled on mobile devices for performance ✅
- **Requirement 5.2**: GPU-accelerated transforms (opacity, transform only) ✅

## Installation

The component is already installed in the project. It depends on:

```json
{
  "framer-motion": "^12.23.12",
  "react": "^18.3.1"
}
```

## Basic Usage

```tsx
import TiltCard from './components/TiltCard';

function MyComponent() {
  return (
    <TiltCard>
      <div className="p-8 bg-white/[0.02] border border-white/10 rounded-2xl">
        <h3>Hover me!</h3>
        <p>This card tilts in 3D based on your mouse position.</p>
      </div>
    </TiltCard>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | Required | Content to display inside the tilt card |
| `className` | `string` | `''` | Additional CSS classes for the wrapper |
| `maxTilt` | `number` | `8` | Maximum tilt angle in degrees (positive number) |
| `scale` | `number` | `1.02` | Scale factor on hover |
| `perspective` | `number` | `1000` | CSS perspective value in pixels |
| `disableTilt` | `boolean` | `false` | Manually disable tilt effect |

## Examples

### Default Tilt Effect

```tsx
<TiltCard>
  <div className="card-content">
    Hover to see the default tilt effect
  </div>
</TiltCard>
```

### Subtle Tilt (Professional UI)

```tsx
<TiltCard maxTilt={4} scale={1.01}>
  <div className="card-content">
    Subtle tilt for professional interfaces
  </div>
</TiltCard>
```

### Strong Tilt (Bold Interactive)

```tsx
<TiltCard maxTilt={15} scale={1.05}>
  <div className="card-content">
    Strong tilt for bold, interactive designs
  </div>
</TiltCard>
```

### Feature Card (Real Use Case)

```tsx
<TiltCard className="w-full max-w-md">
  <div className="relative p-6 bg-white/[0.02] border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden">
    {/* Gradient overlay on hover */}
    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/5 opacity-0 hover:opacity-100 transition-opacity duration-500" />
    
    {/* Content */}
    <div className="relative z-10">
      <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-cyan-400" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">AI Caption Engine</h3>
      <p className="text-white/70 text-sm">
        Hook-aligned captions with CTA optimization
      </p>
    </div>
  </div>
</TiltCard>
```

### Disabled Tilt

```tsx
<TiltCard disableTilt>
  <div className="card-content">
    Tilt effect is disabled
  </div>
</TiltCard>
```

## Integration with GrowthEngineSection

The TiltCard component can replace the existing inline tilt implementation in `GrowthEngineSection.tsx`:

**Before:**
```tsx
const FeatureCard = ({ feature }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [5, -5]);
  const rotateY = useTransform(x, [-100, 100], [-5, 5]);

  const handleMouseMove = (event) => {
    // ... mouse position calculation
  };

  return (
    <motion.div style={{ rotateX, rotateY }}>
      {/* card content */}
    </motion.div>
  );
};
```

**After:**
```tsx
import TiltCard from './TiltCard';

const FeatureCard = ({ feature }) => {
  return (
    <TiltCard maxTilt={5}>
      {/* card content */}
    </TiltCard>
  );
};
```

## Performance

The component is optimized for performance:

1. **GPU Acceleration**: Uses `transform: translateZ(0)` and `backfaceVisibility: hidden`
2. **Mobile Detection**: Automatically disabled on devices < 768px width
3. **Spring Physics**: Smooth animations without janky frame drops
4. **Memoization**: Can be wrapped with `React.memo()` for optimal re-render performance

## Browser Support

- **Modern Browsers**: Full support with 3D transforms
- **Mobile Devices**: Gracefully degraded (tilt disabled, no error)
- **Older Browsers**: Falls back to no tilt effect

## Technical Details

### Animation System

The component uses Framer Motion's `useMotionValue`, `useTransform`, and `useSpring` hooks:

1. **useMotionValue**: Tracks mouse position (normalized 0-1)
2. **useTransform**: Converts mouse position to rotation angles (-maxTilt to +maxTilt)
3. **useSpring**: Applies spring physics for smooth return to neutral

### Spring Configuration

```typescript
{
  stiffness: 200,  // How quickly it returns to neutral
  damping: 25,     // How much oscillation/bounce
  mass: 1          // Weight of the animated element
}
```

This configuration creates a natural, smooth return that takes approximately 400ms.

### Calculation Logic

```
Mouse Position → Normalized (0-1) → Transform → Spring → Rotation

Example:
- Mouse at top-left: x=0, y=0 → rotateX=8°, rotateY=-8°
- Mouse at center: x=0.5, y=0.5 → rotateX=0°, rotateY=0°
- Mouse at bottom-right: x=1, y=1 → rotateX=-8°, rotateY=8°
```

## Testing

To test the component:

1. **Visual Test**: Open `TiltCard.example.tsx` in the browser
2. **Mobile Test**: Resize viewport to < 768px and verify tilt is disabled
3. **Performance Test**: Check animation stays at 60fps in Chrome DevTools
4. **Accessibility Test**: Verify reduced motion preference is respected

## Demo

See `TiltCard.example.tsx` for a comprehensive demo page with multiple examples.

## Credits

Created as part of the Landing Page Sections Redesign spec (Task 2.2).

## License

Part of the Veefore-E project.
