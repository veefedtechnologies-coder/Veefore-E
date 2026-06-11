import crypto from 'crypto';
import { Request } from 'express';

/**
 * StateValidator provides CSRF protection for OAuth 2.0 flows through state parameter validation.
 * 
 * The state parameter is a cryptographically secure random value that:
 * - Prevents CSRF attacks by validating request authenticity
 * - Enforces single-use to prevent replay attacks
 * - Has a 10-minute expiration to limit exposure window
 * - Is tied to the user's session to prevent session fixation
 * 
 * Security Properties:
 * - State values are 64 characters (32 bytes hex-encoded)
 * - Generated using crypto.randomBytes for cryptographic randomness
 * - Automatically deleted after successful validation (single-use)
 * - Stored with expiration timestamp for automatic timeout
 * 
 * Requirements: 1.2, 2.2, 2.3, 2.4, 17.2, 17.4, 17.11
 */

/**
 * OAuth session data structure stored in Express session
 */
interface OAuthSession {
  state: string;                  // CSRF protection token
  codeVerifier: string;          // PKCE code verifier
  createdAt: number;             // Unix timestamp (milliseconds)
  expiresAt: number;             // Unix timestamp (milliseconds)
  correlationId?: string;        // For logging and debugging
}

/**
 * State validation result object
 * Returned by validateState() to provide atomic validation with code_verifier retrieval
 * This prevents race conditions from ordering dependencies
 */
interface StateValidationResult {
  isValid: boolean;              // Whether state validation succeeded
  codeVerifier: string | null;   // PKCE code verifier (null if validation failed)
  error?: string;                // Error message if validation failed
}

/**
 * Extended Express Request with typed OAuth session
 */
interface OAuthRequest extends Request {
  session: Request['session'] & {
    oauth?: OAuthSession;
  };
  correlationId?: string;
}

/**
 * StateValidator class for OAuth 2.0 state parameter validation
 */
export class StateValidator {
  /**
   * State expiration time in milliseconds (10 minutes)
   * Requirement 1.4, 2.4, 17.4
   */
  private static readonly STATE_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * State parameter length in bytes (before hex encoding)
   * Results in 64-character hex string
   * Requirement 1.2, 17.2, 17.4
   */
  private static readonly STATE_BYTES = 32;

