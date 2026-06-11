import crypto from 'crypto';
import { Response, Request } from 'express';

/**
 * SessionManager - Middleware for managing HTTP-only secure session cookies
 * 
 * This class handles secure cookie management for OAuth authentication:
 * - Creates signed cookies with security attributes (HttpOnly, Secure, SameSite)
 * - Signs cookies using HMAC-SHA256 to prevent tampering
 * - Verifies cookie signatures with constant-time comparison
 * - Manages cookie lifecycle (set, get, clear)
 * 
 * Security features:
 * - HMAC-SHA256 signing prevents cookie tampering
 * - Constant-time comparison prevents timing attacks
 * - HttpOnly prevents JavaScript access (XSS protection)
 * - Secure ensures HTTPS-only transmission (in production)
 * - SameSite=Strict prevents CSRF attacks
 */
class SessionManager {
  private secret: Buffer;
  
  /**
   * Initialize SessionManager with SESSION_SECRET validation
   * 
   * @throws {Error} If SESSION_SECRET is not set or less than 32 characters
   * 
   * Security: SESSION_SECRET must be at least 32 characters (256 bits) to provide
   * sufficient entropy for HMAC-SHA256 signing.
   */
  constructor() {
    const sessionSecret = process.env.SESSION_SECRET;
    
    // Validate SESSION_SECRET exists
    if (!sessionSecret) {
      throw new Error('SESSION_SECRET environment variable is required');
    }
    
    // Validate SESSION_SECRET length (minimum 32 characters for security)
    if (sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters');
    }
    
    // Convert to buffer for HMAC operations
    this.secret = Buffer.from(sessionSecret, 'utf8');
  }
  
  /**
   * Set authentication cookie with all required security attributes
   * 
   * @param res - Express response object
   * @param token - Firebase custom token or session data to store
   * 
   * Cookie attributes:
   * - httpOnly: true - Prevents JavaScript access (XSS protection)
   * - secure: true in production - HTTPS-only transmission
   * - sameSite: 'strict' - Prevents CSRF attacks
   * - maxAge: 3600000ms (1 hour) - Matches Firebase token expiry
   * - path: '/' - Available to all application routes
   * - domain: Set in production for subdomain sharing
   * 
   * The token is signed using HMAC-SHA256 before storage to prevent tampering.
   */
  setAuthCookie(res: Response, token: string): void {
    // Sign the token to prevent tampering
    const signedToken = this.signCookie(token);
    
    // Define cookie options with security attributes
    const cookieOptions = {
      httpOnly: true,  // Requirement 5.1: Prevents JavaScript access
      secure: process.env.NODE_ENV === 'production',  // Requirement 5.2: HTTPS-only in production
      sameSite: 'strict' as const,  // Requirement 5.3: CSRF protection
      maxAge: 3600000,  // Requirement 5.5: 1 hour (3600 seconds * 1000ms)
      path: '/',  // Requirement 5.4: Available to all routes
      domain: process.env.NODE_ENV === 'production' 
        ? process.env.COOKIE_DOMAIN 
        : undefined,  // Requirement 5.6: Set domain in production
    };
    
    // Set the signed cookie
    res.cookie('auth_token', signedToken, cookieOptions);
  }
  
  /**
   * Clear authentication and session cookies
   * 
   * @param res - Express response object
   * 
   * Clears cookies by setting Max-Age to 0, which instructs the browser
   * to immediately delete the cookies.
   */
  clearAuthCookies(res: Response): void {
    const clearOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 0,  // Set to 0 to clear the cookie
      path: '/',
      domain: process.env.NODE_ENV === 'production' 
        ? process.env.COOKIE_DOMAIN 
        : undefined,
    };
    
    // Clear auth_token cookie (Requirement 7.2)
    res.cookie('auth_token', '', clearOptions);
    
    // Clear session cookie if it exists (Requirement 7.3)
    res.cookie('session', '', clearOptions);
  }
  
  /**
   * Get authentication token from request cookies
   * 
   * @param req - Express request object
   * @returns Verified token value or null if invalid/missing
   * 
   * This method retrieves the auth_token cookie and verifies its signature.
   * Returns null if the cookie is missing, malformed, or has an invalid signature.
   */
  getAuthToken(req: Request): string | null {
    const signedToken = req.cookies?.auth_token;
    
    if (!signedToken) {
      return null;
    }
    
    // Verify the cookie signature and return the original value
    return this.verifyCookie(signedToken);
  }
  
  /**
   * Sign a cookie value using HMAC-SHA256
   * 
   * @param value - Cookie value to sign
   * @returns Signed value in format: value.signature
   * 
   * Security: HMAC-SHA256 provides cryptographic authentication that prevents
   * tampering. The signature is computed over the value using SESSION_SECRET.
   * 
   * Format: "{value}.{hex_signature}"
   * Example: "token123.a1b2c3d4..."
   */
  signCookie(value: string): string {
    // Create HMAC instance with SHA-256 algorithm
    const hmac = crypto.createHmac('sha256', this.secret);
    
    // Update HMAC with the value to sign
    hmac.update(value);
    
    // Generate signature as hex string
    const signature = hmac.digest('hex');
    
    // Return signed value: value.signature (Requirement 5.7)
    return `${value}.${signature}`;
  }
  
  /**
   * Verify cookie signature and return original value
   * 
   * @param signedValue - Signed cookie value in format: value.signature
   * @returns Original value if signature is valid, null otherwise
   * 
   * Security: Uses constant-time comparison to prevent timing attacks.
   * Timing attacks could potentially allow attackers to guess signatures
   * by measuring verification time differences.
   * 
   * crypto.timingSafeEqual ensures that signature comparison takes the same
   * amount of time regardless of where the mismatch occurs.
   */
  verifyCookie(signedValue: string): string | null {
    // Split signed value into value and signature parts
    const parts = signedValue.split('.');
    
    // Validate format: must have exactly 2 parts (value.signature)
    if (parts.length !== 2) {
      return null;
    }
    
    const [value, signature] = parts;
    
    // Recompute the expected signature
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(value);
    const expectedSignature = hmac.digest('hex');
    
    // Convert both signatures to buffers for constant-time comparison
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');
    
    // Validate that both signatures have the same length
    if (signatureBuffer.length !== expectedSignatureBuffer.length) {
      return null;
    }
    
    // Constant-time comparison to prevent timing attacks
    // This ensures verification time doesn't leak information about the signature
    try {
      if (!crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) {
        return null;
      }
    } catch (error) {
      // timingSafeEqual throws if buffers are different lengths (already checked above)
      return null;
    }
    
    // Signature is valid, return the original value
    return value;
  }
}

// Export singleton instance
export default new SessionManager();
