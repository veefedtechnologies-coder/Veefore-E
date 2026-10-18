import { renderHook } from '@testing-library/react';
import { useMotionPreferences } from '../use-motion-preferences';

/**
 * Tests for useMotionPreferences hook
 * Task 7.2: Mobile animation optimization
 * Requirements: 5.4, 6.4
 */

describe('useMotionPreferences', () => {
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

  beforeEach(() => {
    // Reset window width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  it('should detect mobile devices (< 768px)', () => {
    // Set mobile width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    mockMatchMedia(false);

    const { result } = renderHook(() => useMotionPreferences());

    expect(result.current.isMobile).toBe(true);
    expect(result.current.shouldSimplifyAnimations).toBe(true);
    expect(result.current.shouldDisable3D).toBe(true);
  });

  it('should detect desktop devices (>= 768px)', () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useMotionPreferences());

    expect(result.current.isMobile).toBe(false);
  });

  it('should detect prefers-reduced-motion', () => {
    mockMatchMedia(true); // prefers-reduced-motion: reduce

    const { result } = renderHook(() => useMotionPreferences());

    expect(result.current.prefersReducedMotion).toBe(true);
    expect(result.current.shouldSimplifyAnimations).toBe(true);
    expect(result.current.shouldDisable3D).toBe(true);
    expect(result.current.shouldDisableHeavyEffects).toBe(true);
  });

  it('should not simplify animations on desktop with motion enabled', () => {
    mockMatchMedia(false); // prefers-reduced-motion: no-preference

    const { result } = renderHook(() => useMotionPreferences());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.prefersReducedMotion).toBe(false);
    expect(result.current.shouldSimplifyAnimations).toBe(false);
    expect(result.current.shouldDisable3D).toBe(false);
    expect(result.current.shouldDisableHeavyEffects).toBe(false);
  });

  it('should simplify animations when either mobile OR reduced motion', () => {
    // Test mobile only
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    mockMatchMedia(false);

    const { result: mobileResult } = renderHook(() => useMotionPreferences());
    expect(mobileResult.current.shouldSimplifyAnimations).toBe(true);

    // Test reduced motion only
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    mockMatchMedia(true);

    const { result: reducedMotionResult } = renderHook(() => useMotionPreferences());
    expect(reducedMotionResult.current.shouldSimplifyAnimations).toBe(true);
  });
});
