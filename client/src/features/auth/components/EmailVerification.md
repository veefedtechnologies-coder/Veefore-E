# EmailVerification Component

## Overview

The `EmailVerification` component provides a user-friendly interface for email verification using a 6-digit PIN code. It includes rate limiting UI, countdown timers, and development mode features.

**Extracted from**: `SignUpIntegrated.tsx` (Task 5.2)  
**Requirements**: 2.2 (Large file decomposition), 5.3 (Component architecture optimization)

## Features

### Core Functionality
- ✅ 6-digit PIN entry with automatic formatting
- ✅ Visual countdown timer for code expiry (15 minutes)
- ✅ Resend verification code with rate limiting (60-second cooldown)
- ✅ Real-time validation feedback
- ✅ Persistent state across page refreshes (localStorage)

### User Experience
- ✅ Numeric-only input with automatic sanitization
- ✅ Visual loading states during verification and resend
- ✅ User-friendly error messages
- ✅ Development mode OTP display with auto-fill
- ✅ Optional back navigation

### Accessibility
- ✅ Keyboard navigation support
- ✅ ARIA labels and live regions
- ✅ Screen reader announcements for errors and status changes
- ✅ Focus management
- ✅ Proper semantic HTML

## Usage

### Basic Example

```tsx
import { EmailVerification } from '@/features/auth/components'

function SignUpFlow() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'form' | 'verification'>('form')

  const handleVerificationSuccess = () => {
    // User has verified their email
    console.log('Email verified successfully!')
    // Proceed to next step (e.g., onboarding, dashboard)
  }

  return (
    <>
      {step === 'verification' && (
        <EmailVerification
          email={email}
          onVerificationSuccess={handleVerificationSuccess}
          onBack={() => setStep('form')}
        />
      )}
    </>
  )
}
```

### With Custom Styling

```tsx
<EmailVerification
  email="user@example.com"
  onVerificationSuccess={handleSuccess}
  className="max-w-md mx-auto"
/>
```

### Development Mode

In development mode, the component displays the OTP code for testing:

```tsx
<EmailVerification
  email="test@example.com"
  onVerificationSuccess={handleSuccess}
  developmentOtp="123456"  // Automatically displayed in dev mode
/>
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `email` | `string` | Yes | The email address to verify |
| `onVerificationSuccess` | `() => void` | Yes | Callback fired when verification succeeds |
| `onBack` | `() => void` | No | Callback fired when user clicks back button |
| `developmentOtp` | `string` | No | OTP code to display in development mode |
| `className` | `string` | No | Additional CSS classes for custom styling |

## API Integration

### Verify Email Endpoint

```typescript
POST /api/auth/verify-email
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456"
}

// Success Response
{
  "success": true
}

// Error Response
{
  "error": {
    "message": "Invalid verification code"
  }
}
```

### Resend Code Endpoint

```typescript
POST /api/auth/send-verification-email
Content-Type: application/json

{
  "email": "user@example.com",
  "firstName": "John"
}

// Success Response
{
  "success": true,
  "developmentOtp": "654321"  // Only in development mode
}

// Error Response
{
  "message": "Failed to send verification code"
}
```

## State Management

The component manages the following state internally:

```typescript
interface VerificationState {
  code: string              // Current PIN code (0-6 digits)
  expiryTime: number        // Seconds remaining until code expires
  resendCooldown: number    // Seconds until resend is available
  developmentOtp: string    // Development OTP for testing
}
```

## Timers

### Expiry Timer
- **Duration**: 15 minutes (900 seconds)
- **Behavior**: Counts down from 15:00 to 0:00
- **On Expiry**: 
  - Displays "Code expired"
  - Disables submit button
  - Prompts user to resend

### Resend Cooldown
- **Duration**: 60 seconds
- **Behavior**: Prevents rapid resend requests
- **Display**: Shows "Resend in X:XX" during cooldown
- **After Cooldown**: Enables resend button

## Validation

### Code Format
- Must be exactly 6 digits
- Only numeric characters allowed
- Non-numeric characters are automatically stripped
- Leading/trailing spaces are ignored

### Submission Requirements
- Code must be complete (6 digits)
- Code must not be expired
- No pending verification request

## Error Handling

The component handles various error scenarios with user-friendly messages:

| Error Type | User Message |
|------------|--------------|
| Empty code | "Please enter the 6-digit verification code" |
| Invalid code | "Incorrect code. Please check and try again." |
| Expired code | "This code has expired. Please request a new one." |
| Not on waitlist | "🚫 Access Denied - This email isn't on our waitlist." |
| Pending approval | "⏳ Almost There! Your application is under review." |
| Access rejected | "😔 Unfortunately, your application wasn't approved." |

## Persistence

The component uses localStorage to persist state across page refreshes:

**Storage Key**: `email_verification_state`

**Stored Data**:
```typescript
{
  timestamp: number,      // When verification started
  devOtp: string         // Development OTP (if applicable)
}
```

**Behavior**:
- State is saved when verification starts
- State is restored on component mount
- Expired state (>15 minutes) is automatically cleared
- State is cleared on successful verification
- State is cleared when user goes back

## Accessibility Features

### Keyboard Navigation
- Tab through all interactive elements
- Enter key submits form
- Focus management for error states

### Screen Reader Support
- ARIA labels for all controls
- Live regions for timer updates
- Role attributes for semantic meaning
- Error announcements via `role="alert"`

### Visual Indicators
- High contrast error messages
- Loading spinners for async operations
- Disabled state styling
- Focus visible indicators

## Testing

The component includes comprehensive unit tests covering:

✅ Component rendering  
✅ PIN input validation  
✅ Verification flow  
✅ Resend functionality  
✅ Timer countdown  
✅ Development mode features  
✅ Back navigation  
✅ Accessibility  
✅ LocalStorage persistence  

Run tests:
```bash
npm run test EmailVerification.test.tsx
```

## Development Tips

### Testing Verification Flow

1. **In Development Mode**: Use the displayed OTP for quick testing
2. **Auto-fill OTP**: Click the development OTP to auto-fill the input
3. **Skip Cooldown**: Modify timers in browser DevTools for faster testing

### Debugging

Enable console logging:
```typescript
// Verification requests
console.log('Verification state:', state)

// API responses
console.log('Verification response:', data)

// Timer updates
console.log('Time remaining:', state.expiryTime)
```

## Related Components

- `SignUpForm` - Collects user information before verification
- `NameInput` - Input component for full name
- `EmailInput` - Email input with validation
- `PasswordInput` - Password input with strength indicator

## Migration Guide

If migrating from the monolithic `SignUpIntegrated.tsx`:

### Before (SignUpIntegrated.tsx)
```tsx
{currentStep === 'verification' && (
  <motion.div>
    {/* 300+ lines of verification UI */}
  </motion.div>
)}
```

### After (Extracted Component)
```tsx
import { EmailVerification } from '@/features/auth/components'

{currentStep === 'verification' && (
  <EmailVerification
    email={formData.email}
    onVerificationSuccess={handleCreateAccount}
    onBack={() => setCurrentStep('form')}
    developmentOtp={otpData.developmentOtp}
  />
)}
```

## Performance Considerations

- Uses `React.memo()` internally for optimization (if needed)
- Debounced localStorage writes
- Efficient timer updates (1-second intervals)
- Minimal re-renders on state changes

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support with `inputMode="numeric"`

## License

Internal component - Part of Veefore-E platform
