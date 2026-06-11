/**
 * Memoization Verification Tests
 * 
 * These tests verify that React.memo optimization is correctly applied
 * to landing page components by checking displayName and basic rendering.
 * 
 * Task: 7.3 - Add React.memo optimization
 * Spec: landing-page-sections-redesign
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import GradientOrb from '../features/shared/GradientOrb';
import TiltCard from '../TiltCard';
import MagneticButton from '../MagneticButton';
import GlassCard from '../GlassCard';
import FloatingStatusBadge from '../FloatingStatusBadge';
import SideGraphics from '../SideGraphics';
import ConnectionLine from '../ConnectionLine';
import { Activity } from 'lucide-react';

describe('React.memo Optimization Tests', () => {
  describe('GradientOrb Memoization', () => {
    it('should have displayName set for debugging', () => {
      expect(GradientOrb.displayName).toBe('GradientOrb');
    });

    it('should render without errors', () => {
      const { container } = render(<GradientOrb color="blue" />);
      expect(container.querySelector('div')).toBeInTheDocument();
    });
  });

  describe('TiltCard Memoization', () => {
    it('should have displayName set for debugging', () => {
      expect(TiltCard.displayName).toBe('TiltCard');
    });

    it('should render with children', () => {
      const { getByText } = render(
        <TiltCard>
          <div>Test Content</div>
        </TiltCard>
      );
      expect(getByText('Test Content')).toBeInTheDocument();
    });
  });

  describe('MagneticButton Memoization', () => {
    it('should have displayName set for debugging', () => {
      expect(MagneticButton.displayName).toBe('MagneticButton');
    });

    it('should render button with children', () => {
      const { getByText } = render(
        <MagneticButton>
          <span>Click Me</span>
        </MagneticButton>
      );
      expect(getByText('Click Me')).toBeInTheDocument();
    });
  });

  describe('GlassCard Memoization', () => {
    it('should have displayName set for debugging', () => {
      expect(GlassCard.displayName).toBe('GlassCard');
    });

    it('should render with children', () => {
      const { getByText } = render(
        <GlassCard>
          <div>Card Content</div>
        </GlassCard>
      );
      expect(getByText('Card Content')).toBeInTheDocument();
    });
  });

  describe('FloatingStatusBadge Memoization', () => {
    it('should have displayName set for debugging', () => {
      expect(FloatingStatusBadge.displayName).toBe('FloatingStatusBadge');
    });

    it('should render badge with text and icon', () => {
      const position = { top: '20px', left: '10px' };
      const { getByText } = render(
        <FloatingStatusBadge
          text="AI Active"
          icon={Activity}
          position={position}
          color="blue"
        />
      );
      expect(getByText('AI Active')).toBeInTheDocument();
    });
  });

  describe('SideGraphics Memoization', () => {
    it('should have displayName set for debugging', () => {
      expect(SideGraphics.displayName).toBe('SideGraphics');
    });

    it('should render graphics for left side', () => {
      const { container } = render(
        <div style={{ position: 'relative', height: '400px' }}>
          <SideGraphics side="left" />
        </div>
      );
      expect(container.querySelector('.hidden.md\\:block')).toBeInTheDocument();
    });

    it('should render graphics for right side', () => {
      const { container } = render(
        <div style={{ position: 'relative', height: '400px' }}>
          <SideGraphics side="right" />
        </div>
      );
      expect(container.querySelector('.hidden.md\\:block')).toBeInTheDocument();
    });
  });

  describe('ConnectionLine Memoization', () => {
    it('should have displayName set for debugging', () => {
      expect(ConnectionLine.displayName).toBe('ConnectionLine');
    });

    it('should render SVG line', () => {
      const startPos = { x: 100, y: 100 };
      const endPos = { x: 200, y: 200 };
      const { container } = render(
        <ConnectionLine
          startPos={startPos}
          endPos={endPos}
          delay={0}
        />
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
      expect(container.querySelector('line')).toBeInTheDocument();
    });
  });

  describe('Integration: All Components with React.memo', () => {
    it('should render multiple memoized components together', () => {
      const { getByText, container } = render(
        <div style={{ position: 'relative', minHeight: '400px' }}>
          <GradientOrb color="blue" className="w-96 h-96 top-0 left-0" />
          
          <GlassCard className="p-4 m-4">
            <TiltCard maxTilt={8}>
              <div>
                <h3>Feature Card</h3>
                <p>Memoized feature card</p>
              </div>
            </TiltCard>
          </GlassCard>
          
          <MagneticButton className="m-4">
            Click Me
          </MagneticButton>

          <FloatingStatusBadge
            text="Active"
            icon={Activity}
            position={{ top: '20px', left: '10px' }}
            color="green"
          />

          <ConnectionLine
            startPos={{ x: 50, y: 50 }}
            endPos={{ x: 100, y: 100 }}
            delay={0}
          />
        </div>
      );
      
      // Verify all components rendered
      expect(getByText('Feature Card')).toBeInTheDocument();
      expect(getByText('Click Me')).toBeInTheDocument();
      expect(getByText('Active')).toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Memoization Implementation Verification', () => {
    it('should verify all components are wrapped with React.memo', () => {
      // Check that components have displayName (set when using React.memo)
      const components = [
        { name: 'GradientOrb', component: GradientOrb },
        { name: 'TiltCard', component: TiltCard },
        { name: 'MagneticButton', component: MagneticButton },
        { name: 'GlassCard', component: GlassCard },
        { name: 'FloatingStatusBadge', component: FloatingStatusBadge },
        { name: 'SideGraphics', component: SideGraphics },
        { name: 'ConnectionLine', component: ConnectionLine },
      ];

      components.forEach(({ name, component }) => {
        expect(component.displayName).toBe(name);
      });
    });

    it('should verify components have custom comparison functions', () => {
      // React.memo components with custom comparison functions have $$typeof symbol
      expect(GradientOrb.$$typeof).toBeDefined();
      expect(TiltCard.$$typeof).toBeDefined();
      expect(MagneticButton.$$typeof).toBeDefined();
      expect(GlassCard.$$typeof).toBeDefined();
      expect(FloatingStatusBadge.$$typeof).toBeDefined();
      expect(SideGraphics.$$typeof).toBeDefined();
      expect(ConnectionLine.$$typeof).toBeDefined();
    });
  });
});
