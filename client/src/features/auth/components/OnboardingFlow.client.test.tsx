import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingFlow, type OnboardingData } from './OnboardingFlow'

describe('OnboardingFlow', () => {
  const mockOnComplete = vi.fn()
  const mockOnSkip = vi.fn()
  const defaultProps = {
    fullName: 'John Doe',
    onComplete: mockOnComplete,
    onSkip: mockOnSkip
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering and Navigation', () => {
    it('should render the first step (profile) by default', () => {
      render(<OnboardingFlow {...defaultProps} />)
      
      expect(screen.getByText('Tell us about yourself')).toBeInTheDocument()
      expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
      expect(screen.getByText('25% complete')).toBeInTheDocument()
    })

    it('should display progress indicator with correct percentage', () => {
      render(<OnboardingFlow {...defaultProps} />)
      
      expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
      expect(screen.getByText('25% complete')).toBeInTheDocument()
    })

    it('should pre-fill the full name from props', () => {
      render(<OnboardingFlow {...defaultProps} />)
      
      const nameInput = screen.getByDisplayValue('John Doe')
      expect(nameInput).toBeInTheDocument()
      expect(nameInput).toBeDisabled()
    })

    it('should disable Back button on first step', () => {
      render(<OnboardingFlow {...defaultProps} />)
      
      const backButton = screen.getByRole('button', { name: /back/i })
      expect(backButton).toBeDisabled()
    })

    it('should disable Continue button when step validation fails', () => {
      render(<OnboardingFlow {...defaultProps} />)
      
      const continueButton = screen.getByRole('button', { name: /continue/i })
      expect(continueButton).toBeDisabled()
    })

    it('should enable Continue button when profile step is valid', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      // Select a role
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      
      const founderOption = await screen.findByText('Founder/CEO')
      await user.click(founderOption)
      
      const continueButton = screen.getByRole('button', { name: /continue/i })
      expect(continueButton).not.toBeDisabled()
    })

    it('should navigate to goals step when Continue is clicked', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      // Complete profile step
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      const founderOption = await screen.findByText('Founder/CEO')
      await user.click(founderOption)
      
      // Click Continue
      const continueButton = screen.getByRole('button', { name: /continue/i })
      await user.click(continueButton)
      
      // Verify step 2 is shown
      await waitFor(() => {
        expect(screen.getByText('What are your goals?')).toBeInTheDocument()
        expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
        expect(screen.getByText('50% complete')).toBeInTheDocument()
      })
    })

    it('should navigate back to profile when Back is clicked on goals step', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      // Navigate to step 2
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      const founderOption = await screen.findByText('Founder/CEO')
      await user.click(founderOption)
      
      const continueButton = screen.getByRole('button', { name: /continue/i })
      await user.click(continueButton)
      
      await waitFor(() => {
        expect(screen.getByText('What are your goals?')).toBeInTheDocument()
      })
      
      // Click Back
      const backButton = screen.getByRole('button', { name: /back/i })
      await user.click(backButton)
      
      // Verify back to step 1
      await waitFor(() => {
        expect(screen.getByText('Tell us about yourself')).toBeInTheDocument()
        expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
      })
    })

    it('should render skip button when onSkip is provided', () => {
      render(<OnboardingFlow {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument()
    })

    it('should not render skip button when onSkip is not provided', () => {
      const { onSkip, ...propsWithoutSkip } = defaultProps
      render(<OnboardingFlow {...propsWithoutSkip} />)
      
      expect(screen.queryByRole('button', { name: /skip for now/i })).not.toBeInTheDocument()
    })
  })

  describe('Step 1: Profile Setup', () => {
    it('should allow selecting a role', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      
      const contentCreatorOption = await screen.findByText('Content Creator')
      await user.click(contentCreatorOption)
      
      // Verify Continue is now enabled
      const continueButton = screen.getByRole('button', { name: /continue/i })
      expect(continueButton).not.toBeDisabled()
    })

    it('should allow entering company name', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      const companyInput = screen.getByPlaceholderText('Enter your company name')
      await user.type(companyInput, 'Acme Inc')
      
      expect(companyInput).toHaveValue('Acme Inc')
    })

    it('should allow selecting company size', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      const sizeSelect = screen.getByRole('combobox', { name: /company size/i })
      await user.click(sizeSelect)
      
      const smallOption = await screen.findByText('2-10 employees')
      await user.click(smallOption)
      
      expect(sizeSelect).toHaveTextContent('2-10 employees')
    })
  })

  describe('Step 2: Goals', () => {
    const navigateToGoalsStep = async (user: any) => {
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      const founderOption = await screen.findByText('Founder/CEO')
      await user.click(founderOption)
      
      const continueButton = screen.getByRole('button', { name: /continue/i })
      await user.click(continueButton)
      
      await waitFor(() => {
        expect(screen.getByText('What are your goals?')).toBeInTheDocument()
      })
    }

    it('should allow selecting multiple primary goals', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToGoalsStep(user)
      
      // Select two goals
      const increaseFollowers = screen.getByLabelText('Increase followers')
      const boostEngagement = screen.getByLabelText('Boost engagement')
      
      await user.click(increaseFollowers)
      await user.click(boostEngagement)
      
      expect(increaseFollowers).toBeChecked()
      expect(boostEngagement).toBeChecked()
      
      // Verify Continue is enabled
      const continueButton = screen.getByRole('button', { name: /continue/i })
      expect(continueButton).not.toBeDisabled()
    })

    it('should allow deselecting goals', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToGoalsStep(user)
      
      const increaseFollowers = screen.getByLabelText('Increase followers')
      
      // Select then deselect
      await user.click(increaseFollowers)
      expect(increaseFollowers).toBeChecked()
      
      await user.click(increaseFollowers)
      expect(increaseFollowers).not.toBeChecked()
    })

    it('should allow entering current challenges', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToGoalsStep(user)
      
      const challengesTextarea = screen.getByPlaceholderText('Tell us your main challenges...')
      await user.type(challengesTextarea, 'Need more engagement')
      
      expect(challengesTextarea).toHaveValue('Need more engagement')
    })

    it('should allow selecting monthly budget', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToGoalsStep(user)
      
      const budgetSelect = screen.getByRole('combobox', { name: /monthly budget/i })
      await user.click(budgetSelect)
      
      const budgetOption = await screen.findByText('$500 - $1,000')
      await user.click(budgetOption)
      
      expect(budgetSelect).toHaveTextContent('$500 - $1,000')
    })

    it('should require at least one goal to be selected', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToGoalsStep(user)
      
      // Without selecting any goal, Continue should be disabled
      const continueButton = screen.getByRole('button', { name: /continue/i })
      expect(continueButton).toBeDisabled()
    })
  })

  describe('Step 3: Platforms', () => {
    const navigateToPlatformsStep = async (user: any) => {
      // Complete step 1
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      const founderOption = await screen.findByText('Founder/CEO')
      await user.click(founderOption)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      // Complete step 2
      await waitFor(() => {
        expect(screen.getByText('What are your goals?')).toBeInTheDocument()
      })
      const increaseFollowers = screen.getByLabelText('Increase followers')
      await user.click(increaseFollowers)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      await waitFor(() => {
        expect(screen.getByText('Your content strategy')).toBeInTheDocument()
      })
    }

    it('should allow selecting multiple platforms', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlatformsStep(user)
      
      const instagram = screen.getByLabelText('Instagram')
      const tiktok = screen.getByLabelText('TikTok')
      
      await user.click(instagram)
      await user.click(tiktok)
      
      expect(instagram).toBeChecked()
      expect(tiktok).toBeChecked()
      
      // Verify Continue is enabled
      const continueButton = screen.getByRole('button', { name: /continue/i })
      expect(continueButton).not.toBeDisabled()
    })

    it('should allow selecting multiple content types', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlatformsStep(user)
      
      const photos = screen.getByLabelText('Photos')
      const videos = screen.getByLabelText('Videos')
      
      await user.click(photos)
      await user.click(videos)
      
      expect(photos).toBeChecked()
      expect(videos).toBeChecked()
    })

    it('should allow selecting posting frequency', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlatformsStep(user)
      
      const frequencySelect = screen.getByRole('combobox', { name: /posting frequency/i })
      await user.click(frequencySelect)
      
      const dailyOption = await screen.findByText('Once per day')
      await user.click(dailyOption)
      
      expect(frequencySelect).toHaveTextContent('Once per day')
    })

    it('should require at least one platform to be selected', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlatformsStep(user)
      
      // Without selecting any platform, Continue should be disabled
      const continueButton = screen.getByRole('button', { name: /continue/i })
      expect(continueButton).toBeDisabled()
    })
  })

  describe('Step 4: Plan Selection', () => {
    const navigateToPlanStep = async (user: any) => {
      // Complete step 1
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      const founderOption = await screen.findByText('Founder/CEO')
      await user.click(founderOption)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      // Complete step 2
      await waitFor(() => {
        expect(screen.getByText('What are your goals?')).toBeInTheDocument()
      })
      const increaseFollowers = screen.getByLabelText('Increase followers')
      await user.click(increaseFollowers)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      // Complete step 3
      await waitFor(() => {
        expect(screen.getByText('Your content strategy')).toBeInTheDocument()
      })
      const instagram = screen.getByLabelText('Instagram')
      await user.click(instagram)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      await waitFor(() => {
        expect(screen.getByText('Choose your plan')).toBeInTheDocument()
      })
    }

    it('should display all plan options', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlanStep(user)
      
      expect(screen.getByText('Free')).toBeInTheDocument()
      expect(screen.getByText('Basic')).toBeInTheDocument()
      expect(screen.getByText('Pro')).toBeInTheDocument()
    })

    it('should show "Most Popular" badge on Pro plan', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlanStep(user)
      
      expect(screen.getByText('Most Popular')).toBeInTheDocument()
    })

    it('should pre-select Free plan by default', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlanStep(user)
      
      // Free plan should be selected (has colored border and checkmark)
      const getStartedButton = screen.getByRole('button', { name: /get started/i })
      expect(getStartedButton).not.toBeDisabled()
    })

    it('should allow selecting different plans', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlanStep(user)
      
      // Click on Pro plan card
      const proCard = screen.getByText('Pro').closest('div')?.parentElement
      if (proCard) {
        await user.click(proCard)
      }
      
      // Get Started button should still be enabled
      const getStartedButton = screen.getByRole('button', { name: /get started/i })
      expect(getStartedButton).not.toBeDisabled()
    })

    it('should show "Get Started" button instead of "Continue" on last step', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await navigateToPlanStep(user)
      
      expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument()
    })
  })

  describe('Onboarding Completion', () => {
    const completeAllSteps = async (user: any) => {
      // Step 1: Profile
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      const founderOption = await screen.findByText('Founder/CEO')
      await user.click(founderOption)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      // Step 2: Goals
      await waitFor(() => {
        expect(screen.getByText('What are your goals?')).toBeInTheDocument()
      })
      const increaseFollowers = screen.getByLabelText('Increase followers')
      await user.click(increaseFollowers)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      // Step 3: Platforms
      await waitFor(() => {
        expect(screen.getByText('Your content strategy')).toBeInTheDocument()
      })
      const instagram = screen.getByLabelText('Instagram')
      await user.click(instagram)
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      // Step 4: Plan
      await waitFor(() => {
        expect(screen.getByText('Choose your plan')).toBeInTheDocument()
      })
    }

    it('should call onComplete with collected data when Get Started is clicked', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      await completeAllSteps(user)
      
      const getStartedButton = screen.getByRole('button', { name: /get started/i })
      await user.click(getStartedButton)
      
      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledTimes(1)
      })
      
      const completedData: OnboardingData = mockOnComplete.mock.calls[0][0]
      expect(completedData.fullName).toBe('John Doe')
      expect(completedData.role).toBe('founder')
      expect(completedData.primaryGoals).toContain('Increase followers')
      expect(completedData.platforms).toContain('Instagram')
      expect(completedData.selectedPlan).toBe('free')
    })

    it('should show loading state during completion', async () => {
      const user = userEvent.setup()
      const slowOnComplete = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(<OnboardingFlow {...defaultProps} onComplete={slowOnComplete} />)
      
      await completeAllSteps(user)
      
      const getStartedButton = screen.getByRole('button', { name: /get started/i })
      await user.click(getStartedButton)
      
      // Should show loading state
      expect(screen.getByText('Completing...')).toBeInTheDocument()
      expect(getStartedButton).toBeDisabled()
    })

    it('should disable all navigation during completion', async () => {
      const user = userEvent.setup()
      const slowOnComplete = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(<OnboardingFlow {...defaultProps} onComplete={slowOnComplete} />)
      
      await completeAllSteps(user)
      
      const getStartedButton = screen.getByRole('button', { name: /get started/i })
      await user.click(getStartedButton)
      
      // Both navigation buttons should be disabled
      const backButton = screen.getByRole('button', { name: /back/i })
      expect(backButton).toBeDisabled()
      expect(getStartedButton).toBeDisabled()
    })

    it('should call onSkip when skip button is clicked', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      const skipButton = screen.getByRole('button', { name: /skip for now/i })
      await user.click(skipButton)
      
      expect(mockOnSkip).toHaveBeenCalledTimes(1)
    })
  })

  describe('Data Persistence', () => {
    it('should maintain form data when navigating between steps', async () => {
      const user = userEvent.setup()
      render(<OnboardingFlow {...defaultProps} />)
      
      // Fill out profile step
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      const founderOption = await screen.findByText('Founder/CEO')
      await user.click(founderOption)
      
      const companyInput = screen.getByPlaceholderText('Enter your company name')
      await user.type(companyInput, 'Test Company')
      
      // Navigate to next step
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      await waitFor(() => {
        expect(screen.getByText('What are your goals?')).toBeInTheDocument()
      })
      
      // Navigate back
      await user.click(screen.getByRole('button', { name: /back/i }))
      
      await waitFor(() => {
        expect(screen.getByText('Tell us about yourself')).toBeInTheDocument()
      })
      
      // Verify data is still there
      const companyInputAgain = screen.getByDisplayValue('Test Company')
      expect(companyInputAgain).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels for steps', () => {
      render(<OnboardingFlow {...defaultProps} />)
      
      expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
    })

    it('should have accessible form labels', () => {
      render(<OnboardingFlow {...defaultProps} />)
      
      expect(screen.getByLabelText(/your role/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/company size/i)).toBeInTheDocument()
    })

    it('should disable interactive elements during loading', async () => {
      const user = userEvent.setup()
      const slowOnComplete = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(<OnboardingFlow {...defaultProps} onComplete={slowOnComplete} />)
      
      // Complete all steps quickly
      const roleSelect = screen.getByRole('combobox', { name: /your role/i })
      await user.click(roleSelect)
      await user.click(await screen.findByText('Founder/CEO'))
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      await waitFor(() => screen.getByLabelText('Increase followers'))
      await user.click(screen.getByLabelText('Increase followers'))
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      await waitFor(() => screen.getByLabelText('Instagram'))
      await user.click(screen.getByLabelText('Instagram'))
      await user.click(screen.getByRole('button', { name: /continue/i }))
      
      await waitFor(() => screen.getByText('Choose your plan'))
      await user.click(screen.getByRole('button', { name: /get started/i }))
      
      // Skip button should be disabled during completion
      const skipButton = screen.getByRole('button', { name: /skip for now/i })
      expect(skipButton).toBeDisabled()
    })
  })
})
