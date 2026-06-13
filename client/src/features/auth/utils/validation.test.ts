import { describe, it, expect } from 'vitest'
import {
  isValidEmail,
  isDisposableEmail,
  validateName,
  validatePassword,
  validateEmailComplete
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
