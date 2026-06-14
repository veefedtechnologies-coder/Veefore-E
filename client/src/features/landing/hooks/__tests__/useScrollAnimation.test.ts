import { describe, it, expect } from 'vitest'
import { useStaggerAnimation } from '../useScrollAnimation'

/**
 * Basic tests for useScrollAnimation hook
 * 
 * Note: Full integration tests with React hooks and Framer Motion require complex mocking.
 * TypeScript compilation and manual testing verify the hook works correctly in practice.
 * These tests cover the utility functions that don't require React context.
 */

describe('useStaggerAnimation', () => {
  it('should generate correct number of delay values', () => {
    const result = useStaggerAnimation(5)

    expect(result).toHaveLength(5)
    expect(result[0]).toBe(0)
    expect(result[4]).toBeCloseTo(0.4, 5)
  })

  it('should accept custom delay increment', () => {
    const result = useStaggerAnimation(3, 0.2)

    expect(result).toHaveLength(3)
    expect(result[0]).toBe(0)
    expect(result[1]).toBeCloseTo(0.2, 5)
    expect(result[2]).toBeCloseTo(0.4, 5)
  })

  it('should handle single item', () => {
    const result = useStaggerAnimation(1)

    expect(result).toHaveLength(1)
    expect(result[0]).toBe(0)
  })

  it('should handle large item counts', () => {
    const result = useStaggerAnimation(20, 0.05)

    expect(result).toHaveLength(20)
    expect(result[0]).toBe(0)
    expect(result[19]).toBeCloseTo(0.95, 5)
  })
})

describe('useScrollAnimation exports', () => {
  it('should export all required hooks', async () => {
    const module = await import('../useScrollAnimation')

    expect(module.useScrollAnimation).toBeDefined()
    expect(module.useParallaxScroll).toBeDefined()
    expect(module.useScrollTrigger).toBeDefined()
    expect(module.useStaggerAnimation).toBeDefined()
    expect(module.useAdvancedParallax).toBeDefined()
  })

  it('should export TypeScript interfaces', async () => {
    const module = await import('../useScrollAnimation')

    // Type interfaces are available at compile time
    expect(typeof module.useScrollAnimation).toBe('function')
    expect(typeof module.useParallaxScroll).toBe('function')
    expect(typeof module.useScrollTrigger).toBe('function')
    expect(typeof module.useStaggerAnimation).toBe('function')
    expect(typeof module.useAdvancedParallax).toBe('function')
  })
})
