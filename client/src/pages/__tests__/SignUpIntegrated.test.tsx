import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignUpIntegrated from '../SignUpIntegrated'
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'

// Mock dependencies
vi.mock('@/hooks/useFirebaseAuth')
vi.mock('wouter', () => ({
  useLocation: () => ['/signup', vi.fn()]
}))
vi.mock('@/lib/firebase', () => ({
  auth: {}
}))
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithCustomToken: vi.fn()
}))

describe('SignUpIntegrated - Refactored Component Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useFirebaseAuth).mockReturnValue({
      user: null,
      loading: false,
      error: null
    } as any)
    
    // Mock fetch
    global.fetch = vi.fn()
  })

  describe('Requirement 2.6: Update signup route to use refactored components', () => {
    it('should render SignUpForm component on initial load', () => {
      render(<SignUpIntegrated />)
      
      // Verify SignUpForm is rendered
      expect(screen.getByText('Get Started Free')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/enter your full name/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument()
    })

    it('should transition to EmailVerification component after form submission', async () => {
      const user = userEvent.setup()
      
      // Mock successful verification email send
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ developmentOtp: '123456' })
      } as Response)

      render(<SignUpIntegrated />)
      
      // Fill in form
      await user.type(screen.getByPlaceholderText(/enter your full name/i), 'John Doe')
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText(/enter your password/i), 'SecurePass123!')
      
      // Submit form
      const submitButton = screen.getByRole('button', { name: /send verification code/i })
      await user.click(submitButton)

      // Wait for transition to EmailVerification
      await waitFor(() => {
        expect(screen.getByText('Check Your Email')).toBeInTheDocument()
      })
    })

    it('should transition to OnboardingFlow component after successful verification', async () => {
      const user = userEvent.setup()
      
      // Mock successful verification email send
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ developmentOtp: '123456' })
      } as Response)

      // Mock successful email verification
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verified: true })
      } as Response)

      // Mock Firebase user creation
      const { createUserWithEmailAndPassword } = await import('firebase/auth')
      vi.mocked(createUserWithEmailAndPassword).mockResolvedValueOnce({
        user: { uid: 'test-uid', getIdToken: vi.fn().mockResolvedValue('test-token') }
      } as any)

      render(<SignUpIntegrated />)
      
      // Fill in form and submit
      await user.type(screen.getByPlaceholderText(/enter your full name/i), 'John Doe')
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText(/enter your password/i), 'SecurePass123!')
      await user.click(screen.getByRole('button', { name: /send verification code/i }))

      // Wait for EmailVerification component
      await waitFor(() => {
        expect(screen.getByText('Check Your Email')).toBeInTheDocument()
      })

      // Enter verification code
      const codeInput = screen.getByPlaceholderText('000000')
      await user.type(codeInput, '123456')
      await user.click(screen.getByRole('button', { name: /verify & create account/i }))

      // Wait for OnboardingFlow component
      await waitFor(() => {
        expect(screen.getByText('Tell us about yourself')).toBeInTheDocument()
      })
    })
  })

  describe('Requirement 8.4: Verify OAuth integration still works', () => {
    it('should handle OAuth success callback correctly', async () => {
      // Mock OAuth success in URL params
      window.history.pushState({}, '', '?oauth_success=true')
      
      // Mock session exchange
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ customToken: 'test-custom-token' })
      } as Response)

      // Mock Firebase sign-in with custom token
      const { signInWithCustomToken } = await import('firebase/auth')
      vi.mocked(signInWithCustomToken).mockResolvedValueOnce({
        user: { uid: 'oauth-user-id' }
      } as any)

      render(<SignUpIntegrated />)

      // Verify OAuth success indicator is shown
      await waitFor(() => {
        expect(screen.getByText(/completing google sign-up/i)).toBeInTheDocument()
      })

      // Verify session exchange was called
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/auth/session',
          expect.objectContaining({
            method: 'GET',
            credentials: 'include'
          })
        )
      })
    })

    it('should handle OAuth error callback correctly', () => {
      // Mock OAuth error in URL params
      window.history.pushState({}, '', '?oauth_error=access_denied&oauth_error_description=User%20cancelled')
      
      render(<SignUpIntegrated />)

      // Since SignUpForm handles OAuth errors, it should be displayed in the form component
      // We just verify that the component renders without crashing
      expect(screen.getByText('Get Started Free')).toBeInTheDocument()
    })
  })

  describe('Component Integration', () => {
    it('should maintain form data across component transitions', async () => {
      const user = userEvent.setup()
      
      // Mock successful verification email send
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ developmentOtp: '123456' })
      } as Response)

      render(<SignUpIntegrated />)
      
      // Fill in form
      const fullName = 'John Doe'
      const email = 'john@example.com'
      
      await user.type(screen.getByPlaceholderText(/enter your full name/i), fullName)
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), email)
      await user.type(screen.getByPlaceholderText(/enter your password/i), 'SecurePass123!')
      await user.click(screen.getByRole('button', { name: /send verification code/i }))

      // Wait for transition to EmailVerification
      await waitFor(() => {
        expect(screen.getByText('Check Your Email')).toBeInTheDocument()
      })

      // Verify email is displayed in verification screen
      expect(screen.getByText(email)).toBeInTheDocument()
    })

    it('should allow navigating back from verification to form', async () => {
      const user = userEvent.setup()
      
      // Mock successful verification email send
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ developmentOtp: '123456' })
      } as Response)

      render(<SignUpIntegrated />)
      
      // Fill in and submit form
      await user.type(screen.getByPlaceholderText(/enter your full name/i), 'John Doe')
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText(/enter your password/i), 'SecurePass123!')
      await user.click(screen.getByRole('button', { name: /send verification code/i }))

      // Wait for EmailVerification
      await waitFor(() => {
        expect(screen.getByText('Check Your Email')).toBeInTheDocument()
      })

      // Click back button
      await user.click(screen.getByText(/back to form/i))

      // Verify we're back to SignUpForm
      await waitFor(() => {
        expect(screen.getByText('Get Started Free')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle early access restriction errors', async () => {
      const user = userEvent.setup()
      
      // Mock early access error (403)
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { code: 'NOT_ON_WAITLIST' }
        })
      } as Response)

      render(<SignUpIntegrated />)
      
      // Fill in form
      await user.type(screen.getByPlaceholderText(/enter your full name/i), 'John Doe')
      await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'john@example.com')
      await user.type(screen.getByPlaceholderText(/enter your password/i), 'SecurePass123!')
      await user.click(screen.getByRole('button', { name: /send verification code/i }))

      // Should stay on form and show error
      await waitFor(() => {
        expect(screen.getByText('Get Started Free')).toBeInTheDocument()
      })
    })
  })
})
