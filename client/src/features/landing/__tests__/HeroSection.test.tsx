import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroSection } from '../sections/HeroSection'

// Mock dependencies
vi.mock('wouter', () => ({
  useLocation: () => ['/landing', vi.fn()]
}))

vi.mock('../../../context/WaitlistContext', () => ({
  useWaitlist: () => ({
    openWaitlist: vi.fn()
  })
}))

vi.mock('../../../hooks/useEarlyAccessCheck', () => ({
  useEarlyAccessCheck: () => ({
    hasEarlyAccess: false
  })
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useScroll: () => ({ scrollY: { get: () => 0, set: vi.fn() } }),
  useTransform: () => ({ get: () => 0, set: vi.fn() })
}))

// Mock child components
vi.mock('../components/RotatingText', () => ({
  RotatingText: () => <div data-testid="rotating-text">Test Tagline</div>
}))

vi.mock('../components/VideoBackground', () => ({
  VideoBackground: () => <div data-testid="video-background">Video Background</div>
}))

describe('HeroSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<HeroSection />)
    expect(screen.getByRole('button', { name: /Begin Journey/i })).toBeInTheDocument()
  })

  it('renders the rotating text component', () => {
    render(<HeroSection />)
    expect(screen.getByTestId('rotating-text')).toBeInTheDocument()
  })

  it('renders the video background component', () => {
    render(<HeroSection />)
    expect(screen.getByTestId('video-background')).toBeInTheDocument()
  })

  it('displays the subheading text', () => {
    render(<HeroSection />)
    expect(screen.getByText(/Automate engagement/i)).toBeInTheDocument()
  })

  it('displays the CTA button', () => {
    render(<HeroSection />)
    const button = screen.getByRole('button', { name: /Begin Journey/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('btn-brick')
  })
})
