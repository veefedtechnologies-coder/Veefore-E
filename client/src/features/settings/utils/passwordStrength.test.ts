import { describe, it, expect } from 'vitest';
import { calculatePasswordStrength, validatePassword, passwordsMatch } from './passwordStrength';

describe('calculatePasswordStrength', () => {
  it('should return empty values for empty password', () => {
    const result = calculatePasswordStrength('');
    expect(result).toEqual({
      strength: 0,
      label: '',
      color: ''
    });
  });

  it('should return weak for short passwords', () => {
    const result = calculatePasswordStrength('abc');
    expect(result.label).toBe('Weak');
    expect(result.strength).toBeLessThanOrEqual(25);
    expect(result.color).toBe('bg-red-500');
  });

  it('should return fair for passwords with minimal requirements', () => {
    const result = calculatePasswordStrength('abcd1234');
    expect(result.label).toBe('Fair');
    expect(result.strength).toBeGreaterThan(25);
    expect(result.strength).toBeLessThanOrEqual(50);
    expect(result.color).toBe('bg-orange-500');
  });

  it('should return good for passwords with mixed case and numbers', () => {
    const result = calculatePasswordStrength('Abcd1234');
    expect(result.label).toBe('Good');
    expect(result.strength).toBeGreaterThan(50);
    expect(result.strength).toBeLessThanOrEqual(75);
    expect(result.color).toBe('bg-yellow-500');
  });

  it('should return strong for complex passwords', () => {
    const result = calculatePasswordStrength('Abcd1234!@#$');
    expect(result.label).toBe('Strong');
    expect(result.strength).toBeGreaterThan(75);
    expect(result.color).toBe('bg-green-500');
  });

  it('should give higher strength for longer passwords', () => {
    const short = calculatePasswordStrength('Abc123!');
    const long = calculatePasswordStrength('Abc123!@#$%^&*');
    expect(long.strength).toBeGreaterThan(short.strength);
  });

  it('should reward character variety', () => {
    const simple = calculatePasswordStrength('aaaaaaaa');
    const varied = calculatePasswordStrength('Aa1!Bb2@');
    expect(varied.strength).toBeGreaterThan(simple.strength);
  });
});

describe('validatePassword', () => {
  it('should fail for passwords shorter than 8 characters', () => {
    const result = validatePassword('Abc123!');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters long');
  });

  it('should fail for passwords without uppercase letters', () => {
    const result = validatePassword('abcd1234!');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('should fail for passwords without lowercase letters', () => {
    const result = validatePassword('ABCD1234!');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('should fail for passwords without numbers', () => {
    const result = validatePassword('Abcdefgh!');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('should fail for passwords without special characters', () => {
    const result = validatePassword('Abcd1234');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one special character');
  });

  it('should pass for valid passwords', () => {
    const result = validatePassword('Abcd1234!');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return multiple errors for multiple violations', () => {
    const result = validatePassword('abc');
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('passwordsMatch', () => {
  it('should return true for matching non-empty passwords', () => {
    expect(passwordsMatch('password123', 'password123')).toBe(true);
  });

  it('should return false for non-matching passwords', () => {
    expect(passwordsMatch('password123', 'password456')).toBe(false);
  });

  it('should return false for empty passwords', () => {
    expect(passwordsMatch('', '')).toBe(false);
  });

  it('should return false when one password is empty', () => {
    expect(passwordsMatch('password123', '')).toBe(false);
    expect(passwordsMatch('', 'password123')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(passwordsMatch('Password123', 'password123')).toBe(false);
  });
});
