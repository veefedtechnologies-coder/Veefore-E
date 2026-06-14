# Landing Page Animation Variants

Reusable Framer Motion animation configurations for consistent animations across the landing page.

## Overview

This library provides pre-configured animation variants for common UI patterns:
- **Base Animations**: fadeIn, slideUp, scaleIn, etc.
- **Card Animations**: Feature cards, pricing cards, testimonials
- **Section Animations**: Hero sections, content sections, grids
- **CTA Animations**: Primary, secondary, and floating CTAs

## Usage

### Basic Example

```tsx
import { motion } from 'framer-motion'
import { fadeIn, slideUp } from '@/features/landing/animations'

export const MyComponent = () => {
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <h1>Hello World</h1>
    </motion.div>
  )
}
```

### Card with Hover Effect

```tsx
import { motion } from 'framer-motion'
import { featureCard } from '@/features/landing/animations'

export const FeatureCard = ({ title, description }) => {
  return (
    <motion.div
      variants={featureCard}
      initial="hidden"
      whileInView="visible"
      whileHover="hover"
      whileTap="tap"
      viewport={{ once: true }}
    >
      <h3>{title}</h3>
      <p>{description}</p>
    </motion.div>
  )
}
```

### Section with Staggered Children

```tsx
import { motion } from 'framer-motion'
import { contentSection, slideUp } from '@/features/landing/animations'

export const FeaturesSection = ({ features }) => {
  return (
    <motion.section
      variants={contentSection}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      {features.map((feature) => (
        <motion.div key={feature.id} variants={slideUp}>
          {feature.content}
        </motion.div>
      ))}
    </motion.section>
  )
}
```

### Using Preset Collections

```tsx
import { cardPresets, ctaPresets } from '@/features/landing/animations'

// Access specific presets
<motion.div variants={cardPresets.pricing}>
  <h3>Pro Plan</h3>
</motion.div>

<motion.button variants={ctaPresets.primary}>
  Get Started
</motion.button>
```

## Available Variants

### Base Animations
- `fadeIn` - Simple opacity fade
- `fadeInBlur` - Fade with blur effect
- `slideUp` - Slide up from below
- `slideDown` - Slide down from above
- `slideLeft` - Slide in from right
- `slideRight` - Slide in from left
- `scaleIn` - Scale up from small
- `scaleInPop` - Scale up with bounce

### Card Animations
- `featureCard` - Feature cards with hover lift
- `pricingCard` - Pricing cards with prominent hover
- `testimonialCard` - Testimonial cards with gentle float

### Section Animations
- `heroSection` - Hero section with staggered children
- `contentSection` - Content sections with stagger
- `featureGrid` - Grid layouts with stagger
- `pricingSection` - Pricing grids with stagger

### CTA Animations
- `primaryCTA` - Primary buttons with attention-grabbing effect
- `secondaryCTA` - Secondary buttons with subtle hover
- `floatingCTA` - CTAs with continuous floating animation

## Transition Configurations

Reusable transition objects for custom animations:

- `springTransition` - Standard smooth spring
- `fastSpringTransition` - Quick, snappy spring
- `gentleSpringTransition` - Subtle, elegant spring

```tsx
import { motion } from 'framer-motion'
import { springTransition } from '@/features/landing/animations'

<motion.div
  animate={{ x: 100 }}
  transition={springTransition}
>
  Custom animation
</motion.div>
```

## Best Practices

1. **Use `whileInView`** for scroll-triggered animations
2. **Add `viewport={{ once: true }}`** to prevent re-animation on scroll
3. **Combine variants** with custom properties as needed
4. **Respect accessibility** - animations automatically respect `prefers-reduced-motion`
5. **Use appropriate variants** for semantic correctness (cards use card variants, CTAs use CTA variants)

## Requirements

This library supports **Requirement 22.4**: Replace inline animation variants with a centralized animation library containing reusable animation presets.
