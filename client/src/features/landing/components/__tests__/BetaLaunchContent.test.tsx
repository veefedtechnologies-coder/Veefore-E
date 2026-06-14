import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Mock dependencies before imports
vi.mock('../../../../hooks/use-is-mobile', () => ({
  useIsMobile: () => false
}))

vi.mock('../../../../context/WaitlistContext', () => ({
  useWaitlist: () => ({
    openWaitlist: vi.fn()
  })
}))

vi.mock('../../../../lib/animation-performance', () => ({
  VIEWPORT_ONCE: { once: true, amount: 0.3 }
}))

// Import after mocks
import {
  MysteryDateDigits,
  BentoBenefitsGrid,
} from '../BetaLaunchContent'

describe('MysteryDateDigits', () => {
  it('renders the mystery date with year 2026', () => {
    const { container } = render(<MysteryDateDigits />)
    expect(container.textContent).toContain('2026')
  })
})

describe('BentoBenefitsGrid', () => {
  it('renders without crashing', () => {
    const { container } = render(<BentoBenefitsGrid />)
    expect(container).toBeTruthy()
  })

  it('displays all four benefit cards', () => {
    const { container } = render(<BentoBenefitsGrid />)
    expect(container.textContent).toContain('500 Bonus Credits')
    expect(container.textContent).toContain('Early Access')
    expect(container.textContent).toContain('Free Trial')
    expect(container.textContent).toContain('Priority Support')
  })

  it('shows the credit amount', () => {
    const { container } = render(<BentoBenefitsGrid />)
    expect(container.textContent).toContain('500')
  })

  it('shows the trial duration', () => {
    const { container } = render(<BentoBenefitsGrid />)
    expect(container.textContent).toContain('30')
  })
})

describe('BetaLaunchContent Integration', () => {
  it('MysteryDateDigits and BentoBenefitsGrid can be rendered together', () => {
    const { container } = render(
      <div>
        <MysteryDateDigits />
        <BentoBenefitsGrid />
      </div>
    )
    expect(container).toBeTruthy()
    expect(container.textContent).toContain('2026')
    expect(container.textContent).toContain('500 Bonus Credits')
  })
})

