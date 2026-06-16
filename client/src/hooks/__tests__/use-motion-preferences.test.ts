
import { renderHook } from '@testing-library/react';
import { useMotionPreferences } from '../use-motion-preferences';
import { useIsMobile } from '../use-is-mobile';

vi.mock('../use-is-mobile', () => ({
  useIsMobile: vi.fn(),
}));

describe('useMotionPreferences', () => {
  const mockMatchMedia = (matches: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
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

  it('should detect mobile devices (< 768px)', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    mockMatchMedia(false);
    const { result } = renderHook(() => useMotionPreferences());
    expect(result.current.isMobile).toBe(true);
    expect(result.current.shouldSimplifyAnimations).toBe(true);
    expect(result.current.shouldDisable3D).toBe(true);
  });

  it('should detect desktop devices (>= 768px)', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    mockMatchMedia(false);
    const { result } = renderHook(() => useMotionPreferences());
    expect(result.current.isMobile).toBe(false);
  });

  it('should detect prefers-reduced-motion', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    mockMatchMedia(true);
    const { result } = renderHook(() => useMotionPreferences());
    expect(result.current.prefersReducedMotion).toBe(true);
    expect(result.current.shouldSimplifyAnimations).toBe(true);
  });

  it('should not simplify animations on desktop with motion enabled', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    mockMatchMedia(false);
    const { result } = renderHook(() => useMotionPreferences());
    expect(result.current.isMobile).toBe(false);
    expect(result.current.prefersReducedMotion).toBe(false);
    expect(result.current.shouldSimplifyAnimations).toBe(false);
  });

  it('should simplify animations when either mobile OR reduced motion', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    mockMatchMedia(false);
    const { result: mobileResult } = renderHook(() => useMotionPreferences());
    expect(mobileResult.current.shouldSimplifyAnimations).toBe(true);

    vi.mocked(useIsMobile).mockReturnValue(false);
    mockMatchMedia(true);
    const { result: reducedMotionResult } = renderHook(() => useMotionPreferences());
    expect(reducedMotionResult.current.shouldSimplifyAnimations).toBe(true);
  });
});
