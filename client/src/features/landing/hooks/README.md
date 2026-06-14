# Landing Page Hooks

Custom React hooks for scroll-based animations and effects on the landing page.

## Hooks

### useScrollAnimation

Basic scroll animation hook that provides opacity, scale, and blur effects for hero sections.

```tsx
import { useScrollAnimation } from './useScrollAnimation'

const Hero = () => {
  const { scrollY, opacity, scale, filter } = useScrollAnimation()
  
  return (
    <motion.div style={{ opacity, scale, filter }}>
      {/* Hero content */}
    </motion.div>
  )
}
```

### useParallaxEffect

Advanced parallax hook with configurable speed, ranges, and mobile optimization.

#### Basic Usage

```tsx
import { useParallaxEffect } from './useParallaxEffect'

const ParallaxImage = () => {
  const parallax = useParallaxEffect({ speed: 0.5 })
  
  return (
    <motion.div ref={parallax.ref} style={{ y: parallax.y }}>
      <img src="/hero.jpg" alt="Hero" />
    </motion.div>
  )
}
```

#### Layered Parallax

```tsx
const LayeredBackground = () => {
  const back = useParallaxEffect({ speed: 0.3 })
  const mid = useParallaxEffect({ speed: 0.5 })
  const front = useParallaxEffect({ speed: 0.8 })
  
  return (
    <>
      <motion.div ref={back.ref} style={{ y: back.y }} className="layer-back" />
      <motion.div ref={mid.ref} style={{ y: mid.y }} className="layer-mid" />
      <motion.div ref={front.ref} style={{ y: front.y }} className="layer-front" />
    </>
  )
}
```

#### With Fade Effect

```tsx
const FadingHero = () => {
  const parallax = useParallaxEffect({
    speed: 0.6,
    fadeEnabled: true,
    opacityRange: [1, 0]
  })
  
  return (
    <motion.div 
      ref={parallax.ref} 
      style={{ y: parallax.y, opacity: parallax.opacity }}
    >
      {/* Content fades as user scrolls */}
    </motion.div>
  )
}
```

#### With Scale Effect

```tsx
const ScalingCard = () => {
  const parallax = useParallaxEffect({
    speed: 0.4,
    scaleEnabled: true,
    scaleRange: [1, 0.95]
  })
  
  return (
    <motion.div 
      ref={parallax.ref} 
      style={{ y: parallax.y, scale: parallax.scale }}
    >
      {/* Card shrinks slightly as user scrolls */}
    </motion.div>
  )
}
```

#### Using Presets

```tsx
import { useParallaxEffect, ParallaxPresets } from './useParallaxEffect'

// Background layer (slow movement)
const Background = () => {
  const parallax = useParallaxEffect(ParallaxPresets.background)
  return <motion.div ref={parallax.ref} style={{ y: parallax.y }} />
}

// Hero section (with fade)
const Hero = () => {
  const parallax = useParallaxEffect(ParallaxPresets.hero)
  return (
    <motion.div 
      ref={parallax.ref} 
      style={{ y: parallax.y, opacity: parallax.opacity }}
    />
  )
}

// Card element (subtle movement)
const Card = () => {
  const parallax = useParallaxEffect(ParallaxPresets.card)
  return <motion.div ref={parallax.ref} style={{ y: parallax.y }} />
}
```

### useElementParallax

Element-relative parallax that triggers based on the element's position in viewport.

```tsx
import { useElementParallax } from './useParallaxEffect'

const Card = () => {
  const parallax = useElementParallax({ speed: 0.3 })
  
  return (
    <motion.div ref={parallax.ref} style={{ y: parallax.y }}>
      {/* Parallax effect starts when card enters viewport */}
    </motion.div>
  )
}
```

## Configuration Options

### ParallaxConfig

