import { describe, it, expect } from 'vitest'
import { ParallaxPresets } from '../useParallaxEffect'
import type { ParallaxConfig } from '../useParallaxEffect'

/**
 * Note: Full hook testing with renderHook requires proper React/Framer Motion mocking.
 * These tests focus on verifying the exported types, interfaces, and preset configurations
 * are correct. The hook functionality is tested through integration tests when used
 * in actual components.
 */

describe('useParallaxEffect exports', () => {
  it('exports ParallaxPresets', () => {
    expect(ParallaxPresets).toBeDefined()
    expect(typeof ParallaxPresets).toBe('object')
  })

  it('has correct TypeScript types', () => {
    // TypeScript compilation will fail if types are wrong
    const config: ParallaxConfig = {
      speed: 0.5,
      enableOnMobile: false,
      scrollRange: [0, 1000],
      yRange: [-100, 100]
    }
    expect(config).toBeDefined()
  })
})

describe('ParallaxPresets', () => {
  it('exports background preset', () => {
    expect(ParallaxPresets.background).toBeDefined()
    expect(ParallaxPresets.background.speed).toBe(0.3)
  })

  it('exports midground preset', () => {
    expect(ParallaxPresets.midground).toBeDefined()
    expect(ParallaxPresets.midground.speed).toBe(0.5)
  })

  it('exports foreground preset', () => {
    expect(ParallaxPresets.foreground).toBeDefined()
    expect(ParallaxPresets.foreground.speed).toBe(0.8)
  })

  it('exports hero preset with fade', () => {
    expect(ParallaxPresets.hero).toBeDefined()
    expect(ParallaxPresets.hero.fadeEnabled).toBe(true)
  })

  it('exports floating preset with scale', () => {
    expect(ParallaxPresets.floating).toBeDefined()
    expect(ParallaxPresets.floating.scaleEnabled).toBe(true)
  })

  it('exports card preset', () => {
    expect(ParallaxPresets.card).toBeDefined()
    expect(ParallaxPresets.card.speed).toBe(0.2)
  })
})
