# Auth Hooks

This directory contains custom React hooks for authentication-related functionality.

## useSignUpFlow

**Location:** `./useSignUpFlow.ts`

**Purpose:** Manages the complete signup workflow state machine for user registration.

**Features:**
- Form submission and validation
- Email verification with OTP
- Firebase user creation
- Backend session management
- Multi-step onboarding flow
- State persistence across page refreshes
- Early access/waitlist validation

**Workflow Steps:**
1. `form` - Initial signup form (email, password, name)
2. `verification` - Email OTP verification
3. `creating` - Firebase user creation and account linking
4. `onboarding-profile` - User profile setup
5. `onboarding-goals` - Primary goals selection
6. `onboarding-platforms` - Platform preferences
7. `onboarding-plan` - Plan selection

**Usage Example:**
```typescript
import { useSignUpFlow } from '@/features/auth/hooks/useSignUpFlow';
import { useToast } from '@/hooks/use-toast';

function SignUpComponent() {
  const { toast } = useToast();
  
  const {
    currentStep,
    formData,
    errors,
    isVerifying,
    handleInputChange,
    handleSendOtp,
    handleVerifyOtp,
    handleCompleteOnboarding
  } = useSignUpFlow(toast, validateFormFunction);
  
  // Use the hook state and actions in your component
}
```

**Requirements:** Validates Requirements 5.2, 5.3 from the design document.
