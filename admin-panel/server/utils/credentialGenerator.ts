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

    let chars = [
      lowercase[crypto.randomInt(lowercase.length)],
      uppercase[crypto.randomInt(uppercase.length)],
      numbers[crypto.randomInt(numbers.length)],
      symbols[crypto.randomInt(symbols.length)]
    ];

    // Fill the rest with random characters
    for (let i = 4; i < this.PASSWORD_LENGTH; i++) {
      chars.push(allChars[crypto.randomInt(allChars.length)]);
    }

    // Fisher-Yates shuffle using crypto
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
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
    const bcrypt = await import('bcryptjs');
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify a password against its hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const bcrypt = await import('bcryptjs');
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
    const buffer = crypto.randomBytes(20);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;
        while (bits >= 5) {
            output += alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += alphabet[(value << (5 - bits)) & 31];
    }
    return output;
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
