/**
 * SignUpIntegrated — enterprise-level validation utilities.
 *
 * Extracted verbatim from the original SignUpIntegrated page so behaviour is
 * byte-for-byte identical. These are intentionally kept separate from
 * `features/auth/utils/validation.ts` because the password validator here
 * returns a richer shape (strength + requirements) that the signup flow relies
 * on.
 */

// Strict email validation (matching waitlist standards)
export const isValidEmail = (email: string): boolean => {
  // RFC 5322 compliant email regex - stricter than basic validation
  const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/
  return emailRegex.test(email.toLowerCase().trim())
}

// Block disposable/temporary email providers
export const isDisposableEmail = (email: string): boolean => {
  const disposableDomains = [
    'tempmail.com', 'throwaway.com', 'mailinator.com', 'guerrillamail.com',
    'temp-mail.org', 'fakeinbox.com', '10minutemail.com', 'trashmail.com',
    'getairmail.com', 'yopmail.com', 'sharklasers.com', 'spam4.me',
    'tempinbox.com', 'discard.email', 'mailnesia.com', 'maildrop.cc',
    'guerrillamail.org', 'guerrillamail.net', 'throwawaymail.com',
    'getnada.com', 'tempail.com', 'mohmal.com', 'emailondeck.com'
  ]
  const domain = email.split('@')[1]?.toLowerCase()
  return disposableDomains.includes(domain)
}

// Validate domain structure
export const isValidDomain = (email: string): { valid: boolean; error?: string } => {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return { valid: false, error: 'Invalid email format' }

  const domainParts = domain.split('.')
  const tld = domainParts[domainParts.length - 1]

  if (tld.length < 2 || tld.length > 10) {
    return { valid: false, error: 'Invalid domain extension' }
  }
  if (!/^[a-zA-Z]+$/.test(tld)) {
    return { valid: false, error: 'Invalid domain extension' }
  }
  if (domain.length < 4) {
    return { valid: false, error: 'Invalid domain name' }
  }

  return { valid: true }
}

// Name validation (enterprise standard)
export const validateName = (name: string): { valid: boolean; error?: string } => {
  const trimmed = name.trim()

  if (!trimmed) {
    return { valid: false, error: 'Full name is required' }
  }
  if (trimmed.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' }
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Name is too long (max 100 characters)' }
  }
  // Allow letters, spaces, hyphens, apostrophes (for real names like O'Connor, Mary-Jane)
  if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(trimmed)) {
    return { valid: false, error: 'Name contains invalid characters' }
  }
  // Check for at least one letter
  if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) {
    return { valid: false, error: 'Name must contain at least one letter' }
  }

  return { valid: true }
}

// Password strength validation (enterprise standard)
export const validatePassword = (password: string): {
  valid: boolean;
  error?: string;
  strength: number;
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
    typesCount: number;
  }
} => {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password),
    typesCount: 0
  }

  requirements.typesCount = [
    requirements.uppercase,
    requirements.lowercase,
    requirements.number,
    requirements.special
  ].filter(Boolean).length

  let strength = 0
  if (requirements.length) strength += 1
  if (requirements.typesCount >= 2) strength += 1
  if (requirements.typesCount >= 3) strength += 1
  if (requirements.typesCount === 4) strength += 1
  if (password.length >= 12) strength += 1

  // Normalize strength to 0-5 range for UI
  // 1: Weak, 2: Fair, 3: Good, 4: Strong, 5: Very Strong

  // Validation Logic
  if (!password) {
    return { valid: false, error: 'Password is required', strength: 0, requirements }
  }
  if (!requirements.length) {
    return { valid: false, error: 'Password must be at least 8 characters', strength: 1, requirements }
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password is too long', strength: 1, requirements }
  }
  if (requirements.typesCount < 3) {
    return {
      valid: false,
      error: 'Password must include at least 3 types: uppercase, lowercase, number, special',
      strength: 2,
      requirements
    }
  }

  // Check for common patterns
  const commonPatterns = ['password', '12345678', 'qwerty', 'abc123', 'letmein', 'welcome', 'admin', 'login']
  if (commonPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
    return {
      valid: false,
      error: 'Password is too common. Please choose a stronger password.',
      strength: 2,
      requirements
    }
  }

  return { valid: true, strength: Math.max(3, strength), requirements }
}

// Comprehensive email validation (matching waitlist)
export const validateEmailComplete = (email: string): { valid: boolean; error?: string } => {
  const trimmed = email.trim().toLowerCase()

  if (!trimmed) {
    return { valid: false, error: 'Email address is required' }
  }

  if (!isValidEmail(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' }
  }

  if (isDisposableEmail(trimmed)) {
    return { valid: false, error: 'Disposable/temporary emails are not allowed' }
  }

  const domainCheck = isValidDomain(trimmed)
  if (!domainCheck.valid) {
    return { valid: false, error: domainCheck.error }
  }

  return { valid: true }
}
