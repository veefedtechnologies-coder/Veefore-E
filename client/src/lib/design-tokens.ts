/**
 * Design Tokens - Landing Page Sections Redesign
 * 
 * Centralized design system tokens matching the hero section's visual language.
 * All colors, typography, spacing, and border radius values are defined here
 * to ensure consistency across Live Dashboard and How It Works sections.
 */

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const colors = {
  // Primary gradient colors (matching hero section)
  gradients: {
    blue: '#60a5fa',      // Tailwind blue-400
    indigo: '#818cf8',    // Tailwind indigo-400
    purple: '#a78bfa',    // Tailwind purple-400
    cyan: '#22d3ee',      // Tailwind cyan-400
  },

  // Border colors
  borders: {
    subtle: 'rgba(255, 255, 255, 0.10)',  // border-white/10
    medium: 'rgba(255, 255, 255, 0.20)',  // border-white/20
    hover: 'rgba(255, 255, 255, 0.30)',   // border-white/30
  },

  // Background colors
  backgrounds: {
    primary: '#030303',
    secondary: '#0a0a0a',
    tertiary: '#0f0f0f',
    glass: 'rgba(255, 255, 255, 0.02)',       // bg-white/[0.02]
    glassMedium: 'rgba(255, 255, 255, 0.06)', // bg-white/[0.06]
    darkGlass: 'rgba(0, 0, 0, 0.40)',         // bg-black/40
    blur: 'rgba(0, 0, 0, 0.60)',              // bg-black/60
  },

  // Text colors
  text: {
    primary: 'rgba(255, 255, 255, 1)',      // text-white
    secondary: 'rgba(255, 255, 255, 0.7)',  // text-white/70
    tertiary: 'rgba(255, 255, 255, 0.4)',   // text-white/40
    muted: 'rgba(255, 255, 255, 0.6)',      // text-white/60
  },

  // Visual effects
  effects: {
    noiseOpacity: 0.03,   // 3% noise texture overlay
    blurAmount: '3xl',    // blur-3xl for gradient orbs
    shadowGlow: 'rgba(59, 130, 246, 0.15)', // Blue shadow glow
  }
} as const;

// ============================================================================
// TYPOGRAPHY SCALE
// ============================================================================

export const typography = {
  // Heading styles
  headings: {
    h1: 'text-5xl md:text-7xl font-bold tracking-tight',
    h2: 'text-3xl md:text-5xl font-bold tracking-tight',
    h3: 'text-xl md:text-2xl font-bold',
    h4: 'text-lg md:text-xl font-bold',
    h5: 'text-base md:text-lg font-bold',
  },

  // Body text styles
  body: {
    large: 'text-lg text-white/70',
    base: 'text-base text-white/70',
    small: 'text-sm text-white/60',
    caption: 'text-xs text-white/40',
    tiny: 'text-[10px] sm:text-sm text-white/60', // Responsive small text
  },

  // Font weights
  weights: {
    bold: 'font-bold',
    semibold: 'font-semibold',
    medium: 'font-medium',
    normal: 'font-normal',
  },
} as const;

// ============================================================================
// SPACING SYSTEM
// ============================================================================

export const spacing = {
  // Section-level spacing
  section: {
    paddingY: 'py-24 md:py-32',
    paddingYSmall: 'py-12 md:py-24',
    paddingX: 'px-6 md:px-8',
  },

  // Container spacing
  container: {
    padding: 'px-6 md:px-8',
    maxWidth: 'max-w-7xl',
  },

  // Card spacing
  card: {
    padding: 'p-6 md:p-8',
    paddingSmall: 'p-4 md:p-6',
  },

  // Gap spacing
  gap: {
    small: 'gap-4',
    medium: 'gap-8',
    large: 'gap-12 lg:gap-24',
    extraLarge: 'gap-16 lg:gap-32',
  },

  // Responsive gap values
  responsive: {
    mobile: 'gap-8',
    tablet: 'gap-12',
    desktop: 'gap-24',
  },
} as const;

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const borderRadius = {
  card: 'rounded-2xl',      // 16px - Main card radius
  medium: 'rounded-xl',     // 12px - Medium elements
  button: 'rounded-xl',     // 12px - Buttons
  badge: 'rounded-full',    // Full circle - Badges and pills
  small: 'rounded-lg',      // 8px - Small elements
  dashboard: 'rounded-[20px]', // 20px - Dashboard specific
} as const;