```typescript
interface ParallaxConfig {
  speed?: number              // 0-1 for background, >1 for foreground (default: 0.5)
  enableOnMobile?: boolean    // Enable effects on mobile (default: false)
  scrollRange?: [number, number]  // Scroll range in pixels (default: [0, 1000])
  yRange?: [number, number]   // Output transform range (default: [-100, 100])
  fadeEnabled?: boolean       // Enable opacity fade (default: false)
  opacityRange?: [number, number]  // Opacity range (default: [1, 0])
  scaleEnabled?: boolean      // Enable scale transform (default: false)
  scaleRange?: [number, number]  // Scale range (default: [1, 0.9])
}
```

### Available Presets

- **`background`**: Slow background layer (speed: 0.3)
- **`midground`**: Medium-speed middle layer (speed: 0.5)
- **`foreground`**: Fast foreground layer (speed: 0.8)
- **`hero`**: Hero section with fade effect (speed: 0.6, fade enabled)
- **`floating`**: Floating element with scale (speed: 0.4, scale enabled)
- **`card`**: Subtle card parallax (speed: 0.2)

## Performance

### Mobile Optimization

By default, parallax effects are **disabled on mobile devices** (viewport width < 768px) to ensure smooth performance. You can override this with `enableOnMobile: true`.

```tsx
// Disabled on mobile (recommended)
const parallax = useParallaxEffect({ speed: 0.5 })

// Enabled on mobile (use sparingly)
const parallax = useParallaxEffect({ speed: 0.5, enableOnMobile: true })
```

### Best Practices

1. **Use lower speed values** (0.2-0.5) for better performance
2. **Limit the number of parallax elements** on a single page
3. **Avoid combining multiple effects** (fade + scale + parallax) on the same element
4. **Use `useElementParallax`** for content below the fold to reduce calculations
5. **Test on low-end devices** to ensure smooth 60 FPS animations

## Return Values

Both hooks return a `ParallaxValues` object:

```typescript
interface ParallaxValues {
  scrollY: MotionValue<number>     // Current scroll position
  y: MotionValue<number>           // Parallax Y transform value
  opacity: MotionValue<number>     // Opacity value (when fade enabled)
  scale: MotionValue<number>       // Scale value (when scale enabled)
  ref: RefObject<HTMLElement>      // Ref to attach to element
}
```

## Examples

### Complete Hero Section

```tsx
import { motion } from 'framer-motion'
import { useParallaxEffect, ParallaxPresets } from './useParallaxEffect'

const HeroSection = () => {
  const background = useParallaxEffect(ParallaxPresets.background)
  const content = useParallaxEffect(ParallaxPresets.hero)
  
  return (
    <section className="relative h-screen">
      {/* Background layer - moves slowly */}
      <motion.div
        ref={background.ref}
        style={{ y: background.y }}
        className="absolute inset-0 bg-cover"
        style={{ backgroundImage: 'url(/hero-bg.jpg)' }}
      />
      
      {/* Content layer - moves faster and fades */}
      <motion.div
        ref={content.ref}
        style={{ 
          y: content.y, 
          opacity: content.opacity 
        }}
        className="relative z-10"
      >
        <h1>Welcome to Veefore</h1>
        <p>AI-powered Instagram growth</p>
      </motion.div>
    </section>
  )
}
```

### Staggered Card Grid

```tsx
const CardGrid = () => {
  const card1 = useElementParallax({ speed: 0.2 })
  const card2 = useElementParallax({ speed: 0.3 })
  const card3 = useElementParallax({ speed: 0.25 })
  
  return (
    <div className="grid grid-cols-3 gap-8">
      <motion.div ref={card1.ref} style={{ y: card1.y }}>
        <Card />
      </motion.div>
      <motion.div ref={card2.ref} style={{ y: card2.y }}>
        <Card />
      </motion.div>
      <motion.div ref={card3.ref} style={{ y: card3.y }}>
        <Card />
      </motion.div>
    </div>
  )
}
```

## Requirements

Validates Requirement 21.2: Landing page animation logic separation and parallax effects.

## Dependencies

- `framer-motion` - For useScroll, useTransform, and MotionValue
- `react` - For useRef hook
