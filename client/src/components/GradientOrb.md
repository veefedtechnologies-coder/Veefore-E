# GradientOrb Component

Ambient gradient lighting effect component for landing page sections.

## Features

- **GPU-accelerated transforms** (`translateZ(0)`) for optimal performance
- **Configurable color variants**: blue, purple, indigo, cyan (matching hero section palette)
- **Tailwind blur-3xl** effect for smooth gradient blending
- **Optimized** for use in LiveDashboardSection and GrowthEngineSection backgrounds

## Requirements

Implements requirements 8.1 and 8.5 from the landing page sections redesign spec.

## API

### Props

```typescript
interface GradientOrbProps {
    className?: string;
    color?: 'blue' | 'purple' | 'indigo' | 'cyan';
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Additional CSS classes for positioning and sizing |
| `color` | `'blue' \| 'purple' \| 'indigo' \| 'cyan'` | `'blue'` | Color variant matching hero section palette |

## Color Palette

- **blue**: `#60a5fa` (blue-400/40) - Primary blue from hero
- **purple**: `#a78bfa` (purple-400/40) - Purple accent from hero
- **indigo**: `#818cf8` (indigo-400/40) - Indigo from hero
- **cyan**: `#22d3ee` (cyan-400/40) - Cyan accent

## Usage Examples

### Basic Usage

```tsx
import GradientOrb from './components/GradientOrb';

// Default blue orb
<GradientOrb className="w-96 h-96 top-0 left-0" />
```

### Multiple Orbs Background

```tsx
import GradientOrb from './components/GradientOrb';

function LiveDashboardSection() {
  return (
    <section className="relative">
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <GradientOrb 
          color="blue" 
          className="w-[800px] h-[800px] -top-[100px] -left-[100px]" 
        />
        <GradientOrb 
          color="purple" 
          className="w-[600px] h-[600px] -top-[100px] -right-[100px]" 
        />
        <GradientOrb 
          color="indigo" 
          className="w-[500px] h-[500px] -bottom-[100px] -left-[100px]" 
        />
      </div>
      
      {/* Section content */}
      <div className="relative z-10">
        {/* Your content here */}
      </div>
    </section>
  );
}
```

### With Responsive Sizing

```tsx
<GradientOrb 
  color="cyan" 
  className="w-[300px] h-[300px] md:w-[600px] md:h-[600px] top-0 right-0" 
/>
```

## Performance Notes

The component uses GPU-accelerated properties for optimal performance:
- `transform: translateZ(0)` - Forces GPU acceleration
- `willChange: transform` - Hints the browser about upcoming transforms
- `backfaceVisibility: hidden` - Prevents flickering during transforms

## Testing

Unit tests are located in `GradientOrb.client.test.tsx` and cover:
- Component rendering
- All color variants
- GPU acceleration styles
- Class name merging
- Default props

Run tests with:
```bash
npx vitest run --config vitest.client.config.ts GradientOrb
```
