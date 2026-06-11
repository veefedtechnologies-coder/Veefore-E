/**
 * Design Tokens Tests
 * 
 * Simple tests to verify design tokens are properly exported and accessible
 */

import { describe, it, expect } from 'vitest';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  glassMorphism,
  shadows,
  breakpoints,
  sizes,
  zIndex,
  gridPattern,
} from '../design-tokens';

describe('Design Tokens', () => {
  describe('colors', () => {
    it('should export gradient colors matching hero section', () => {
      expect(colors.gradients.blue).toBe('#60a5fa');
      expect(colors.gradients.indigo).toBe('#818cf8');
      expect(colors.gradients.purple).toBe('#a78bfa');
      expect(colors.gradients.cyan).toBe('#22d3ee');
    });

    it('should export border colors', () => {
      expect(colors.borders.subtle).toBe('rgba(255, 255, 255, 0.10)');
      expect(colors.borders.medium).toBe('rgba(255, 255, 255, 0.20)');
    });

    it('should export glass morphism background colors', () => {
      expect(colors.backgrounds.glass).toBe('rgba(255, 255, 255, 0.02)');
      expect(colors.backgrounds.glassMedium).toBe('rgba(255, 255, 255, 0.06)');
    });
  });

  describe('typography', () => {
    it('should export heading styles', () => {
      expect(typography.headings.h1).toContain('text-5xl');
      expect(typography.headings.h2).toContain('text-3xl');
    });

    it('should export body text styles', () => {
      expect(typography.body.base).toContain('text-base');
      expect(typography.body.small).toContain('text-sm');
    });
  });

  describe('spacing', () => {
    it('should export section spacing', () => {
      expect(spacing.section.paddingY).toContain('py-24');
      expect(spacing.section.paddingX).toContain('px-6');
    });

    it('should export gap spacing', () => {
      expect(spacing.gap.small).toBe('gap-4');
      expect(spacing.gap.medium).toBe('gap-8');
      expect(spacing.gap.large).toContain('gap-12');
    });
  });

  describe('borderRadius', () => {
    it('should export border radius values', () => {
      expect(borderRadius.card).toBe('rounded-2xl');
      expect(borderRadius.badge).toBe('rounded-full');
    });
  });

  describe('glassMorphism', () => {
    it('should export glass morphism class combinations', () => {
      expect(glassMorphism.classes.standard).toContain('bg-white/[0.02]');
      expect(glassMorphism.classes.standard).toContain('backdrop-blur-md');
    });
  });

  describe('breakpoints', () => {
    it('should export responsive breakpoint values', () => {
      expect(breakpoints.mobile.max).toBe(640);
      expect(breakpoints.tablet.max).toBe(1024);
      expect(breakpoints.desktop.min).toBe(1024);
    });
  });

  describe('sizes', () => {
    it('should export component-specific sizes', () => {
      expect(sizes.orb.mobile).toBe(56);
      expect(sizes.orb.desktop).toBe(96);
      expect(sizes.dashboard.baseWidth).toBe(1200);
    });
  });

  describe('gridPattern', () => {
    it('should export grid pattern configuration', () => {
      expect(gridPattern.size).toBe(60);
      expect(gridPattern.color).toContain('rgba');
    });
  });

  describe('zIndex', () => {
    it('should export z-index layering values', () => {
      expect(zIndex.background).toBe(-10);
      expect(zIndex.content).toBe(0);
      expect(zIndex.modal).toBe(50);
    });
  });
});
