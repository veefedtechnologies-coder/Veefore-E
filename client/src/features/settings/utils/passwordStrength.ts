import { PasswordStrength } from '../types';

/**
 * Calculate password strength based on various criteria
 * 
 * @param password - The password to evaluate
 * @returns Object containing strength score, label, and color class
 */
export const calculatePasswordStrength = (password: string): PasswordStrength => {
  if (!password) {
    return { strength: 0, label: '', color: '' };
  }

  let strength = 0;
  
  // Length check (50 points total)
  if (password.length >= 8) strength += 25;
  if (password.length >= 12) strength += 25;
  
  // Character variety checks (50 points total)
  if (/[a-z]/.test(password)) strength += 12.5; // Lowercase letters
  if (/[A-Z]/.test(password)) strength += 12.5; // Uppercase letters
  if (/[0-9]/.test(password)) strength += 12.5; // Numbers
  if (/[^a-zA-Z0-9]/.test(password)) strength += 12.5; // Special characters

  // Determine label and color based on strength
  if (strength <= 25) {
    return { strength, label: 'Weak', color: 'bg-red-500' };
  } else if (strength <= 50) {
    return { strength, label: 'Fair', color: 'bg-orange-500' };
  } else if (strength <= 75) {
    return { strength, label: 'Good', color: 'bg-yellow-500' };
  } else {
    return { strength, label: 'Strong', color: 'bg-green-500' };
  }
};

/**
 * Validate password against security requirements
 * 
 * @param password - The password to validate
 * @returns Object with validation results
 */
export const validatePassword = (password: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if two passwords match
 * 
 * @param password - The first password
 * @param confirmPassword - The second password to compare
 * @returns True if passwords match
 */
export const passwordsMatch = (password: string, confirmPassword: string): boolean => {
  return password === confirmPassword && password.length > 0;
};
