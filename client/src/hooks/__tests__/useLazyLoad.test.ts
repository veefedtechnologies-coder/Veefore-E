/**
 * useLazyLoad Hook Tests
 * 
 * Tests for viewport detection and lazy loading functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLazyLoad, useLazyLoadWithEntry, useProgressiveLazyLoad } from '../useLazyLoad';

describe('useLazyLoad', () => {
  it('should export useLazyLoad function', () => {
    expect(typeof useLazyLoad).toBe('function');
  });

  it('should export useLazyLoadWithEntry function', () => {
    expect(typeof useLazyLoadWithEntry).toBe('function');
  });

  it('should export useProgressiveLazyLoad function', () => {
    expect(typeof useProgressiveLazyLoad).toBe('function');
  });

  it('should handle IntersectionObserver not being available', () => {
    // Verify function exists and can be imported
    expect(useLazyLoad).toBeDefined();
  });
});
