import { describe, it, expect } from 'vitest'
import {
  isValidEmail,
  isDisposableEmail,
  validateName,
  validatePassword,
  validateEmailComplete,
  emailSchema,
  nameSchema,
  passwordSchema,
  signUpSchema,
  signInSchema,
  passwordResetSchema,
} from './validation'

describe('Email Validation', () => {
  it('should validate correct email formats', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@company.co.uk')).toBe(true)
    // Note: + symbol is not allowed in the strict email validation
    expect(isValidEmail('username@example.com')).toBe(true)
  })

  it('should reject invalid email formats', () => {
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('user@')).toBe(false)
    expect(isValidEmail('user@.com')).toBe(false)
  })

  it('should detect disposable email domains', () => {
    expect(isDisposableEmail('test@tempmail.com')).toBe(true)
    expect(isDisposableEmail('test@mailinator.com')).toBe(true)
    expect(isDisposableEmail('test@gmail.com')).toBe(false)
  })

  it('should validate email completely', () => {
    const validResult = validateEmailComplete('test@example.com')
    expect(validResult.valid).toBe(true)

    const invalidResult = validateEmailComplete('test@tempmail.com')
    expect(invalidResult.valid).toBe(false)
    expect(invalidResult.error).toContain('Disposable')
  })
})

describe('Name Validation', () => {
  it('should validate correct names', () => {
    expect(validateName('John Doe').valid).toBe(true)
    expect(validateName("Mary O'Connor").valid).toBe(true)
    expect(validateName('Jean-Pierre').valid).toBe(true)
  })

  it('should reject invalid names', () => {
    expect(validateName('').valid).toBe(false)
    expect(validateName('A').valid).toBe(false)
    expect(validateName('123').valid).toBe(false)
  })

  it('should reject names that are too long', () => {
    const longName = 'A'.repeat(101)
    expect(validateName(longName).valid).toBe(false)
  })
})

describe('Password Validation', () => {
  it('should validate strong passwords', () => {
    const result = validatePassword('SecureP@ss123')
    expect(result.valid).toBe(true)
    expect(result.strength).toBeGreaterThanOrEqual(3)
  })

  it('should reject weak passwords', () => {
    expect(validatePassword('short').valid).toBe(false)
    expect(validatePassword('onlylowercase').valid).toBe(false)
    // Password with only uppercase and lowercase (2 types) - needs at least 3
    expect(validatePassword('NoNumbers').valid).toBe(false)
  })

  it('should reject common passwords', () => {
    const result = validatePassword('password123!')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('too common')
  })

  it('should require at least 3 character types', () => {
    const result = validatePassword('lowercase')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('at least 3 types')
  })

  it('should track password requirements', () => {
    const result = validatePassword('SecureP@ss123')
    expect(result.requirements.length).toBe(true)
    expect(result.requirements.uppercase).toBe(true)
    expect(result.requirements.lowercase).toBe(true)
    expect(result.requirements.number).toBe(true)
    expect(result.requirements.special).toBe(true)
    expect(result.requirements.typesCount).toBe(4)
  })
})

describe('Zod Schema Validation', () => {
  describe('emailSchema', () => {
    it('should validate correct emails', () => {
      expect(() => emailSchema.parse('test@example.com')).not.toThrow()
      expect(() => emailSchema.parse('user.name@company.co.uk')).not.toThrow()
    })

    it('should reject invalid emails', () => {
      expect(() => emailSchema.parse('invalid')).toThrow()
      expect(() => emailSchema.parse('@example.com')).toThrow()
      expect(() => emailSchema.parse('test@tempmail.com')).toThrow()
    })

    it('should trim and lowercase emails', () => {
      const result = emailSchema.parse('  Test@Example.COM  ')
      expect(result).toBe('test@example.com')
    })
  })

  describe('nameSchema', () => {
    it('should validate correct names', () => {
      expect(() => nameSchema.parse('John Doe')).not.toThrow()
      expect(() => nameSchema.parse("Mary O'Connor")).not.toThrow()
      expect(() => nameSchema.parse('Jean-Pierre')).not.toThrow()
    })

    it('should reject invalid names', () => {
      expect(() => nameSchema.parse('')).toThrow()
      expect(() => nameSchema.parse('A')).toThrow()
      expect(() => nameSchema.parse('123')).toThrow()
      expect(() => nameSchema.parse('A'.repeat(101))).toThrow()
    })

    it('should trim names', () => {
      const result = nameSchema.parse('  John Doe  ')
      expect(result).toBe('John Doe')
    })
  })

  describe('passwordSchema', () => {
    it('should validate strong passwords', () => {
      expect(() => passwordSchema.parse('SecureP@ss123')).not.toThrow()
      expect(() => passwordSchema.parse('MyP@ssw0rd!')).not.toThrow()
    })

    it('should reject weak passwords', () => {
      expect(() => passwordSchema.parse('short')).toThrow()
      expect(() => passwordSchema.parse('onlylowercase')).toThrow()
      expect(() => passwordSchema.parse('NoNumbers')).toThrow()
      expect(() => passwordSchema.parse('password123!')).toThrow()
    })

    it('should reject passwords that are too long', () => {
      const longPassword = 'A'.repeat(129)
      expect(() => passwordSchema.parse(longPassword)).toThrow()
    })
  })

  describe('signUpSchema', () => {
    it('should validate correct sign up data', () => {
      const validData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'SecureP@ss123'
      }
      expect(() => signUpSchema.parse(validData)).not.toThrow()
    })

    it('should reject invalid sign up data', () => {
      const invalidData = {
        fullName: 'A',
        email: 'invalid',
        password: 'weak'
      }
      expect(() => signUpSchema.parse(invalidData)).toThrow()
    })
  })

  describe('signInSchema', () => {
    it('should validate correct sign in data', () => {
      const validData = {
        email: 'john@example.com',
        password: 'anypassword'
      }
      expect(() => signInSchema.parse(validData)).not.toThrow()
    })

    it('should reject invalid sign in data', () => {
      const invalidData = {
        email: 'invalid',
        password: ''
      }
      expect(() => signInSchema.parse(invalidData)).toThrow()
    })
  })

  describe('passwordResetSchema', () => {
    it('should validate matching passwords', () => {
      const validData = {
        password: 'NewP@ssw0rd!',
        confirmPassword: 'NewP@ssw0rd!'
      }
      expect(() => passwordResetSchema.parse(validData)).not.toThrow()
    })

    it('should reject non-matching passwords', () => {
      const invalidData = {
        password: 'NewP@ssw0rd!',
        confirmPassword: 'DifferentP@ss123'
      }
      expect(() => passwordResetSchema.parse(invalidData)).toThrow()
    })

    it('should reject weak passwords', () => {
      const invalidData = {
        password: 'weak',
        confirmPassword: 'weak'
      }
      expect(() => passwordResetSchema.parse(invalidData)).toThrow()
    })
  })
})
