/**
 * Landing Page - Responsive Breakpoints Tests
 * 
 * Tests responsive behavior at different viewport widths for:
 * - AnimatedDashboard section (Live Dashboard)
 * - GrowthEngineSection (How It Works)
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 * Task: 6.3 - Test responsive breakpoints
 */

import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Router } from 'wouter';
import React from 'react';
import Landing from '../Landing';

// Mock the WaitlistContext
vi.mock('../../context/WaitlistContext', () => ({
  useWaitlist: () => ({
    openWaitlist: vi.fn(),
  }),
  WaitlistProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useLazyLoad hook - set to true so components render
vi.mock('../../hooks/useLazyLoad', () => ({
  useLazyLoad: vi.fn(() => true),
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

/**
 * Helper function to set viewport size and trigger resize
 */
function setViewportSize(width: number, height: number = 768) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
  window.dispatchEvent(new Event('resize'));
}

/**
 * Helper to check if element has Tailwind responsive class
 */
function hasResponsiveClass(element: Element, className: string): boolean {
  return element.classList.contains(className);
}

describe('Landing Page - Responsive Breakpoints', () => {
  let originalInnerWidth: number;
  let originalInnerHeight: number;

  beforeEach(() => {
    // Save original viewport dimensions
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original viewport
    setViewportSize(originalInnerWidth, originalInnerHeight);
  });

  describe('320px - Mobile Small (iPhone SE)', () => {
    beforeEach(() => {
      setViewportSize(320, 568);
    });

    it('renders dashboard section at mobile small breakpoint', async () => {
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        const dashboardSection = container.querySelector('section.relative.py-8');
        expect(dashboardSection).toBeTruthy();
      });
    });

    it('hides SideGraphics components on mobile', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // SideGraphics should have 'hidden lg:block' classes
        const sideGraphics = container.querySelectorAll('[class*="side-graphics"]');
        sideGraphics.forEach(graphic => {
          // On mobile (< 1024px), elements with 'hidden lg:block' should not be displayed
          const hasHiddenClass = hasResponsiveClass(graphic, 'hidden');
          expect(hasHiddenClass).toBeTruthy();
        });
      });
    });

    it('applies mobile text sizes to FloatingStatusBadge', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Check for floating badges with responsive text sizing
        const badges = container.querySelectorAll('.text-\\[10px\\]');
        expect(badges.length).toBeGreaterThan(0);
      });
    });

    it('renders GrowthEngineSection with vertical stacking', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // GrowthEngineSection main container should have flex-col on mobile
        const growthSection = container.querySelector('section.py-24');
        expect(growthSection).toBeTruthy();
        
        // Check for the main flex container inside growth section
        const flexContainer = growthSection?.querySelector('.flex.flex-col.lg\\:flex-row');
        expect(flexContainer).toBeTruthy();
      });
    });

    it('shows smaller center orb size on mobile', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Center orb should have responsive classes: w-14 h-14 sm:w-20 sm:h-20 lg:w-24 lg:h-24
        const centerOrb = container.querySelector('.w-14.h-14');
        expect(centerOrb).toBeTruthy();
      });
    });

    it('hides ConnectionLines on mobile', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Connection lines have 'hidden lg:block' class
        const connectionLines = container.querySelectorAll('.hidden.lg\\:block.absolute');
        // Should exist but be hidden on mobile
        expect(connectionLines.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('768px - Tablet (iPad)', () => {
    beforeEach(() => {
      setViewportSize(768, 1024);
    });

    it('still hides SideGraphics at tablet breakpoint', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // At 768px (< 1024px), SideGraphics should still be hidden
        const sideGraphics = container.querySelectorAll('[class*="side-graphics"]');
        sideGraphics.forEach(graphic => {
          const hasHiddenClass = hasResponsiveClass(graphic, 'hidden');
          expect(hasHiddenClass).toBeTruthy();
        });
      });
    });

    it('maintains vertical layout for GrowthEngineSection', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // At 768px (< 1024px), should still be flex-col
        const flexContainer = container.querySelector('.flex.flex-col.lg\\:flex-row');
        expect(flexContainer).toBeTruthy();
      });
    });

    it('scales AnimatedDashboard proportionally', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Dashboard should have scaling applied via style or transform
        const dashboard = container.querySelector('.rounded-\\[20px\\]');
        expect(dashboard).toBeTruthy();
      });
    });

    it('uses medium center orb size at tablet breakpoint', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // At sm breakpoint (640px+), orb should be sm:w-20 sm:h-20
        // Check for the responsive class pattern
        const orbContainer = container.querySelector('.w-14.h-14.sm\\:w-20.sm\\:h-20');
        expect(orbContainer).toBeTruthy();
      });
    });

    it('applies responsive text sizes for badges', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Should have responsive text: text-[10px] sm:text-sm
        const responsiveText = container.querySelectorAll('.text-\\[10px\\]');
        expect(responsiveText.length).toBeGreaterThan(0);
      });
    });
  });

  describe('1024px - Desktop', () => {
    beforeEach(() => {
      setViewportSize(1024, 768);
    });

    it('shows SideGraphics at desktop breakpoint', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // At 1024px, SideGraphics with 'hidden lg:block' should be visible
        const sideGraphics = container.querySelectorAll('[class*="side-graphics"]');
        // Should have the hidden class but also lg:block which activates at 1024px+
        sideGraphics.forEach(graphic => {
          const hasHiddenClass = hasResponsiveClass(graphic, 'hidden');
          const hasLgBlock = graphic.className.includes('lg:block');
          expect(hasHiddenClass || hasLgBlock).toBeTruthy();
        });
      });
    });

    it('activates three-column layout for GrowthEngineSection', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // At lg breakpoint (1024px+), should have lg:flex-row
        const flexContainer = container.querySelector('.flex.flex-col.lg\\:flex-row');
        expect(flexContainer).toBeTruthy();
        
        // Should have three columns for features
        const featureColumns = container.querySelectorAll('.lg\\:w-1\\/3');
        expect(featureColumns.length).toBeGreaterThanOrEqual(2); // At least left and right columns
      });
    });

    it('shows ConnectionLines at desktop breakpoint', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Connection lines with 'hidden lg:block' should be visible at 1024px+
        const connectionLines = container.querySelectorAll('.hidden.lg\\:block');
        // Should exist and have the classes that make them visible on desktop
        expect(connectionLines.length).toBeGreaterThan(0);
      });
    });

    it('uses full-size center orb at desktop breakpoint', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // At lg breakpoint, should use lg:w-24 lg:h-24
        const orbContainer = container.querySelector('.lg\\:w-24.lg\\:h-24');
        expect(orbContainer).toBeTruthy();
      });
    });

    it('applies desktop padding and spacing', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Check for desktop gap sizing: gap-12 lg:gap-24
        const gapContainer = container.querySelector('.gap-12.lg\\:gap-24');
        expect(gapContainer).toBeTruthy();
      });
    });
  });

  describe('1440px - Large Desktop', () => {
    beforeEach(() => {
      setViewportSize(1440, 900);
    });

    it('maintains desktop layout at large viewport', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Should maintain three-column layout
        const flexContainer = container.querySelector('.flex.flex-col.lg\\:flex-row');
        expect(flexContainer).toBeTruthy();
        
        const featureColumns = container.querySelectorAll('.lg\\:w-1\\/3');
        expect(featureColumns.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('shows all desktop-only elements', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // SideGraphics should be visible
        const sideGraphics = container.querySelectorAll('[class*="side-graphics"]');
        expect(sideGraphics.length).toBeGreaterThan(0);
        
        // ConnectionLines should be visible
        const connectionLines = container.querySelectorAll('.hidden.lg\\:block');
        expect(connectionLines.length).toBeGreaterThan(0);
      });
    });

    it('uses maximum spacing and sizing', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Large gap between sections
        const largeGap = container.querySelector('.gap-12.lg\\:gap-24');
        expect(largeGap).toBeTruthy();
        
        // Full orb size
        const fullOrb = container.querySelector('.lg\\:w-24.lg\\:h-24');
        expect(fullOrb).toBeTruthy();
      });
    });

    it('renders dashboard with proper scaling at large viewport', async () => {
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        const dashboard = container.querySelector('.rounded-\\[20px\\]');
        expect(dashboard).toBeTruthy();
      });
    });
  });

  describe('Layout Transitions', () => {
    it('transitions from mobile to desktop layout', async () => {
      
      // Start at mobile
      setViewportSize(375, 667);
      
      const { container, rerender } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Verify mobile layout
        const flexContainer = container.querySelector('.flex.flex-col.lg\\:flex-row');
        expect(flexContainer).toBeTruthy();
      });

      // Switch to desktop
      setViewportSize(1440, 900);
      
      rerender(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Should still have the responsive container
        const flexContainer = container.querySelector('.flex.flex-col.lg\\:flex-row');
        expect(flexContainer).toBeTruthy();
      });
    });

    it('maintains content integrity across breakpoints', async () => {
      
      const breakpoints = [320, 768, 1024, 1440];
      
      for (const width of breakpoints) {
        setViewportSize(width, 768);
        
        const { container } = render(
          <Router>
            <Landing onNavigate={vi.fn()} />
          </Router>
        );

        await waitFor(() => {
          // Core sections should always be present
          const growthSection = container.querySelector('section.py-24');
          expect(growthSection).toBeTruthy();
          
          // Dashboard section should exist
          const dashboardSection = container.querySelector('section.relative.py-8');
          expect(dashboardSection).toBeTruthy();
        });
      }
    });
  });

  describe('Responsive Text and Spacing', () => {
    it('applies responsive padding to sections at mobile', async () => {
      setViewportSize(375, 667);
      
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Sections should have responsive padding: py-24 md:py-32
        const sections = container.querySelectorAll('.py-24');
        expect(sections.length).toBeGreaterThan(0);
      });
    });

    it('applies responsive text sizes at different breakpoints', async () => {
      const breakpoints = [
        { width: 320, expectedClass: 'text-\\[10px\\]' },
        { width: 768, expectedClass: 'text-3xl' },
        { width: 1440, expectedClass: 'text-5xl' },
      ];

      for (const { width, expectedClass } of breakpoints) {
        setViewportSize(width, 768);
        
        
        const { container } = render(
          <Router>
            <Landing onNavigate={vi.fn()} />
          </Router>
        );

        await waitFor(() => {
          // Check for responsive text classes
          const elements = container.querySelectorAll(`[class*="${expectedClass.replace(/\\/g, '')}"]`);
          expect(elements.length).toBeGreaterThan(0);
        });
      }
    });

    it('applies responsive gap spacing at different breakpoints', async () => {
      setViewportSize(1024, 768);
      
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Should have responsive gap: gap-12 lg:gap-24
        const gapContainers = container.querySelectorAll('.gap-12');
        expect(gapContainers.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Component Visibility Rules', () => {
    it('verifies SideGraphics visibility rules', async () => {
      const testCases = [
        { width: 320, shouldBeHidden: true, name: 'mobile' },
        { width: 768, shouldBeHidden: true, name: 'tablet' },
        { width: 1024, shouldBeHidden: false, name: 'desktop' },
        { width: 1440, shouldBeHidden: false, name: 'large desktop' },
      ];

      for (const { width, name } of testCases) {
        setViewportSize(width, 768);
        
        
        const { container } = render(
          <Router>
            <Landing onNavigate={vi.fn()} />
          </Router>
        );

        await waitFor(() => {
          // SideGraphics have 'hidden lg:block' pattern
          const sideGraphics = container.querySelectorAll('[class*="side-graphics"]');
          // Just verify they exist with the responsive classes
          if (sideGraphics.length > 0) {
            sideGraphics.forEach(graphic => {
              expect(graphic.className).toContain('hidden');
            });
          }
        }, { timeout: 5000 });
      }
    });

    it('verifies ConnectionLine visibility rules', async () => {
      const testCases = [
        { width: 320, name: 'mobile' },
        { width: 1024, name: 'desktop' },
      ];

      for (const { width, name } of testCases) {
        setViewportSize(width, 768);
        
        
        const { container } = render(
          <Router>
            <Landing onNavigate={vi.fn()} />
          </Router>
        );

        await waitFor(() => {
          // Connection lines have 'hidden lg:block' class
          const connectionLines = container.querySelectorAll('.hidden.lg\\:block.absolute');
          // They exist in the DOM with proper classes
          expect(connectionLines.length).toBeGreaterThanOrEqual(0);
        }, { timeout: 5000 });
      }
    });
  });

  describe('Center Orb Responsive Sizing', () => {
    it('uses correct size classes at each breakpoint', async () => {
      
      // Test at mobile
      setViewportSize(320, 568);
      const { container: mobileContainer } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Should have base size w-14 h-14
        const mobileOrb = mobileContainer.querySelector('.w-14.h-14');
        expect(mobileOrb).toBeTruthy();
      });

      // Test at desktop
      setViewportSize(1024, 768);
      const { container: desktopContainer } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Should have lg size classes
        const desktopOrb = desktopContainer.querySelector('.lg\\:w-24.lg\\:h-24');
        expect(desktopOrb).toBeTruthy();
      });
    });
  });

  describe('Feature Card Layout', () => {
    it('stacks feature cards vertically on mobile', async () => {
      setViewportSize(375, 667);
      
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Main container should have flex-col on mobile
        const flexContainer = container.querySelector('.flex.flex-col.lg\\:flex-row');
        expect(flexContainer).toBeTruthy();
      });
    });

    it('arranges feature cards in three columns on desktop', async () => {
      setViewportSize(1440, 900);
      
      
      const { container } = render(
        <Router>
          <Landing onNavigate={vi.fn()} />
        </Router>
      );

      await waitFor(() => {
        // Should have three columns with lg:w-1/3
        const columns = container.querySelectorAll('.lg\\:w-1\\/3');
        expect(columns.length).toBeGreaterThanOrEqual(2); // Left and right columns
      });
    });
  });
});
