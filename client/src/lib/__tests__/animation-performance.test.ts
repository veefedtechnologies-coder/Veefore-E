import { 
  getMobileOptimizedAnimation, 
  getMobileSpringConfig, 
  getOptimizedAnimationProps,
  shouldReduceMotion 
} from '../animation-performance';

/**
 * Tests for animation performance utilities
 * Task 7.2: Mobile animation optimization
 * Requirements: 5.4, 6.4
 */

describe('animation-performance utilities', () => {
  // Mock matchMedia
  const mockMatchMedia = (matches: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  };

  describe('getMobileOptimizedAnimation', () => {
    it('should return minimal animations for reduced motion preference', () => {
      const config = getMobileOptimizedAnimation(false, true);

      expect(config.duration).toBe(0);
      expect(config.disable3D).toBe(true);
      expect(config.disableParallax).toBe(true);
    });

    it('should return simplified animations for mobile', () => {
      const config = getMobileOptimizedAnimation(true, false);

      expect(config.duration).toBe(0.5); // Reduced from 0.8s
      expect(config.disable3D).toBe(true);
      expect(config.disableParallax).toBe(true);
      expect(config.initial).toEqual({ opacity: 0 });
      expect(config.animate).toEqual({ opacity: 1 });
    });

    it('should return full animations for desktop', () => {
      const config = getMobileOptimizedAnimation(false, false);

      expect(config.duration).toBe(0.8);
      expect(config.disable3D).toBe(false);
      expect(config.disableParallax).toBe(false);
      expect(config.initial).toEqual({ opacity: 0, y: 20 });
      expect(config.animate).toEqual({ opacity: 1, y: 0 });
    });
  });

  describe('getMobileSpringConfig', () => {
    it('should use tween on mobile instead of spring', () => {
      const config = getMobileSpringConfig(true);

      expect(config.type).toBe('tween');
      expect(config.duration).toBe(0.3);
    });

    it('should use spring on desktop', () => {
      const config = getMobileSpringConfig(false);

      expect(config.type).toBe('spring');
      expect(config.stiffness).toBe(200);
      expect(config.damping).toBe(25);
    });
  });

  describe('getOptimizedAnimationProps', () => {
    beforeEach(() => {
      mockMatchMedia(false);
    });

    it('should return no animation for reduced motion', () => {
      mockMatchMedia(true);
      const props = getOptimizedAnimationProps(false);

      expect(props.initial).toEqual({});
      expect(props.animate).toEqual({});
      expect(props.transition.duration).toBe(0);
    });

    it('should return simplified animation for mobile', () => {
      const props = getOptimizedAnimationProps(true);

      expect(props.initial).toEqual({ opacity: 0 });
      expect(props.animate).toEqual({ opacity: 1 });
      expect(props.transition.duration).toBe(0.5);
    });

    it('should return full animation for desktop', () => {
      const props = getOptimizedAnimationProps(false);

      expect(props.initial).toEqual({ opacity: 0, y: 20 });
      expect(props.animate).toEqual({ opacity: 1, y: 0 });
      expect(props.transition.duration).toBe(0.8);
    });
  });

  describe('shouldReduceMotion', () => {
    it('should return true when prefers-reduced-motion is set', () => {
      mockMatchMedia(true);

      expect(shouldReduceMotion()).toBe(true);
    });

    it('should return false when prefers-reduced-motion is not set', () => {
      mockMatchMedia(false);

      expect(shouldReduceMotion()).toBe(false);
    });
  });
});
