/**
 * P1-6 SECURITY: Key Management & Encryption
 * 
 * Comprehensive key management system with encryption, rotation, and monitoring
 */

import { createHash, randomBytes } from 'crypto';

// Rate limiting for audit logging to prevent console spam
let lastAuditLog = 0;

/**
 * P1-6.1: Environment variable security audit and validation
 */
interface SecretConfig {
  name: string;
  required: boolean;
  encrypted?: boolean;
  rotatable?: boolean;
  description: string;
  category: 'database' | 'oauth' | 'api' | 'encryption' | 'payment' | 'email' | 'storage';
}

/**
 * P1-6.1: Complete secrets inventory for VeeFore platform
 */
export const SECRETS_INVENTORY: SecretConfig[] = [
  // Database & Storage
  { name: 'DATABASE_URL', required: true, category: 'database', description: 'MongoDB connection string' },
  { name: 'REDIS_URL', required: true, category: 'database', description: 'Redis connection for rate limiting and caching' },
  
  // Authentication & OAuth
  { name: 'FIREBASE_SERVICE_ACCOUNT', required: process.env.NODE_ENV === 'production', category: 'oauth', description: 'Firebase admin service account JSON' },
  { name: 'INSTAGRAM_CLIENT_ID', required: process.env.NODE_ENV === 'production', category: 'oauth', description: 'Instagram OAuth client ID' },
  { name: 'INSTAGRAM_CLIENT_SECRET', required: process.env.NODE_ENV === 'production', encrypted: true, rotatable: true, category: 'oauth', description: 'Instagram OAuth client secret' },
  { name: 'YOUTUBE_API_KEY', required: false, encrypted: true, rotatable: true, category: 'api', description: 'YouTube Data API key' },
  
  // AI Services
  { name: 'OPENAI_API_KEY', required: true, encrypted: true, rotatable: true, category: 'api', description: 'OpenAI API key for AI features' },
  { name: 'ANTHROPIC_API_KEY', required: false, encrypted: true, rotatable: true, category: 'api', description: 'Anthropic Claude API key' },
  { name: 'GOOGLE_GENAI_API_KEY', required: false, encrypted: true, rotatable: true, category: 'api', description: 'Google Generative AI API key' },
  { name: 'ELEVENLABS_API_KEY', required: false, encrypted: true, rotatable: true, category: 'api', description: 'ElevenLabs voice generation API' },
  { name: 'REPLICATE_API_TOKEN', required: false, encrypted: true, rotatable: true, category: 'api', description: 'Replicate AI model API token' },
  
  // Payment Processing
  { name: 'STRIPE_SECRET_KEY', required: true, encrypted: true, rotatable: true, category: 'payment', description: 'Stripe payment processing secret key' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: true, encrypted: true, rotatable: true, category: 'payment', description: 'Stripe webhook endpoint secret' },
  { name: 'RAZORPAY_KEY_ID', required: false, category: 'payment', description: 'Razorpay payment gateway key ID' },
  { name: 'RAZORPAY_KEY_SECRET', required: false, encrypted: true, rotatable: true, category: 'payment', description: 'Razorpay payment gateway secret' },
  
  // Email Services
  { name: 'SENDGRID_API_KEY', required: true, encrypted: true, rotatable: true, category: 'email', description: 'SendGrid email delivery API key' },
  
  // Encryption & Security
  { name: 'TOKEN_ENCRYPTION_KEY', required: process.env.NODE_ENV === 'production', encrypted: true, rotatable: true, category: 'encryption', description: 'AES-256-GCM key for token encryption' },
  { name: 'JWT_SECRET', required: false, encrypted: true, rotatable: true, category: 'encryption', description: 'JWT signing secret' },
  
  // Application Configuration
  { name: 'NODE_ENV', required: true, category: 'api', description: 'Node.js environment (development/production)' },
  { name: 'REPLIT_DEV_DOMAIN', required: false, category: 'api', description: 'Replit development domain for CORS' },
  { name: 'ALLOWED_ORIGINS', required: false, category: 'api', description: 'Additional CORS allowed origins' },
  { name: 'CORS_EMERGENCY_LOCKDOWN', required: false, category: 'api', description: 'Emergency CORS lockdown flag' }
];

/**
 * P1-6.1: Audit and validate all environment variables
 */
