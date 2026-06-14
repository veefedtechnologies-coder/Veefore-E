# Landing Page Components

This directory contains reusable components for the landing page feature.

## FeatureCard

A reusable component for displaying individual feature showcases with device mockups and animated content.

### Overview

The FeatureCard component was extracted from `StickyScrollFeaturesV2.tsx` as part of the codebase refactoring initiative (Task 14.1). It provides a modular way to display features with:

- Multiple screen types (analysis, chat, sales, calendar)
- Device variants (iPhone, Laptop, Auto-responsive)
- Color theming (blue, purple, green)
- Animated content transitions

### Usage

```tsx
import { FeatureCard, type Feature } from '@/features/landing/components/FeatureCard';
import { Search } from 'lucide-react';

const feature: Feature = {
  title: "Feature Title",
  description: "Feature description text",
  highlight: "Status Badge Text",
  icon: Search,
  color: "blue",
  screen: {
    type: "analysis",
    title: "Screen Title",
    stats: [
      { label: "Metric 1", value: "Value 1", color: "text-blue-400" }
    ],
    points: ["Point 1", "Point 2", "Point 3"]
  }
};

// Default (auto-responsive)
<FeatureCard feature={feature} />

// Phone variant
<FeatureCard feature={feature} variant="phone" />

// Laptop variant
<FeatureCard feature={feature} variant="laptop" />

// With custom className
<FeatureCard feature={feature} className="custom-class" />
```

### Props

#### FeatureCardProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `feature` | `Feature` | required | Feature data object containing all display information |
| `variant` | `'phone' \| 'laptop' \| 'auto'` | `'auto'` | Device mockup variant to display |
| `className` | `string` | `''` | Additional CSS classes to apply |

#### Feature Interface

```typescript
interface Feature {
  title: string;
  description: string;
  highlight: string;
  icon: LucideIcon;
  color: 'blue' | 'purple' | 'green';
  screen: ScreenConfig;
}
```

#### Screen Types

**Analysis Screen:**
```typescript
{
  type: 'analysis',
  title?: string,
  stats?: Array<{ label: string; value: string; color: string }>,
  points?: string[]
}
```

**Chat Screen:**
```typescript
{
  type: 'chat',
  messages?: Array<{ user: string; text: string; time: string }>
}
```

**Sales Screen:**
```typescript
{
  type: 'sales',
  title?: string,
  steps?: Array<{ text: string; status: 'complete' | 'active' }>
}
```

**Calendar Screen:**
```typescript
{
  type: 'calendar',
  title?: string,
  schedule?: {
    date: string;
    time: string;
    postTitle: string;
    peak: boolean;
  }
}
```

### Color Themes

The component supports three color themes:

- **blue**: Blue/cyan gradient with blue accents
- **purple**: Purple/pink gradient with purple accents
- **green**: Green/emerald gradient with green accents

Each theme includes:
- Background colors
- Border colors
- Text colors
- Gradient configurations
- Shadow effects
- Orb animations

### Variants

#### Auto (default)
Responsive behavior that shows laptop mockup on desktop and phone mockup on mobile devices.

#### Phone
Always shows iPhone mockup regardless of screen size. Optimized for mobile presentation.

#### Laptop
Always shows laptop mockup regardless of screen size. Best for desktop-focused displays.

### Animation Features

The component includes several built-in animations:

- **Analysis Screen**: Scanning laser animation across video preview
- **Sales Screen**: Pulsing status indicators for active steps
- **Calendar Screen**: Pulsing peak activity indicator
- **All Screens**: Smooth content transitions and hover effects

### Accessibility

- Semantic HTML structure
- Proper heading hierarchy
- Icon labels for screen readers
- Keyboard navigation support (inherited from mockup components)
- Respects `prefers-reduced-motion` (via animation-performance utils)

### Performance Optimizations

- Components are memoized with `React.memo()`
- GPU-accelerated animations using `transform3d`
- Optimized rendering with `contain` CSS property
- Responsive scaling without layout shifts

### Dependencies

- `framer-motion`: Animation library
- `lucide-react`: Icon library
- `IphoneMockup`: UI component from `@/components/ui/iphone-mockup`
- `GPU_ACCELERATED_STYLES`: Performance utilities from `@/lib/animation-performance`

### Exports

```typescript
// Main component
export const FeatureCard: React.FC<FeatureCardProps>;

// Sub-components (for advanced usage)
export const IPhoneScreen: React.FC<{ feature: Feature }>;
export const LaptopScreen: React.FC<{ feature: Feature }>;

// Types
export type { Feature, ColorKey, FeatureCardProps };

// Color configuration
export const colorMap: Record<ColorKey, ColorConfig>;
```

### Testing

The component includes comprehensive unit tests covering:

- Color theme validation
- Feature interface type checking
- Data structure validation for all screen types
- Props and variant behavior

Run tests:
```bash
npm test -- client/src/features/landing/components/__tests__/FeatureCard.test.tsx
```

### Examples

#### Analysis Feature
```tsx
<FeatureCard
  feature={{
    title: "Video Analysis",
    description: "Break down competitor videos frame by frame",
    highlight: "Analysis Active",
    icon: Search,
    color: "blue",
    screen: {
      type: "analysis",
      title: "Video Breakdown",
      stats: [
        { label: "Pacing Speed", value: "Fast (1.2s)", color: "text-blue-400" }
      ],
      points: ["Hook at 0:02", "Text overlay sync", "CTA at 80%"]
    }
  }}
/>
```

#### Chat Feature
```tsx
<FeatureCard
  feature={{
    title: "Auto-Reply",
    description: "Reply to fans automatically",
    highlight: "Replies Active",
    icon: MessageSquare,
    color: "purple",
    screen: {
      type: "chat",
      messages: [
        { user: "fan", text: "Love this!", time: "2m" },
        { user: "me", text: "Thank you! 🙏", time: "Just now" }
      ]
    }
  }}
/>
```

### Related Components

- **StickyScrollFeaturesV2**: Parent component using FeatureCard
- **IphoneMockup**: Device mockup component
- **LaptopScreen**: Laptop mockup renderer
- **ScrollHint**: Scroll indicator component

### Requirements

**Validates: Requirements 22.1** - Landing Page Animation Component Optimization

This component supports:
- Individual feature card animations with separation from parent component
- Support for image, icon, title, description, and CTA props
- Animation variants for scroll-triggered effects
- Responsive device mockups (phone/laptop)
- Performance-optimized rendering

### Migration Notes

When refactoring existing code to use FeatureCard:

1. Import the component and types:
   ```tsx
   import { FeatureCard, type Feature } from '@/features/landing/components/FeatureCard';
   ```

2. Convert feature data to the Feature interface structure

3. Replace inline screen rendering with:
   ```tsx
   <FeatureCard feature={featureData} variant="auto" />
   ```

4. Import colorMap if you need to reference colors elsewhere:
   ```tsx
   import { colorMap } from '@/features/landing/components/FeatureCard';
   ```

### File Location

```
/client/src/features/landing/components/
├── FeatureCard.tsx           # Main component (~600 lines)
├── __tests__/
│   └── FeatureCard.test.tsx  # Unit tests
└── README.md                  # This file
```

### Maintenance

When updating this component:

1. Run tests to ensure no regressions
2. Update TypeScript types if changing interfaces
3. Verify all four screen types still render correctly
4. Check responsive behavior on mobile and desktop
5. Test animations for performance
6. Update this README if API changes
