/**
 * Landing Page Components
 * 
 * Reusable components for the landing page feature.
 * Extracted from monolithic files as part of codebase refactoring.
 */

export { 
  FeatureCard,
  IPhoneScreen,
  LaptopScreen,
  colorMap,
  type Feature,
  type ColorKey,
  type FeatureCardProps
} from './FeatureCard';

export { VideoBackground } from './VideoBackground';
export { RotatingText } from './RotatingText';

export {
  StickyScrollContainer,
  useAmbientGlow,
  type StickyScrollContainerProps,
  type StickyScrollConfig,
  type RenderItemProps,
} from './StickyScrollContainer';

export {
  MysteryDateDigits,
  BentoBenefitsGrid,
  UrgencySection,
  SignupSection,
} from './BetaLaunchContent';
