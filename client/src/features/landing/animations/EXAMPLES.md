# Animation Variants - Usage Examples

## Basic Animations

### Fade In Effect
```tsx
import { motion } from 'framer-motion'
import { fadeIn } from './animations'

const MyComponent = () => (
  <motion.div
    variants={fadeIn}
    initial="hidden"
    animate="visible"
  >
    Content fades in smoothly
  </motion.div>
)
```

### Slide Up Animation
```tsx
import { motion } from 'framer-motion'
import { slideUp } from './animations'

const Card = () => (
  <motion.div
    variants={slideUp}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true }}
  >
    Card slides up when scrolled into view
  </motion.div>
)
```

## Card Animations

### Feature Card with Hover
```tsx
import { motion } from 'framer-motion'
import { featureCard } from './animations'

const FeatureCard = ({ icon, title, description }) => (
  <motion.div
    className="p-6 bg-white rounded-lg shadow"
    variants={featureCard}
    initial="hidden"
    whileInView="visible"
    whileHover="hover"
    whileTap="tap"
    viewport={{ once: true }}
  >
    <div className="text-4xl mb-4">{icon}</div>
    <h3 className="text-xl font-bold mb-2">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </motion.div>
)
```

### Pricing Card
```tsx
import { motion } from 'framer-motion'
import { pricingCard } from './animations'

const PricingCard = ({ plan, price, features }) => (
  <motion.div
    className="p-8 border rounded-xl"
    variants={pricingCard}
    initial="hidden"
    whileInView="visible"
    whileHover="hover"
    viewport={{ once: true }}
  >
    <h3 className="text-2xl font-bold">{plan}</h3>
    <div className="text-4xl font-bold my-4">${price}</div>
    <ul>
      {features.map(feature => (
        <li key={feature}>{feature}</li>
      ))}
    </ul>
  </motion.div>
)
```

## Section Animations with Stagger

### Hero Section
```tsx
import { motion } from 'framer-motion'
import { heroSection, slideUp } from './animations'

const HeroSection = () => (
  <motion.section
    variants={heroSection}
    initial="hidden"
    animate="visible"
  >
    <motion.h1 variants={slideUp}>
      Welcome to Our Product
    </motion.h1>
    <motion.p variants={slideUp}>
      Subheading appears after title
    </motion.p>
    <motion.button variants={slideUp}>
      Get Started
    </motion.button>
  </motion.section>
)
```

### Feature Grid with Stagger
```tsx
import { motion } from 'framer-motion'
import { featureGrid, featureCard } from './animations'

const FeaturesSection = ({ features }) => (
  <motion.div
    className="grid grid-cols-3 gap-6"
    variants={featureGrid}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true }}
  >
    {features.map(feature => (
      <motion.div
        key={feature.id}
        variants={featureCard}
      >
        <h3>{feature.title}</h3>
        <p>{feature.description}</p>
      </motion.div>
    ))}
  </motion.div>
)
```

## CTA Animations

### Primary CTA Button
```tsx
import { motion } from 'framer-motion'
import { primaryCTA } from './animations'

const CTAButton = () => (
  <motion.button
    className="px-8 py-4 bg-blue-600 text-white rounded-lg"
    variants={primaryCTA}
    initial="hidden"
    animate="visible"
    whileHover="hover"
    whileTap="tap"
  >
    Get Started Now
  </motion.button>
)
```

### Floating CTA
```tsx
import { motion } from 'framer-motion'
import { floatingCTA } from './animations'

const FloatingButton = () => (
  <motion.button
    className="fixed bottom-8 right-8 px-6 py-3 bg-blue-600 text-white rounded-full"
    variants={floatingCTA}
    initial="hidden"
    animate={["visible", "float"]}
    whileHover="hover"
  >
    Need Help?
  </motion.button>
)
```

## Using Preset Collections

### Card Presets
```tsx
import { motion } from 'framer-motion'
import { cardPresets } from './animations'

// Feature card
<motion.div variants={cardPresets.feature}>
  Feature content
</motion.div>

// Pricing card
<motion.div variants={cardPresets.pricing}>
  Pricing content
</motion.div>

// Testimonial card
<motion.div variants={cardPresets.testimonial}>
  Testimonial content
</motion.div>
```

### Section Presets
```tsx
import { motion } from 'framer-motion'
import { sectionPresets } from './animations'

// Hero section
<motion.section variants={sectionPresets.hero}>
  Hero content
</motion.section>

// Content section
<motion.section variants={sectionPresets.content}>
  Content
</motion.section>
```

### CTA Presets
```tsx
import { motion } from 'framer-motion'
import { ctaPresets } from './animations'

// Primary CTA
<motion.button variants={ctaPresets.primary}>
  Primary Action
</motion.button>

// Secondary CTA
<motion.button variants={ctaPresets.secondary}>
  Secondary Action
</motion.button>
```

## Custom Transitions

```tsx
import { motion } from 'framer-motion'
import { springTransition, fastSpringTransition } from './animations'

// Using standard spring
<motion.div
  animate={{ x: 100 }}
  transition={springTransition}
>
  Smooth movement
</motion.div>

// Using fast spring
<motion.div
  animate={{ scale: 1.2 }}
  transition={fastSpringTransition}
>
  Quick response
</motion.div>
```

## Combining Variants

```tsx
import { motion } from 'framer-motion'
import { slideUp } from './animations'

// Override specific properties
<motion.div
  variants={slideUp}
  initial="hidden"
  animate="visible"
  custom={{ delay: 0.5 }}
  style={{ color: 'blue' }}
>
  Custom styled animation
</motion.div>
```
