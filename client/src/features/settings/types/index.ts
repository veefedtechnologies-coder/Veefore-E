/**
 * Settings Feature Types
 * 
 * Type definitions for the settings feature module.
 */

export interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  location?: string;
  lastActive: Date;
  isCurrent: boolean;
}

export interface TwoFactorStatus {
  enabled: boolean;
  backupCodes?: string[];
}

export interface PasswordStrength {
  strength: number;
  label: string;
  color: string;
}

// Re-export profile types
export * from './profile.types';

// Re-export billing types
export * from './billing.types';
