import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmailVerification } from './EmailVerification'

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

// Mock fetch globally
global.fetch = vi.fn()

describe('EmailVerification', () => {
  const mockEmail = 'test@example.com'
  const mockOnSuccess = vi.fn()
  const mockOnBack = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('Component Rendering', () => {
    it('should render email verification form', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText('Check Your Email')).toBeInTheDocument()
      expect(screen.getByText(mockEmail)).toBeInTheDocument()
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /verify & create account/i })).toBeInTheDocument()
    })

    it('should show back button when onBack prop is provided', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
          onBack={mockOnBack}
        />
      )

      expect(screen.getByRole('button', { name: /back to form/i })).toBeInTheDocument()
    })

    it('should not show back button when onBack is not provided', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      expect(screen.queryByRole('button', { name: /back to form/i })).not.toBeInTheDocument()
    })

    it('should display expiry timer', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText(/Expires in/i)).toBeInTheDocument()
      expect(screen.getByText(/15:00/)).toBeInTheDocument() // 15 minutes
    })

    it('should show development OTP in development mode', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
          developmentOtp="123456"
        />
      )

      expect(screen.getByText('Dev Mode OTP (Click to Fill)')).toBeInTheDocument()
      expect(screen.getByText('123456')).toBeInTheDocument()

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('PIN Input Validation', () => {
    it('should only accept numeric input', async () => {
      const user = userEvent.setup({ delay: null })
      
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000') as HTMLInputElement

      await user.type(input, 'abc123xyz456')
      expect(input.value).toBe('123456') // Only numbers
    })

    it('should limit input to 6 digits', async () => {
      const user = userEvent.setup({ delay: null })
      
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000') as HTMLInputElement

      await user.type(input, '1234567890')
      expect(input.value).toBe('123456') // Maximum 6 digits
    })

    it('should clear error when user types', async () => {
      const user = userEvent.setup({ delay: null })
      
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000')
      const submitButton = screen.getByRole('button', { name: /verify & create account/i })

      // Trigger validation error
      fireEvent.click(submitButton)
      expect(await screen.findByText(/please enter the 6-digit verification code/i)).toBeInTheDocument()

      // Type should clear error
      await user.type(input, '1')
      expect(screen.queryByText(/please enter the 6-digit verification code/i)).not.toBeInTheDocument()
    })

    it('should disable submit button when code is incomplete', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      expect(submitButton).toBeDisabled()
    })

    it('should enable submit button when code is complete', async () => {
      const user = userEvent.setup({ delay: null })
      
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000')
      const submitButton = screen.getByRole('button', { name: /verify & create account/i })

      await user.type(input, '123456')
      expect(submitButton).not.toBeDisabled()
    })
  })

  describe('Verification Flow', () => {
    it('should show validation error for incomplete code', async () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      fireEvent.click(submitButton)

      expect(await screen.findByText(/please enter the 6-digit verification code/i)).toBeInTheDocument()
    })

    it('should successfully verify valid code', async () => {
      const user = userEvent.setup({ delay: null })
      
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      })

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000')
      await user.type(input, '123456')

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/auth/verify-email',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              email: mockEmail.toLowerCase(),
              code: '123456'
            })
          })
        )
      })

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled()
      })
    })

    it('should show error for invalid code', async () => {
      const user = userEvent.setup({ delay: null })
      
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: 'Invalid verification code' }
        })
      })

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000')
      await user.type(input, '999999')

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      fireEvent.click(submitButton)

      expect(await screen.findByText(/incorrect code/i)).toBeInTheDocument()
    })

    it('should handle expired code error', async () => {
      const user = userEvent.setup({ delay: null })
      
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: 'Code has expired' }
        })
      })

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000')
      await user.type(input, '123456')

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      fireEvent.click(submitButton)

      expect(await screen.findByText(/code has expired/i)).toBeInTheDocument()
    })

    it('should show loading state during verification', async () => {
      const user = userEvent.setup({ delay: null })
      
      ;(global.fetch as any).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true })
        }), 100))
      )

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000')
      await user.type(input, '123456')

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      fireEvent.click(submitButton)

      expect(await screen.findByText(/verifying/i)).toBeInTheDocument()
    })
  })

  describe('Resend Functionality', () => {
    it('should disable resend button during cooldown', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const resendButton = screen.getByRole('button', { name: /resend in/i })
      expect(resendButton).toBeDisabled()
    })

    it('should enable resend button after cooldown', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      // Fast-forward 60 seconds
      vi.advanceTimersByTime(60000)

      const resendButton = screen.getByRole('button', { name: /resend code/i })
      expect(resendButton).not.toBeDisabled()
    })

    it('should successfully resend code', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          success: true,
          developmentOtp: '654321'
        })
      })

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      // Fast-forward cooldown
      vi.advanceTimersByTime(60000)

      const resendButton = screen.getByRole('button', { name: /resend code/i })
      fireEvent.click(resendButton)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/auth/send-verification-email',
          expect.objectContaining({
            method: 'POST'
          })
        )
      })
    })

    it('should reset timers after resending', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      })

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      // Fast-forward initial cooldown
      vi.advanceTimersByTime(60000)

      const resendButton = screen.getByRole('button', { name: /resend code/i })
      fireEvent.click(resendButton)

      await waitFor(() => {
        expect(screen.getByText(/Resend in 1:00/)).toBeInTheDocument()
      })
    })

    it('should clear code input after resending', async () => {
      const user = userEvent.setup({ delay: null })
      
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      })

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000') as HTMLInputElement
      await user.type(input, '123456')
      expect(input.value).toBe('123456')

      // Fast-forward cooldown and resend
      vi.advanceTimersByTime(60000)
      const resendButton = screen.getByRole('button', { name: /resend code/i })
      fireEvent.click(resendButton)

      await waitFor(() => {
        expect(input.value).toBe('')
      })
    })
  })

  describe('Timer Functionality', () => {
    it('should count down expiry timer', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText(/15:00/)).toBeInTheDocument()

      // Fast-forward 1 minute
      vi.advanceTimersByTime(60000)
      expect(screen.getByText(/14:00/)).toBeInTheDocument()
    })

    it('should count down resend cooldown', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      expect(screen.getByText(/Resend in 1:00/)).toBeInTheDocument()

      // Fast-forward 30 seconds
      vi.advanceTimersByTime(30000)
      expect(screen.getByText(/Resend in 0:30/)).toBeInTheDocument()
    })

    it('should show "Code expired" when timer reaches zero', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      // Fast-forward 15 minutes
      vi.advanceTimersByTime(900000)
      expect(screen.getByText(/Code expired/)).toBeInTheDocument()
    })

    it('should disable submit button when code expires', async () => {
      const user = userEvent.setup({ delay: null })
      
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000')
      await user.type(input, '123456')

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      expect(submitButton).not.toBeDisabled()

      // Fast-forward to expiry
      vi.advanceTimersByTime(900000)
      expect(submitButton).toBeDisabled()
    })
  })

  describe('Development Mode Features', () => {
    it('should auto-fill code when clicking dev OTP', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
          developmentOtp="999888"
        />
      )

      const input = screen.getByPlaceholderText('000000') as HTMLInputElement
      const devOtp = screen.getByText('999888')

      fireEvent.click(devOtp)

      await waitFor(() => {
        expect(input.value).toBe('999888')
      })

      process.env.NODE_ENV = originalEnv
    })

    it('should support keyboard navigation for dev OTP', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
          developmentOtp="777666"
        />
      )

      const input = screen.getByPlaceholderText('000000') as HTMLInputElement
      const devOtp = screen.getByText('777666')

      fireEvent.keyDown(devOtp, { key: 'Enter' })

      await waitFor(() => {
        expect(input.value).toBe('777666')
      })

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('Back Navigation', () => {
    it('should call onBack when back button is clicked', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
          onBack={mockOnBack}
        />
      )

      const backButton = screen.getByRole('button', { name: /back to form/i })
      fireEvent.click(backButton)

      expect(mockOnBack).toHaveBeenCalled()
    })

    it('should clear localStorage when going back', () => {
      localStorage.setItem('email_verification_state', JSON.stringify({ 
        timestamp: Date.now(),
        devOtp: '123456'
      }))

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
          onBack={mockOnBack}
        />
      )

      const backButton = screen.getByRole('button', { name: /back to form/i })
      fireEvent.click(backButton)

      expect(localStorage.getItem('email_verification_state')).toBeNull()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const input = screen.getByPlaceholderText('000000')
      expect(input).toHaveAttribute('aria-invalid', 'false')
      expect(input).toHaveAttribute('aria-describedby', 'code-expiry')
    })

    it('should update ARIA attributes on error', async () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      fireEvent.click(submitButton)

      const input = screen.getByPlaceholderText('000000')
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(input).toHaveAttribute('aria-describedby', 'code-error')
      })
    })

    it('should announce errors to screen readers', async () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      const submitButton = screen.getByRole('button', { name: /verify & create account/i })
      fireEvent.click(submitButton)

      const errorElement = await screen.findByRole('alert')
      expect(errorElement).toHaveTextContent(/please enter the 6-digit verification code/i)
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup({ delay: null })
      
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
          onBack={mockOnBack}
        />
      )

      // Tab through interactive elements
      await user.tab() // Input
      expect(screen.getByPlaceholderText('000000')).toHaveFocus()

      await user.tab() // Submit button (disabled, so may skip)
      await user.tab() // Resend button (disabled)
      await user.tab() // Back button
      expect(screen.getByRole('button', { name: /back to form/i })).toHaveFocus()
    })
  })

  describe('LocalStorage Persistence', () => {
    it('should save state to localStorage on mount', () => {
      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
          developmentOtp="555444"
        />
      )

      const saved = localStorage.getItem('email_verification_state')
      expect(saved).toBeTruthy()
      
      const parsed = JSON.parse(saved!)
      expect(parsed).toHaveProperty('timestamp')
      expect(parsed).toHaveProperty('devOtp')
    })

    it('should restore state from localStorage on mount', () => {
      const timestamp = Date.now() - 30000 // 30 seconds ago
      localStorage.setItem('email_verification_state', JSON.stringify({
        timestamp,
        devOtp: '111222'
      }))

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      // Should show approximately 14:30 remaining (15:00 - 0:30)
      expect(screen.getByText(/14:3/)).toBeInTheDocument()
    })

    it('should clear expired state from localStorage', () => {
      const timestamp = Date.now() - 1000000 // Way expired
      localStorage.setItem('email_verification_state', JSON.stringify({
        timestamp,
        devOtp: '123456'
      }))

      render(
        <EmailVerification
          email={mockEmail}
          onVerificationSuccess={mockOnSuccess}
        />
      )

      expect(localStorage.getItem('email_verification_state')).toBeNull()
    })
  })
})