export function auditEnvironmentVariables(): {
  missing: string[];
  present: string[];
  warnings: string[];
  recommendations: string[];
} {
  const missing: string[] = [];
  const present: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  console.log('🔍 P1-6.1: Starting comprehensive environment variable audit...');
  
  for (const secret of SECRETS_INVENTORY) {
    const value = process.env[secret.name];
    
    if (secret.required && !value) {
      missing.push(secret.name);
      // Only log missing secrets on first audit or every 5 minutes
      if (Date.now() - lastAuditLog > 300000) {
        console.error(`❌ MISSING REQUIRED SECRET: ${secret.name} - ${secret.description}`);
      }
    } else if (value) {
      present.push(secret.name);
      
      // Security validation
      if (secret.encrypted && secret.name.includes('SECRET') && value.length < 32) {
        warnings.push(`${secret.name}: Secret appears too short for production security`);
      }
      
      if (secret.rotatable && !secret.name.includes('_ROTATED_')) {
        recommendations.push(`${secret.name}: Consider implementing automatic rotation`);
      }
    } else {
      // Only log optional missing secrets on startup
      if (Date.now() - lastAuditLog > 300000) {
        console.log(`ℹ️ OPTIONAL SECRET MISSING: ${secret.name} - ${secret.description}`);
      }
    }
  }
  
  // Check for unknown environment variables that might contain secrets
  const knownSecrets = new Set(SECRETS_INVENTORY.map(s => s.name));
  const suspiciousEnvVars = Object.keys(process.env).filter(key => 
    (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN') || key.includes('PASSWORD')) &&
    !knownSecrets.has(key)
  );
  
  if (suspiciousEnvVars.length > 0) {
    warnings.push(`Unknown secret-like environment variables detected: ${suspiciousEnvVars.join(', ')}`);
  }
  
  // Rate limited audit logging to prevent console spam
  if (Date.now() - lastAuditLog > 300000) { // Only log every 5 minutes
    console.log(`🔍 SECRETS AUDIT: ${present.length} present, ${missing.length} missing`);
    
    if (missing.length > 0) {
      console.warn(`🚨 MISSING SECRETS: ${missing.join(', ')}`);
    }
    
    if (warnings.length > 0) {
      console.warn(`🚨 KEY MANAGEMENT WARNINGS:\n  - ${warnings.join('\n  - ')}`);
    }
    
    if (recommendations.length > 0) {
      console.log(`💡 KEY MANAGEMENT RECOMMENDATIONS:\n  - ${recommendations.join('\n  - ')}`);
    }
    
    lastAuditLog = Date.now();
  }
  
  return { missing, present, warnings, recommendations };
}

/**
 * P1-6.2: Enhanced token encryption for social media integrations
 */
export class SecureTokenManager {
  private encryptionKey: Buffer;
  
  constructor() {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) {
      if (Date.now() - lastAuditLog > 300000) {
        console.warn('🚨 TOKEN_ENCRYPTION_KEY not set - generating temporary key');
      }
      // Generate a secure random key for development
      this.encryptionKey = randomBytes(32);
    } else {
      // Use provided key or derive from string
      this.encryptionKey = key.length === 64 
        ? Buffer.from(key, 'hex')
        : createHash('sha256').update(key).digest();
    }
  }
  
  /**
   * P1-6.2: Encrypt sensitive tokens with AES-256-GCM
   */
  async encryptToken(token: string, metadata?: any): Promise<{
    encryptedToken: string;
    iv: string;
    authTag: string;
    metadata?: any;
    encryptedAt: string;
  }> {
    try {
      const { createCipher } = await import('crypto');
      const iv = randomBytes(16);
      const cipher = createCipher('aes-256-gcm', this.encryptionKey);
      cipher.setAAD(iv);
      
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      
      return {
        encryptedToken: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        metadata,
        encryptedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ TOKEN ENCRYPTION ERROR:', error);
      throw new Error('Failed to encrypt token');
    }
  }
  
  /**
   * P1-6.2: Decrypt tokens with integrity verification
   */
  async decryptToken(encryptedData: {
    encryptedToken: string;
    iv: string;
    authTag: string;
  }): Promise<string> {
    try {
      const { createDecipher } = await import('crypto');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      
      const decipher = createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAAD(iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData.encryptedToken, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('❌ TOKEN DECRYPTION ERROR:', error);
      throw new Error('Failed to decrypt token - data may be corrupted');
    }
  }
  
  /**
   * P1-6.2: Check if token needs rotation based on age
   */
  shouldRotateToken(encryptedAt: string, rotationIntervalDays: number = 30): boolean {
    const encryptedDate = new Date(encryptedAt);
    const daysSinceEncryption = (Date.now() - encryptedDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceEncryption > rotationIntervalDays;
  }
}

/**
 * P1-6.3: Key rotation automation
 */
export class KeyRotationManager {
  private tokenManager: SecureTokenManager;
  
  constructor() {
    this.tokenManager = new SecureTokenManager();
  }
  
  /**
   * P1-6.3: Schedule automatic key rotation
   */
  initializeKeyRotation() {
    // Run key rotation check every 24 hours
    setInterval(async () => {
      await this.performRotationCheck();
    }, 24 * 60 * 60 * 1000);
    
    console.log('🔄 KEY ROTATION: Automatic rotation scheduler initialized');
  }
  
  /**
   * P1-6.3: Check which keys need rotation
   */
  private async performRotationCheck() {
    console.log('🔄 KEY ROTATION: Performing rotation check...');
    
    const rotatableSecrets = SECRETS_INVENTORY.filter(s => s.rotatable);
    
    for (const secret of rotatableSecrets) {
      const value = process.env[secret.name];
      if (value && this.shouldRotateSecret(secret.name)) {
        console.warn(`🔄 KEY ROTATION: ${secret.name} needs rotation`);
        await this.rotateSecret(secret.name, secret.category);
      }
    }
  }
  
  /**
   * P1-6.3: Determine if a secret needs rotation
   */
  private shouldRotateSecret(secretName: string): boolean {
    const rotationKey = `${secretName}_LAST_ROTATED`;
    const lastRotated = process.env[rotationKey];
    
    if (!lastRotated) {
      return true; // Never rotated
    }
    
    const lastRotatedDate = new Date(lastRotated);
    const daysSinceRotation = (Date.now() - lastRotatedDate.getTime()) / (1000 * 60 * 60 * 24);
    
    // Different rotation intervals by category
    const rotationIntervals: Record<string, number> = {
      'oauth': 90,      // 3 months
      'api': 60,        // 2 months  
      'payment': 30,    // 1 month
      'encryption': 90, // 3 months
      'email': 180,     // 6 months
      'database': 90,   // 3 months
      'storage': 180    // 6 months
    };
    
    const secret = SECRETS_INVENTORY.find(s => s.name === secretName);
    const interval = secret ? rotationIntervals[secret.category] || 90 : 90;
    
    return daysSinceRotation > interval;
  }
  
  /**
   * P1-6.3: Rotate a specific secret
   */
  private async rotateSecret(secretName: string, category: string) {
    console.log(`🔄 KEY ROTATION: Rotating ${secretName}...`);
    
    try {
      // Log rotation event for audit trail
      console.log(`🔄 KEY ROTATION: ${secretName} rotation initiated at ${new Date().toISOString()}`);
      
      // For now, log the rotation requirement - actual rotation would need service-specific logic
      console.warn(`🔄 KEY ROTATION: Manual rotation required for ${secretName} (${category})`);
      
      // In production, this would trigger service-specific rotation logic:
      // - OAuth tokens: Refresh using refresh tokens
      // - API keys: Generate new keys via service APIs
      // - Encryption keys: Generate new keys and re-encrypt data
      
    } catch (error) {
      console.error(`❌ KEY ROTATION ERROR for ${secretName}:`, error);
    }
  }
}

/**
 * P1-6.4: Secrets validation middleware
 */
export function secretsValidationMiddleware() {
  return (req: any, res: any, next: any) => {
    // Add secrets audit info to request for monitoring
    req.secretsAudit = auditEnvironmentVariables();
    
    // Warn about missing critical secrets
    if (req.secretsAudit.missing.length > 0) {
      console.warn(`🚨 SECRETS: ${req.secretsAudit.missing.length} required secrets missing`);
    }
    
    next();
  };
}

/**
 * P1-6: Security headers for key management
 */
export function keyManagementHeaders() {
  return (req: any, res: any, next: any) => {
    // Additional security headers for endpoints handling sensitive data
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.header('X-Key-Management', 'protected');
    
    next();
  };
}

/**
 * P1-6: Initialize complete key management system
 */
export function initializeKeyManagement() {
  console.log('🔐 P1-6: Initializing comprehensive key management system...');
  
  // Perform initial audit
  const audit = auditEnvironmentVariables();
  
  // Initialize token manager
  const tokenManager = new SecureTokenManager();
  
  // Initialize rotation manager
  const rotationManager = new KeyRotationManager();
  rotationManager.initializeKeyRotation();
  
  // Report status
  console.log('🔐 KEY MANAGEMENT: System initialized successfully');
  console.log(`🔐 SECRETS STATUS: ${audit.present.length} present, ${audit.missing.length} missing`);
  
  if (audit.warnings.length > 0) {
    console.warn('🚨 KEY MANAGEMENT WARNINGS:');
    audit.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
  
  if (audit.recommendations.length > 0) {
    console.log('💡 KEY MANAGEMENT RECOMMENDATIONS:');
    audit.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
  
  return { audit, tokenManager, rotationManager };
}