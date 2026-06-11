# ConnectionLine Component

## Overview

The `ConnectionLine` component renders an animated SVG line that connects feature cards to a center orb in the GrowthEngineSection. It features a shimmer effect that travels along the line, creating a dynamic "traveling light" animation.

## Features

- **Dashed Line Effect**: Uses `stroke-dasharray` for a dashed line pattern
- **Linear Gradient**: Implements a gradient with shimmer animation
- **Traveling Light Effect**: Animated gradient offset creates the illusion of light traveling along the line (2s infinite loop)
- **Dynamic Positioning**: Calculates line coordinates based on card and orb positions
- **Staggered Animation**: Supports animation delays for coordinated multi-line effects

## Props

```typescript
interface ConnectionLineProps {
  startPos: { x: number; y: number };  // Starting coordinates (feature card position)
  endPos: { x: number; y: number };    // Ending coordinates (center orb position)
  delay: number;                       // Animation delay in seconds for staggered effect
}
```

### Prop Details

- **`startPos`**: The starting point of the line, typically the center of a feature card
- **`endPos`**: The ending point of the line, typically the center of the central orb
- **`delay`**: Animation delay in seconds to create a staggered effect when multiple lines are rendered

## Usage

### Basic Usage

```tsx
import ConnectionLine from './components/ConnectionLine';

function FeatureSection() {
  return (
    <div className="relative">
      <ConnectionLine
        startPos={{ x: 100, y: 150 }}
        endPos={{ x: 400, y: 300 }}
        delay={0}
      />
    </div>
  );
}
```

### Multiple Lines with Staggered Animation

```tsx
import ConnectionLine from './components/ConnectionLine';

function GrowthEngineSection() {
  const connections = [
    { start: { x: 100, y: 150 }, end: { x: 400, y: 300 }, delay: 0 },
    { start: { x: 100, y: 450 }, end: { x: 400, y: 300 }, delay: 0.5 },
    { start: { x: 700, y: 150 }, end: { x: 400, y: 300 }, delay: 1.0 },
    { start: { x: 700, y: 450 }, end: { x: 400, y: 300 }, delay: 1.5 },
  ];

  return (
    <div className="relative">
      {connections.map((conn, i) => (
        <ConnectionLine
          key={i}
          startPos={conn.start}
          endPos={conn.end}
          delay={conn.delay}
        />
      ))}
    </div>
  );
}
```

### Integration with GrowthEngineSection

The component is designed to be integrated into the GrowthEngineSection to connect feature cards to the central intelligence orb:

```tsx
// Inside GrowthEngineSection
<div className="relative">
  {/* Feature cards positioned absolutely */}
  <FeatureCard position="top-left" />
  <FeatureCard position="top-right" />
  <FeatureCard position="bottom-left" />
  <FeatureCard position="bottom-right" />
  
  {/* Center orb */}
  <CenterOrb />
  
  {/* Connection lines */}
  <ConnectionLine 
    startPos={calculateCardCenter('top-left')}
    endPos={orbCenter}
    delay={0}
  />
  {/* More connection lines... */}
</div>
```

## Animation Details

### Shimmer Effect

The component uses SVG `<linearGradient>` with `<animate>` elements to create a traveling shimmer effect:

- **Duration**: 2 seconds per cycle
- **Repeat**: Infinite loop
- **Gradient**: Transparent → Indigo glow → Transparent
- **Movement**: Gradient animates from left to right along the line

### Color Scheme

- **Base Line**: `rgba(255, 255, 255, 0.05)` - Subtle white with 5% opacity
- **Shimmer Color**: `rgba(99, 102, 241, 0.6)` - Indigo-600 with 60% opacity
- **Stroke Width**: 2px
- **Dash Pattern**: 4px dash, 4px gap

## Technical Implementation

The component renders two overlapping SVG lines:

1. **Base Line**: Static dashed line with subtle white color
2. **Shimmer Line**: Animated dashed line with gradient stroke that creates the traveling light effect

### SVG Structure

```xml
<svg>
  <defs>
    <linearGradient id="shimmer-{delay}">
      <!-- Gradient stops with animated positions -->
    </linearGradient>
  </defs>
  
  <!-- Base static line -->
  <line ... stroke="rgba(255, 255, 255, 0.05)" />
  
  <!-- Animated shimmer line -->
  <line ... stroke="url(#shimmer-{delay})" />
</svg>
```

## Performance Considerations

- **GPU Acceleration**: SVG animations are hardware-accelerated in modern browsers
- **Pointer Events**: Set to `pointer-events-none` to avoid interfering with user interactions
- **Unique IDs**: Each gradient has a unique ID based on delay to avoid conflicts when rendering multiple lines
- **Absolute Positioning**: Uses absolute positioning with z-index: 0 to layer behind interactive elements

## Accessibility

- The component is purely decorative and does not convey essential information
- `pointer-events-none` ensures it doesn't interfere with keyboard navigation
- The lines enhance visual hierarchy but are not required for understanding the content

## Browser Support

- **Modern Browsers**: Full support in Chrome, Firefox, Safari, Edge (latest versions)
- **SVG Animations**: Supported in all modern browsers
- **Fallback**: If animations are not supported, the base line will still render

## Related Components

- **GrowthEngineSection**: Parent component that uses ConnectionLine to connect features
- **FeatureCard**: Feature cards that ConnectionLine connects to the center orb
- **CenterOrb**: The central intelligence orb that serves as the endpoint for all lines

## Requirements Validation

This component validates the following requirements from the design specification:

- **Requirement 8.6**: Background Visual Enhancement - Animated shimmer effects on connection lines
- **Requirement 10.4**: Micro-interactions Implementation - Traveling light effect using shimmer animation

## Testing

The component includes comprehensive unit tests covering:

- SVG element rendering
- Line coordinate accuracy
- Gradient creation and animation
- Stroke properties (width, dash pattern, linecap)
- Animation timing and delays
- Color scheme validation

Run tests with:
```bash
npm run test -- --config vitest.client.config.ts ConnectionLine
```

## Future Enhancements

Potential improvements for future iterations:

1. **Customizable Colors**: Accept color props for different themes
2. **Animation Speed**: Configurable animation duration
3. **Curved Lines**: Option for bezier curves instead of straight lines
4. **Glow Effect**: Add blur filter for enhanced glow around shimmer
5. **Responsive Scaling**: Adjust line width and dash pattern based on viewport size
6. **Interactive State**: Pulse or change color when parent feature is hovered
