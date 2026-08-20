import crypto from 'crypto';

export interface GeneratedCredentials {
  username: string;
  password: string;
  temporaryPassword: boolean;
}

export class CredentialGenerator {
  private static readonly USERNAME_PREFIX = 'admin';
  private static readonly PASSWORD_LENGTH = 16;
  private static readonly USERNAME_LENGTH = 8;

  /**
   * Generate secure admin credentials
   */
  static generateCredentials(email: string, firstName: string, lastName: string): GeneratedCredentials {
    // Generate username: admin + random string
    const randomString = crypto.randomBytes(this.USERNAME_LENGTH).toString('hex').substring(0, this.USERNAME_LENGTH);
    const username = `${this.USERNAME_PREFIX}_${randomString}`;

    // Generate secure password with mixed characters
    const password = this.generateSecurePassword();

    return {
      username,
      password,
      temporaryPassword: true
    };
  }

  /**
   * Generate a secure password with mixed characters
   */
  private static generateSecurePassword(): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const allChars = lowercase + uppercase + numbers + symbols;

    let password = '';

    // Ensure at least one character from each category
    password += lowercase[crypto.randomInt(lowercase.length)];
    password += uppercase[crypto.randomInt(uppercase.length)];
    password += numbers[crypto.randomInt(numbers.length)];
    password += symbols[crypto.randomInt(symbols.length)];

    // Fill the rest with random characters
    for (let i = 4; i < this.PASSWORD_LENGTH; i++) {
      password += allChars[crypto.randomInt(allChars.length)];
    }

    // Shuffle the password securely
    const passwordArray = password.split('');
    for (let i = passwordArray.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
    }
    return passwordArray.join('');
  }

  /**
   * Generate a temporary password for password reset
   */
  static generateTemporaryPassword(): string {
    return this.generateSecurePassword();
  }

  /**
   * Generate a secure API key
   */
  static generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure token
   */
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcrypt');
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify a password against its hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a secure invitation token
   */
  static generateInvitationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure password reset token
   */
  static generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure 2FA secret
   */
  static generate2FASecret(): string {
    return crypto.randomBytes(20).toString('base32');
  }

  /**
   * Generate a secure session token
   */
  static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure webhook secret
   */
  static generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure encryption key
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure random string
   */
  static generateRandomString(length: number): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random number
   */
  static generateRandomNumber(min: number, max: number): number {
    return crypto.randomInt(min, max + 1);
  }

  /**
   * Generate a secure UUID v4
   */
  static generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate a secure random bytes
   */
  static generateRandomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
  }

  /**
   * Generate a secure hash
   */
  static generateHash(data: string, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Generate a secure HMAC
   */
  static generateHMAC(data: string, secret: string, algorithm: string = 'sha256'): string {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }
}

export default CredentialGenerator;
