# SideGraphics Component

## Overview
The `SideGraphics` component displays decorative metric cards on either the left or right side of the AnimatedDashboard section. These graphics provide visual context and engagement metrics while maintaining a clean, non-intrusive design.

## Requirements
- Task 4.2 of Landing Page Sections Redesign
- Requirements: 4.1, 8.4

## Features
- **Responsive Design**: Hidden on mobile (< 768px) and tablet (< 1024px) devices
- **Fade Effect**: Uses CSS mask-image with linear-gradient for smooth fade
- **Side Positioning**: Configurable for left or right side placement
- **Floating Metric Cards**: Displays engagement metrics with animations
- **Phase-aware Content**: Adapts content based on VITE_META_PHASE_1_REVIEW_MODE

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `side` | `'left' \| 'right'` | Yes | Determines which side to display the graphics |

## Usage

```tsx
import SideGraphics from '@/components/SideGraphics';

// In your component
<SideGraphics side="left" />
<SideGraphics side="right" />
```

## Implementation Details

### Left Side Graphics
- **Engagement Rate Card**: Shows +247% engagement rate with animated bar chart
- **Posts Scheduled / DM Responses Card**: Displays 1,847 items with 94% success rate

### Right Side Graphics
- **AI Hooks Generated Card**: Shows 3,291 hooks with trending tags
- **Growth Velocity Card**: Displays 12.4x growth multiplier

### Responsive Behavior
- **Desktop (≥ 1024px)**: Full display with 220px width
- **Tablet (≥ 768px, < 1024px)**: Hidden
- **Mobile (< 768px)**: Hidden

### Styling
- **Position**: Absolutely positioned with `inset-y-0` (top-1/2 and -translate-y-1/2)
- **Mask**: Linear gradient fade effect for smooth blending
- **Pointer Events**: Disabled (`pointer-events-none`) for decorative nature
- **Animations**: Framer Motion animations with staggered delays (0.3s, 0.4s)

## Integration
This component is used in the Landing page's Live Dashboard section alongside the `AnimatedDashboard` component:

```tsx
<motion.div className="relative w-full">
  <SideGraphics side="left" />
  <SideGraphics side="right" />
  <AnimatedDashboard />
</motion.div>
```

## Dependencies
- `framer-motion`: For animations
- `lucide-react`: For icons (TrendingUp, MessageSquare, Brain, Zap)
- `GlassCard`: Shared component for glass morphism styling

## Technical Notes
- Uses GPU-accelerated CSS transforms for smooth animations
- Implements mask-image for fade effect (with WebKit prefix for compatibility)
- Content adapts based on environment variable (Phase 1 vs Phase 2 content)
- Positioned absolutely to not affect layout flow
- Z-index set to 0 to stay behind main content

## Related Components
- `AnimatedDashboard`: Central dashboard component
- `GlassCard`: Provides glass morphism styling
- `GradientOrb`: Background decorative elements
