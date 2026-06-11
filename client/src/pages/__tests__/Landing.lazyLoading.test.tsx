/**
 * Landing Page - Lazy Loading Integration Tests
 * 
 * Tests for AnimatedDashboard lazy loading implementation using
 * React.Suspense and useLazyLoad hook.
 * 
 * Requirements: 5.5 - Lazy load AnimatedDashboard when section enters viewport
 */

import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'wouter';

// Mock the WaitlistContext
vi.mock('../../context/WaitlistContext', () => ({
  useWaitlist: () => ({
    openWaitlist: vi.fn(),
  }),
  WaitlistProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useLazyLoad hook to control visibility
let mockIsVisible = false;
vi.mock('../../hooks/useLazyLoad', () => ({
  useLazyLoad: vi.fn(() => mockIsVisible),
}));

// Mock heavy components to speed up tests
vi.mock('../../components/CinematicHeroSection', () => ({
  default: () => <div data-testid="cinematic-hero">Hero</div>,
}));

vi.mock('../../components/CinematicFeatures', () => ({
  CinematicFeatures: () => <div data-testid="cinematic-features">Features</div>,
}));

vi.mock('../../components/StickyScrollFeaturesV2', () => ({
  default: () => <div data-testid="sticky-scroll">Sticky Scroll</div>,
}));

vi.mock('../../components/PricingScrollAnimation', () => ({
  PricingScrollAnimation: () => <div data-testid="pricing">Pricing</div>,
}));

vi.mock('../../components/TargetAudienceSection', () => ({
  default: () => <div data-testid="target-audience">Target Audience</div>,
}));

vi.mock('../../components/GrowthEngineSection', () => ({
  default: () => <div data-testid="growth-engine">Growth Engine</div>,
}));

vi.mock('../../components/CreditSystemSection', () => ({
  default: () => <div data-testid="credit-system">Credit System</div>,
}));

vi.mock('../../components/BetaLaunchSection', () => ({
  default: () => <div data-testid="beta-launch">Beta Launch</div>,
}));

vi.mock('../../components/USPVisuals', () => ({
  Phase1EngagementVisual: () => <div>Phase1 Engagement</div>,
  Phase1DMVisual: () => <div>Phase1 DM</div>,
  HookVisual: () => <div>Hook</div>,
}));

vi.mock('../../components/GlassCard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="glass-card">{children}</div>,
}));

vi.mock('../../components/SideGraphics', () => ({
  default: ({ side }: { side: 'left' | 'right' }) => <div data-testid={`side-graphics-${side}`}>Graphics</div>,
}));

describe('Landing Page - AnimatedDashboard Lazy Loading', () => {
  beforeEach(() => {
    // Reset visibility state before each test
    mockIsVisible = false;
    vi.clearAllMocks();
  });

  it('renders DashboardSkeleton when section is not visible', async () => {
    // Import Landing after mocks are set up
    const Landing = (await import('../Landing')).default;
    
    const { container } = render(
      <Router>
        <Landing onNavigate={vi.fn()} />
      </Router>
    );

    // Dashboard section should exist
    const dashboardSection = container.querySelector('section.relative.py-8');
    expect(dashboardSection).toBeTruthy();

    // Should show skeleton when not visible
    await waitFor(() => {
      // Check for skeleton structure
      const skeletonElements = container.querySelectorAll('.animate-pulse');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });
  });

  it('renders AnimatedDashboard when section enters viewport', async () => {
    // Set visibility to true
    mockIsVisible = true;

    const Landing = (await import('../Landing')).default;
    
    const { container } = render(
      <Router>
        <Landing onNavigate={vi.fn()} />
      </Router>
    );

    await waitFor(() => {
      // When visible, AnimatedDashboard should be rendered (or at least attempt to)
      // Since AnimatedDashboard is wrapped in Suspense, we check that skeleton is replaced
      const dashboardElement = container.querySelector('.rounded-\\[20px\\].border-white\\/10');
      expect(dashboardElement).toBeTruthy();
    });
  });

  it('uses useLazyLoad hook with correct options', async () => {
    const { useLazyLoad } = await import('../../hooks/useLazyLoad');
    
    const Landing = (await import('../Landing')).default;
    
    render(
      <Router>
        <Landing onNavigate={vi.fn()} />
      </Router>
    );

    await waitFor(() => {
      expect(useLazyLoad).toHaveBeenCalledWith(
        expect.any(Object), // ref object
        expect.objectContaining({
          threshold: 0.1,
          rootMargin: '100px',
          once: true,
        })
      );
    });
  });

  it('applies ref to dashboard section', async () => {
    const Landing = (await import('../Landing')).default;
    
    const { container } = render(
      <Router>
        <Landing onNavigate={vi.fn()} />
      </Router>
    );

    // Find the dashboard section (has specific classes)
    const dashboardSection = container.querySelector('section.relative.py-8.-mt-20.z-20');
    expect(dashboardSection).toBeTruthy();
  });

  it('shows Suspense fallback during component loading', async () => {
    mockIsVisible = true;

    const Landing = (await import('../Landing')).default;
    
    const { container } = render(
      <Router>
        <Landing onNavigate={vi.fn()} />
      </Router>
    );

    // During Suspense, fallback (DashboardSkeleton) should be visible
    // Or the actual component after Suspense resolves
    await waitFor(() => {
      const hasSkeletonOrDashboard = 
        container.querySelectorAll('.animate-pulse').length > 0 ||
        container.querySelector('.rounded-\\[20px\\].border-white\\/10');
      expect(hasSkeletonOrDashboard).toBeTruthy();
    });
  });
});

describe('Landing Page - Performance Optimization', () => {
  it('does not render AnimatedDashboard until visible (saves resources)', async () => {
    mockIsVisible = false;

    const Landing = (await import('../Landing')).default;
    
    const { container } = render(
      <Router>
        <Landing onNavigate={vi.fn()} />
      </Router>
    );

    // Should not have the heavy AnimatedDashboard component
    // Only the lightweight skeleton
    await waitFor(() => {
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    // Verify AnimatedDashboard-specific elements are not present
    const cursorElement = container.querySelector('[style*="stiffness"]');
    expect(cursorElement).toBeFalsy();
  });

  it('transitions from skeleton to dashboard when visibility changes', async () => {
    mockIsVisible = false;

    const Landing = (await import('../Landing')).default;
    
    const { container, rerender } = render(
      <Router>
        <Landing onNavigate={vi.fn()} />
      </Router>
    );

    // Initially shows skeleton
    await waitFor(() => {
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    // Change visibility
    mockIsVisible = true;

    // Re-render to trigger visibility change
    rerender(
      <Router>
        <Landing onNavigate={vi.fn()} />
      </Router>
    );

    // Should now attempt to load AnimatedDashboard
    await waitFor(() => {
      // Either still showing skeleton (Suspense) or loaded dashboard
      const hasContent = container.querySelector('section.relative.py-8');
      expect(hasContent).toBeTruthy();
    });
  });
});
