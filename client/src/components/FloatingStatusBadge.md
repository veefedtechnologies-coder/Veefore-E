# FloatingStatusBadge Component

## Overview

The `FloatingStatusBadge` component is a reusable UI element designed for the landing page sections redesign. It displays animated status indicators that float around the dashboard section, providing visual feedback about active features and system status.

## Features

- **Initial Animation**: Fades in with opacity 0→1 and translates from y: 20→0 over 800ms
- **Breathing Animation**: Continuous scale animation (1→1.02→1) with 3-second duration
- **Glass Morphism**: Modern styling with `backdrop-blur-md`, semi-transparent backgrounds, and subtle borders
- **Configurable**: Supports multiple color themes (blue, green, purple) and flexible positioning
- **Performance**: Uses GPU-accelerated animations via Framer Motion
- **Responsive**: Works across all device sizes

## Props

| Prop | Type | Description |
|------|------|-------------|
| `text` | `string` | The text content to display in the badge |
| `icon` | `LucideIcon` | A Lucide React icon component |
| `position` | `object` | Absolute positioning coordinates (top, bottom, left, right) |
| `color` | `'blue' \| 'green' \| 'purple'` | Color theme for the badge |
| `animationDelay` | `number` (optional) | Delay before animation starts (in seconds) |

## Usage

### Basic Example

```tsx
import FloatingStatusBadge from './components/FloatingStatusBadge';
import { Zap } from 'lucide-react';

<FloatingStatusBadge
  text="24/7 Automation Active"
  icon={Zap}
  position={{ bottom: '20px', right: '20px' }}
  color="blue"
/>
```

### With Animation Delay

```tsx
<FloatingStatusBadge
  text="AI is actively engaging"
  icon={CheckCircle}
  position={{ bottom: '20px', left: '20px' }}
  color="green"
  animationDelay={0.5}
/>
```

### Multiple Badges with Staggered Animation

```tsx
<div className="relative">
  <FloatingStatusBadge
    text="Smart Scheduler Active"
    icon={Clock}
    position={{ top: '20px', left: '20px' }}
    color="blue"
    animationDelay={0}
  />
  
  <FloatingStatusBadge
    text="AI Optimizing"
    icon={Sparkles}
    position={{ top: '20px', right: '20px' }}
    color="purple"
    animationDelay={0.3}
  />
</div>
```

## Color Themes

### Blue Theme
- Icon: `text-blue-400`
- Text: `text-blue-300`
- Gradient: `from-blue-500/20 to-indigo-500/20`
- Border: `border-blue-500/30`

### Green Theme
- Icon: `text-green-400`
- Text: `text-green-300`
- Gradient: `from-green-500/20 to-emerald-500/20`
- Border: `border-green-500/30`

### Purple Theme
- Icon: `text-purple-400`
- Text: `text-purple-300`
- Gradient: `from-purple-500/20 to-pink-500/20`
- Border: `border-purple-500/30`

## Animation Details

### Initial Animation
- **Duration**: 800ms
- **Easing**: Custom cubic-bezier [0.22, 1, 0.36, 1] (matches hero section)
- **Properties**: opacity (0→1), translateY (20px→0)

### Breathing Animation
- **Duration**: 3 seconds
- **Repeat**: Infinite
- **Easing**: easeInOut
- **Properties**: scale (1→1.02→1)

## Styling

The component uses:
- `bg-black/60` - Semi-transparent black background
- `backdrop-blur-md` - Medium backdrop blur for glass effect
- `border` with theme-specific color - Subtle border
- `rounded-full` - Fully rounded corners
- `px-3 py-2` - Comfortable padding
- `z-20` - Ensures proper layering above other content

## Requirements Met

This component satisfies the following requirements from the spec:
- **Requirement 7.5**: LiveDashboardSection floating status badges
- **Requirement 10.6**: Subtle breathing animation on floating badges

## Integration

This component is designed to be used in the Live Dashboard Section of the landing page, replacing the existing inline `motion.div` floating elements for better code organization and reusability.

## Dependencies

- React
- Framer Motion
- Lucide React (for icons)
- Tailwind CSS
