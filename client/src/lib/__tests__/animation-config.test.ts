/**
 * Animation Configuration Tests
 * 
 * Tests to verify animation variants and configurations are properly exported
 */

import { describe, it, expect } from 'vitest';
import {
  easings,
  springs,
  durations,
  fadeInUp,
  fadeIn,
  staggerContainer,
  scaleOnHover,
  shimmer,
  breathing,
  dashboardTiming,
  featureCardTiming,
  gpuAcceleration,
  prefersReducedMotion,
  getTransition,
} from '../animation-config';

describe('Animation Configuration', () => {
  describe('easings', () => {
    it('should export hero easing curve matching hero section', () => {
      expect(easings.hero).toEqual([0.22, 1, 0.36, 1]);
    });

    it('should export standard easing curve', () => {
      expect(easings.standard).toEqual([0.25, 0.1, 0.25, 1.0]);
    });
  });

  describe('springs', () => {
    it('should export spring configurations', () => {
      expect(springs.default.type).toBe('spring');
      expect(springs.default.stiffness).toBe(200);
      expect(springs.default.damping).toBe(25);
    });

    it('should export snappy spring for magnetic effects', () => {
      expect(springs.snappy.stiffness).toBe(300);
      expect(springs.snappy.damping).toBe(20);
    });
  });

  describe('durations', () => {
    it('should export duration presets', () => {
      expect(durations.fast).toBe(0.3);
      expect(durations.normal).toBe(0.5);
      expect(durations.slow).toBe(0.8);
    });
  });

  describe('fadeInUp variant', () => {
    it('should have initial state with opacity 0 and y offset', () => {
      expect(fadeInUp.initial).toEqual({
        opacity: 0,
        y: 20,
      });
    });

    it('should animate to opacity 1 and y 0', () => {
      expect(fadeInUp.animate).toMatchObject({
        opacity: 1,
        y: 0,
      });
    });

    it('should use hero easing curve', () => {
      expect(fadeInUp.animate?.transition).toMatchObject({
        duration: 0.8,
        ease: easings.hero,
      });
    });
  });

  describe('staggerContainer variant', () => {
    it('should have stagger children configuration', () => {
      expect(staggerContainer.animate?.transition).toMatchObject({
        staggerChildren: 0.15,
        delayChildren: 0.1,
      });
    });
  });

  describe('scaleOnHover variant', () => {
    it('should scale to 1.05 on hover', () => {
      expect(scaleOnHover.hover).toMatchObject({
        scale: 1.05,
      });
    });

    it('should scale to 0.95 on tap', () => {
      expect(scaleOnHover.tap).toEqual({
        scale: 0.95,
      });
    });
  });

  describe('shimmer variant', () => {
    it('should animate x position for shimmer effect', () => {
      expect(shimmer.initial).toEqual({ x: '-100%' });
      expect(shimmer.animate).toMatchObject({
        x: '100%',
      });
    });

    it('should have infinite repeat', () => {
      expect(shimmer.animate?.transition).toMatchObject({
        repeat: Infinity,
      });
    });
  });

  describe('breathing variant', () => {
    it('should animate scale in breathing pattern', () => {
      expect(breathing.animate).toMatchObject({
        scale: [1, 1.02, 1],
      });
    });

    it('should repeat infinitely with 3s duration', () => {
      expect(breathing.animate?.transition).toMatchObject({
        duration: 3,
        repeat: Infinity,
      });
    });
  });

  describe('dashboardTiming', () => {
    it('should export dashboard-specific timing values', () => {
      expect(dashboardTiming.pageDisplayDuration).toBe(2000);
      expect(dashboardTiming.cursorMoveDuration).toBe(300);
      expect(dashboardTiming.totalCycleDuration).toBe(8200);
    });
  });

  describe('featureCardTiming', () => {
    it('should export feature card timing values', () => {
      expect(featureCardTiming.staggerDelay).toBe(150);
      expect(featureCardTiming.hoverDuration).toBe(300);
      expect(featureCardTiming.tiltReturnDuration).toBe(400);
    });
  });

  describe('gpuAcceleration', () => {
    it('should export GPU acceleration properties', () => {
      expect(gpuAcceleration.transform).toBe('translateZ(0)');
      expect(gpuAcceleration.willChange).toBe('transform, opacity');
      expect(gpuAcceleration.backfaceVisibility).toBe('hidden');
    });
  });

  describe('prefersReducedMotion', () => {
    it('should return a boolean', () => {
      const result = prefersReducedMotion();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getTransition', () => {
    it('should return original transition when reduced motion is not preferred', () => {
      const transition = { duration: 0.8, ease: easings.hero };
      const result = getTransition(transition);
      // Should return transition as-is (actual behavior depends on browser setting)
      expect(result).toBeDefined();
      expect(result.duration).toBeDefined();
    });

    it('should handle transition object correctly', () => {
      const transition = { duration: 0.8, ease: easings.hero };
      const result = getTransition(transition);
      
      // Result should have the same shape
      expect(typeof result.duration).toBe('number');
      expect(result.ease).toBeDefined();
    });
  });
});