// ============================================================================
// GLASS MORPHISM EFFECTS
// ============================================================================

export const glassMorphism = {
  // Standard glass effect
  standard: {
    background: 'bg-white/[0.02]',
    border: 'border border-white/10',
    backdrop: 'backdrop-blur-md',
  },

  // Enhanced glass effect
  enhanced: {
    background: 'bg-white/[0.06]',
    border: 'border border-white/10',
    backdrop: 'backdrop-blur-md',
  },

  // Dark glass effect
  dark: {
    background: 'bg-black/60',
    border: 'border border-white/10',
    backdrop: 'backdrop-blur-md',
  },

  // Full combination classes
  classes: {
    standard: 'bg-white/[0.02] border border-white/10 backdrop-blur-md',
    enhanced: 'bg-white/[0.06] border border-white/10 backdrop-blur-md',
    dark: 'bg-black/60 border border-white/10 backdrop-blur-md',
  },
} as const;

// ============================================================================
// SHADOW EFFECTS
// ============================================================================

export const shadows = {
  glow: 'shadow-[0_0_100px_rgba(59,130,246,0.15)]',
  glowPurple: 'shadow-[0_0_100px_rgba(167,139,250,0.15)]',
  glowCyan: 'shadow-[0_0_100px_rgba(34,211,238,0.15)]',
  card: 'shadow-xl',
  subtle: 'shadow-sm',
} as const;

// ============================================================================
// RESPONSIVE BREAKPOINTS
// ============================================================================

export const breakpoints = {
  mobile: {
    max: 640,
    class: 'sm',
    description: 'Mobile landscape and up',
  },
  tablet: {
    min: 640,
    max: 1024,
    class: 'md',
    description: 'Tablet and up',
  },
  desktop: {
    min: 1024,
    class: 'lg',
    description: 'Desktop and up',
  },
  wide: {
    min: 1280,
    class: 'xl',
    description: 'Wide desktop and up',
  },
  ultraWide: {
    min: 1536,
    class: '2xl',
    description: 'Ultra-wide desktop and up',
  },
} as const;

// ============================================================================
// COMPONENT-SPECIFIC SIZES
// ============================================================================

export const sizes = {
  // Center orb sizes (responsive)
  orb: {
    mobile: 56,   // 56x56px on mobile
    tablet: 72,   // 72x72px on tablet
    desktop: 96,  // 96x96px on desktop
    classes: 'w-14 h-14 md:w-20 md:h-20 lg:w-24 lg:h-24',
  },

  // Dashboard sizes
  dashboard: {
    baseWidth: 1200,  // Base width for scaling calculations
    baseHeight: 720,  // Base height for scaling calculations
  },

  // Icon sizes
  icon: {
    small: 'w-4 h-4',
    medium: 'w-5 h-5',
    large: 'w-6 h-6',
    extraLarge: 'w-8 h-8',
  },
} as const;

// ============================================================================
// Z-INDEX LAYERS
// ============================================================================

export const zIndex = {
  background: -10,
  content: 0,
  overlay: 10,
  modal: 50,
  tooltip: 100,
} as const;

// ============================================================================
// GRID PATTERNS
// ============================================================================

export const gridPattern = {
  size: 60, // 60px spacing
  color: 'rgba(255, 255, 255, 0.03)',
  mask: 'radial-gradient(circle at center, transparent 0%, black 100%)',
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ColorGradient = keyof typeof colors.gradients;
export type BorderType = keyof typeof colors.borders;
export type SpacingSize = keyof typeof spacing.gap;
export type HeadingLevel = keyof typeof typography.headings;
export type BreakpointName = keyof typeof breakpoints;
