# OnboardingFlow Component

## Overview

The `OnboardingFlow` component is a multi-step wizard that guides new users through the onboarding process after account creation. It collects essential user information across four steps to personalize their VeeFore experience.

## Features

- **Multi-Step Wizard**: 4-step guided flow
  1. Profile Setup (role, company, size)
  2. Goals & Budget (primary goals, challenges, budget)
  3. Platforms & Content (social platforms, content types, frequency)
  4. Plan Selection (free, basic, pro)

- **Progress Indicator**: Visual progress bar showing step completion (25%, 50%, 75%, 100%)
- **Navigation**: Next/Back buttons with proper validation
- **Form Validation**: Step-level validation ensures required fields are filled
- **Smooth Animations**: Framer Motion animations between steps
- **Data Persistence**: Form data is maintained when navigating between steps
- **Skip Option**: Optional skip functionality for users who want to complete onboarding later

## Usage

```tsx
import { OnboardingFlow, type OnboardingData } from '@/features/auth/components'

function SignUpPage() {
  const handleOnboardingComplete = async (data: OnboardingData) => {
    // Save onboarding data to backend
    await fetch('/api/user/onboarding', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    
    // Redirect to dashboard
    window.location.href = '/dashboard'
  }

  const handleSkip = () => {
    // Skip onboarding and go directly to dashboard
    window.location.href = '/dashboard?onboarding=incomplete'
  }

  return (
    <OnboardingFlow
      fullName="John Doe"
      onComplete={handleOnboardingComplete}
      onSkip={handleSkip} // Optional
    />
  )
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `fullName` | `string` | Yes | User's full name from signup (pre-filled in profile step) |
| `onComplete` | `(data: OnboardingData) => Promise<void>` | Yes | Callback function called when user completes all steps |
| `onSkip` | `() => void` | No | Optional callback for skip functionality |

## OnboardingData Type

```typescript
interface OnboardingData {
  // Step 1: Profile
  fullName: string
  role: string
  companyName: string
  companySize: string
  
  // Step 2: Goals
  primaryGoals: string[]
  currentChallenges: string
  monthlyBudget: string
  
  // Step 3: Platforms
  platforms: string[]
  contentTypes: string[]
  postingFrequency: string
  
  // Step 4: Plan
  selectedPlan: string
}
```

## Step Details

### Step 1: Profile Setup

**Required Fields:**
- Role (select): Founder/CEO, Marketing Manager, Social Media Manager, Content Creator, Freelancer, Agency Owner, Influencer, Other

**Optional Fields:**
- Company/Brand Name (text input)
- Company Size (select): Just me, 2-10, 11-50, 51-200, 200+ employees

**Validation:**
- Role must be selected to proceed

### Step 2: Goals & Budget

**Required Fields:**
- Primary Goals (multi-select checkboxes): Increase followers, Drive website traffic, Generate leads, Boost engagement, Build brand awareness, Increase sales, Save time on content, Improve content quality

**Optional Fields:**
- Biggest Challenge (textarea)
- Monthly Budget (select): $0-500, $500-1000, $1000-5000, $5000-10000, $10000+

**Validation:**
- At least one primary goal must be selected to proceed

### Step 3: Platforms & Content

**Required Fields:**
- Platforms (multi-select checkboxes): Instagram, Facebook, Twitter/X, LinkedIn, TikTok, YouTube

**Optional Fields:**
- Content Types (multi-select checkboxes): Photos, Videos, Stories, Reels/Shorts, Carousels, Text posts
- Posting Frequency (select): Multiple times per day, Once per day, Few times per week, Once per week, Irregular/as needed

**Validation:**
- At least one platform must be selected to proceed

### Step 4: Plan Selection

**Plans:**
- **Free** (default): 1 social account, 10 posts/month, Basic analytics
- **Basic**: $19/mo - 3 accounts, 100 posts/month, Advanced analytics
- **Pro** (Most Popular): $49/mo - 10 accounts, Unlimited posts, AI content, Team collaboration

**Validation:**
- A plan must be selected (Free is pre-selected by default)

## Visual Design

### Progress Indicator
- Shows current step number: "Step 1 of 4"
- Shows completion percentage: "25% complete"
- Visual progress bar with gradient (teal to emerald)
- Animates smoothly as user progresses

### Step Headers
- Icon representing the step (User, Target, Settings, Diamond)
- Step title
- Brief description

### Navigation
- **Back Button**: Disabled on first step, enabled on subsequent steps
- **Continue Button**: 
  - Disabled when step validation fails
  - Shows "Continue" on steps 1-3
  - Shows "Get Started" on step 4
  - Shows loading state "Completing..." during submission

## Animations

All step transitions use Framer Motion with:
- **Initial**: `opacity: 0, x: 20`
- **Animate**: `opacity: 1, x: 0`
- **Exit**: `opacity: 0, x: -20`
- **Duration**: 0.3s

Progress bar animates smoothly with easing function.

## Accessibility

- All form fields have proper labels
- Disabled states are clearly indicated
- Loading states prevent double-submission
- Keyboard navigation supported
- Screen reader friendly

## Integration with SignUpIntegrated

The OnboardingFlow component is designed to be used within the SignUpIntegrated page flow:

1. User fills signup form
2. User verifies email with OTP
3. Firebase user is created
4. OnboardingFlow component is shown
5. After completion, user is redirected to dashboard

## Backend Integration

The component expects the `onComplete` callback to handle:
- Saving onboarding data to the database
- Creating user preferences/settings
- Initializing user's selected plan
- Any other post-onboarding setup

Example backend endpoint:

```typescript
// POST /api/user/onboarding
{
  fullName: "John Doe",
  role: "founder",
  companyName: "Acme Inc",
  companySize: "2-10",
  primaryGoals: ["Increase followers", "Boost engagement"],
  currentChallenges: "Need better content strategy",
  monthlyBudget: "500-1000",
  platforms: ["Instagram", "TikTok"],
  contentTypes: ["Photos", "Videos", "Reels/Shorts"],
  postingFrequency: "daily",
  selectedPlan: "pro"
}
```

## Testing

Comprehensive test suite covers:
- Rendering and navigation
- Form validation
- Data persistence between steps
- Completion callback
- Skip functionality
- Loading states
- Accessibility

Run tests:
```bash
npm test OnboardingFlow.test.tsx
```

## Requirements

- Requirements 2.2: Component Architecture Optimization - Extract presentation logic into focused component
- Requirements 5.3: Component Architecture Optimization - Multi-step onboarding wizard with progress indicator

## Related Components

- `SignUpForm`: Initial signup form component
- `EmailVerification`: Email OTP verification component
- `NameInput`, `EmailInput`, `PasswordInput`: Form input components

## File Location

```
client/src/features/auth/components/
├── OnboardingFlow.tsx         # Component implementation
├── OnboardingFlow.test.tsx    # Test suite
├── OnboardingFlow.md          # This documentation
└── index.ts                   # Exports
```

## Future Enhancements

Potential improvements for future iterations:

1. **Conditional Steps**: Show/hide steps based on user role
2. **Data Prefill**: Pre-populate fields based on Google OAuth profile
3. **Step Validation Messages**: Show specific error messages for invalid steps
4. **Save & Resume**: Allow users to save progress and resume later
5. **Analytics**: Track drop-off rates per step
6. **A/B Testing**: Test different onboarding flows
7. **Personalization**: Dynamic plan recommendations based on selections
8. **Skip Individual Steps**: Allow skipping specific steps instead of entire flow