  /**
   * Generate a cryptographically secure random state parameter
   * 
   * Uses crypto.randomBytes to generate a 32-byte random value,
   * then encodes it as a 64-character hexadecimal string.
   * 
   * Security: Uses cryptographically secure random number generation
   * to prevent state parameter guessing attacks.
   * 
   * @returns A 64-character hexadecimal state parameter
   * @throws Error if crypto.randomBytes fails
   * 
   * Requirement 1.2: Generate random state parameter of at least 32 characters (generates 64)
   * Requirement 17.2: Use cryptographically secure random number generation
   */
  generateState(): string {
    try {
      return crypto.randomBytes(StateValidator.STATE_BYTES).toString('hex');
    } catch (error) {
      throw new Error(`Failed to generate state parameter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store state parameter and PKCE code verifier in session
   * 
   * Creates an OAuth session object with:
   * - State parameter for CSRF protection
   * - PKCE code verifier for token exchange
   * - Timestamps for expiration checking
   * - Optional correlation ID for request tracking
   * 
   * The session expires after 10 minutes to limit the exposure window
   * and prevent stale state parameters from being used.
   * 
   * **Concurrent Flow Protection (Fix 7 - Bug 1.14, 1.15)**:
   * This method now detects concurrent OAuth flows for the same session.
   * When a new OAuth flow is initiated while another is in progress (not expired),
   * an error is thrown to prevent session data corruption. This ensures that:
   * - Second flow doesn't silently overwrite first flow's state/code_verifier
   * - Users get clear feedback about concurrent flow attempts
   * - State validation failures are prevented
   * 
   * @param req - Express request object with session
   * @param state - Generated state parameter
   * @param codeVerifier - PKCE code verifier
   * @throws Error if session is not available
   * @throws Error if a concurrent OAuth flow is detected
   * 
   * Requirement 1.4: Store state and code_verifier in session with 10-minute TTL
   * Requirement 17.4: State parameters expire after 10 minutes
   * Requirement 2.14: Prevent concurrent OAuth flows for the same session
   * Requirement 2.15: Reject new flow when existing flow is in progress
   */
  storeState(req: OAuthRequest, state: string, codeVerifier: string): void {
    if (!req.session) {
      throw new Error('Session is not available');
    }

    const now = Date.now();
    
    // CONCURRENT FLOW PROTECTION (Fix 7)
    // Check if an OAuth flow is already in progress
    if (req.session.oauth) {
      const existingSession = req.session.oauth;
      
      // Check if existing flow is still valid (not expired)
      if (existingSession.expiresAt && now < existingSession.expiresAt) {
        // Active OAuth flow detected - reject concurrent flow
        throw new Error(
          'Concurrent OAuth flow detected. Another OAuth flow is already in progress for this session. ' +
          'Please complete or wait for the existing flow to expire before initiating a new one.'
        );
      }
      
      // If existing flow is expired, allow overwrite (automatic cleanup)
      // This handles abandoned flows that exceeded their TTL
    }
    
    req.session.oauth = {
      state,
      codeVerifier,
      createdAt: now,
      expiresAt: now + StateValidator.STATE_EXPIRATION_MS,
      correlationId: req.correlationId,
    };
  }

  /**
   * Validate state parameter from OAuth callback
   * 
   * Performs comprehensive validation with atomic code_verifier retrieval:
   * 1. Checks if OAuth session exists
   * 2. Validates state has not expired (10-minute window)
   * 3. Compares received state with stored state (CSRF check)
   * 4. Retrieves code_verifier BEFORE clearing session (atomic operation)
   * 5. Deletes session after validation (single-use enforcement)
   * 
   * Security: The state parameter is single-use and automatically
   * deleted after validation to prevent replay attacks. The code_verifier
   * is retrieved atomically to prevent race conditions from order dependencies.
   * 
   * @param req - Express request object with session
   * @param receivedState - State parameter from OAuth callback
   * @returns StateValidationResult with validation status, code_verifier, and optional error
   * 
   * Requirement 2.2: Retrieve stored state from session
   * Requirement 2.3: Return 403 if state does not match
   * Requirement 2.4: Return 403 if state is expired or not found
   * Requirement 17.11: State parameters are used exactly once
   * Fix 1 (Bug 1.1, 1.2): Return both validation result and code_verifier atomically
   */
  validateState(req: OAuthRequest, receivedState: string): StateValidationResult {
    const session = req.session?.oauth;
    
    // Check if OAuth session exists
    if (!session) {
      return {
        isValid: false,
        codeVerifier: null,
        error: 'State expired or invalid',
      };
    }
    
    // Check if state has expired
    if (Date.now() > session.expiresAt) {
      // Clean up expired session
      delete req.session.oauth;
      return {
        isValid: false,
        codeVerifier: null,
        error: 'State expired',
      };
    }
    
    // Validate state parameter matches
    if (session.state !== receivedState) {
      // Don't delete session yet - may be attack attempt
      return {
        isValid: false,
        codeVerifier: null,
        error: 'Invalid state parameter',
      };
    }
    
    // ATOMIC OPERATION: Retrieve code_verifier BEFORE clearing session
    // This prevents race conditions where the session is deleted before
    // the code_verifier can be retrieved, making the API order-independent
    const codeVerifier = session.codeVerifier;
    
    // State is single-use - clear after successful validation
    // This prevents replay attacks where an attacker reuses a valid state
    delete req.session.oauth;
    
    return {
      isValid: true,
      codeVerifier,
    };
  }

  /**
   * Retrieve the stored code verifier from session
   * 
   * @deprecated This method is deprecated as of Fix 1 (Bug 1.1, 1.2).
   * Use the atomic validateState() method instead, which returns both
   * validation result and code_verifier in a single operation.
   * 
   * This method has an order dependency with validateState() since
   * validateState() deletes the OAuth session. The atomic API
   * eliminates this fragile ordering requirement.
   * 
   * Migration:
   * ```typescript
   * // Old approach (deprecated):
   * const codeVerifier = stateValidator.getCodeVerifier(req);
   * const isValid = stateValidator.validateState(req, state);
   * 
   * // New approach (recommended):
   * const result = stateValidator.validateState(req, state);
   * if (result.isValid) {
   *   const codeVerifier = result.codeVerifier;
   * }
   * ```
   * 
   * @param req - Express request object with session
   * @returns The stored code verifier, or null if not found
   */
  getCodeVerifier(req: OAuthRequest): string | null {
    return req.session?.oauth?.codeVerifier ?? null;
  }

  /**
   * Clear OAuth session data
   * 
   * Manually clears the OAuth session. Useful for cleanup
   * in error scenarios or when aborting the OAuth flow.
   * 
   * @param req - Express request object with session
   */
  clearOAuthSession(req: OAuthRequest): void {
    if (req.session?.oauth) {
      delete req.session.oauth;
    }
  }
}

/**
 * Export singleton instance for convenience
 * Most use cases can use this shared instance
 */
export const stateValidator = new StateValidator();

/**
 * Export type definitions for use by route handlers
 */
export type { OAuthSession, OAuthRequest, StateValidationResult };
