import { StateValidator, OAuthRequest } from '../StateValidator';

/**
 * Unit tests for StateValidator class
 * 
 * Tests cover:
 * - State generation (uniqueness, length, format)
 * - State storage in session
 * - State validation (success, expired, missing, mismatched)
 * - Single-use enforcement
 * - Code verifier retrieval
 * - Session cleanup
 * 
 * Requirements tested: 1.2, 1.4, 2.2, 2.3, 2.4, 17.2, 17.4, 17.11
 */

describe('StateValidator', () => {
  let validator: StateValidator;

  beforeEach(() => {
    validator = new StateValidator();
  });

  describe('generateState', () => {
    it('should generate a state parameter of at least 32 characters', () => {
      // Requirement 1.2: Generate random state parameter of at least 32 characters
      const state = validator.generateState();
      
      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThanOrEqual(32);
    });

    it('should generate a 64-character hexadecimal string', () => {
      // Generated from 32 bytes -> 64 hex characters
      const state = validator.generateState();
      
      expect(state.length).toBe(64);
      expect(state).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique state parameters', () => {
      // Requirement 17.2: Use cryptographically secure random number generation
      const states = new Set<string>();
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const state = validator.generateState();
        states.add(state);
      }
      
      // All states should be unique
      expect(states.size).toBe(iterations);
    });

    it('should generate different states on consecutive calls', () => {
      const state1 = validator.generateState();
      const state2 = validator.generateState();
      
      expect(state1).not.toBe(state2);
    });
  });

  describe('storeState', () => {
    it('should store state and code verifier in session', () => {
      // Requirement 1.4: Store state and code_verifier in session
      const mockReq = createMockRequest();
      const state = 'test-state-123';
      const codeVerifier = 'test-code-verifier-456';
      
      validator.storeState(mockReq, state, codeVerifier);
      
      expect(mockReq.session.oauth).toBeDefined();
      expect(mockReq.session.oauth?.state).toBe(state);
      expect(mockReq.session.oauth?.codeVerifier).toBe(codeVerifier);
    });

    it('should store timestamps for expiration tracking', () => {
      const mockReq = createMockRequest();
      const beforeTime = Date.now();
      
      validator.storeState(mockReq, 'state', 'verifier');
      
      const afterTime = Date.now();
      const oauth = mockReq.session.oauth!;
      
      expect(oauth.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(oauth.createdAt).toBeLessThanOrEqual(afterTime);
      expect(oauth.expiresAt).toBeGreaterThan(oauth.createdAt);
    });

    it('should set expiration to 10 minutes in the future', () => {
      // Requirement 17.4: State parameters expire after 10 minutes
      const mockReq = createMockRequest();
      const tenMinutesMs = 10 * 60 * 1000;
      
      validator.storeState(mockReq, 'state', 'verifier');
      
      const oauth = mockReq.session.oauth!;
      const expirationDuration = oauth.expiresAt - oauth.createdAt;
      
      expect(expirationDuration).toBe(tenMinutesMs);
    });

    it('should store correlation ID if present', () => {
      const mockReq = createMockRequest();
      mockReq.correlationId = 'test-correlation-id';
      
      validator.storeState(mockReq, 'state', 'verifier');
      
      expect(mockReq.session.oauth?.correlationId).toBe('test-correlation-id');
    });

    it('should throw error if session is not available', () => {
      const mockReq = { session: null } as any as OAuthRequest;
      
      expect(() => {
        validator.storeState(mockReq, 'state', 'verifier');
      }).toThrow('Session is not available');
    });

    it('should overwrite existing OAuth session', () => {
      const mockReq = createMockRequest();
      
      // Store first session
      validator.storeState(mockReq, 'state1', 'verifier1');
      const firstState = mockReq.session.oauth?.state;
      
      // Store second session (should overwrite)
      validator.storeState(mockReq, 'state2', 'verifier2');
      const secondState = mockReq.session.oauth?.state;
      
      expect(firstState).toBe('state1');
      expect(secondState).toBe('state2');
      expect(mockReq.session.oauth?.codeVerifier).toBe('verifier2');
    });
  });

  describe('validateState', () => {
    it('should return true for valid state parameter', () => {
      // Requirement 2.2: Retrieve stored state from session
      const mockReq = createMockRequest();
      const state = 'valid-state-parameter';
      
      validator.storeState(mockReq, state, 'verifier');
      
      const result = validator.validateState(mockReq, state);
      
      expect(result).toBe(true);
    });

    it('should throw error if OAuth session does not exist', () => {
      // Requirement 2.4: Return 403 if state is not found in session
      const mockReq = createMockRequest();
      // No state stored in session
      
      expect(() => {
        validator.validateState(mockReq, 'any-state');
      }).toThrow('State expired or invalid');
    });

    it('should throw error if state has expired', () => {
      // Requirement 2.4: Return 403 if state is expired
      const mockReq = createMockRequest();
      const state = 'expired-state';
      
      // Store state with manual expiration in the past
      mockReq.session.oauth = {
        state,
        codeVerifier: 'verifier',
        createdAt: Date.now() - 20 * 60 * 1000, // 20 minutes ago
        expiresAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago (expired)
      };
      
      expect(() => {
        validator.validateState(mockReq, state);
      }).toThrow('State expired');
    });

    it('should throw error if state parameter does not match', () => {
      // Requirement 2.3: Return 403 if state does not match
      const mockReq = createMockRequest();
      
      validator.storeState(mockReq, 'correct-state', 'verifier');
      
      expect(() => {
        validator.validateState(mockReq, 'wrong-state');
      }).toThrow('Invalid state parameter');
    });

    it('should delete OAuth session after successful validation (single-use)', () => {
      // Requirement 17.11: State parameters are used exactly once
      const mockReq = createMockRequest();
      const state = 'single-use-state';
      
      validator.storeState(mockReq, state, 'verifier');
      
      // First validation should succeed
      expect(validator.validateState(mockReq, state)).toBe(true);
      
      // OAuth session should be deleted
      expect(mockReq.session.oauth).toBeUndefined();
    });

    it('should prevent replay attacks by rejecting second validation', () => {
      // Requirement 17.11: Single-use enforcement prevents replay attacks
      const mockReq = createMockRequest();
      const state = 'replay-attack-state';
      
      validator.storeState(mockReq, state, 'verifier');
      
      // First validation succeeds
      validator.validateState(mockReq, state);
      
      // Second validation with same state should fail
      expect(() => {
        validator.validateState(mockReq, state);
      }).toThrow('State expired or invalid');
    });

    it('should clean up expired session when validation fails', () => {
      const mockReq = createMockRequest();
      
      // Create expired session
      mockReq.session.oauth = {
        state: 'expired',
        codeVerifier: 'verifier',
        createdAt: Date.now() - 20 * 60 * 1000,
        expiresAt: Date.now() - 10 * 60 * 1000,
      };
      
      expect(() => {
        validator.validateState(mockReq, 'expired');
      }).toThrow('State expired');
      
      // Session should be cleaned up
      expect(mockReq.session.oauth).toBeUndefined();
    });

    it('should not delete session on state mismatch (potential attack)', () => {
      const mockReq = createMockRequest();
      
      validator.storeState(mockReq, 'correct-state', 'verifier');
      
      expect(() => {
        validator.validateState(mockReq, 'attacker-state');
      }).toThrow('Invalid state parameter');
      
      // Session should still exist for investigation
      expect(mockReq.session.oauth).toBeDefined();
      expect(mockReq.session.oauth?.state).toBe('correct-state');
    });
  });

  describe('getCodeVerifier', () => {
    it('should return stored code verifier', () => {
      const mockReq = createMockRequest();
      const codeVerifier = 'test-code-verifier-789';
      
      validator.storeState(mockReq, 'state', codeVerifier);
      
      const retrieved = validator.getCodeVerifier(mockReq);
      
      expect(retrieved).toBe(codeVerifier);
    });

    it('should return null if OAuth session does not exist', () => {
      const mockReq = createMockRequest();
      
      const retrieved = validator.getCodeVerifier(mockReq);
      
      expect(retrieved).toBeNull();
    });

    it('should return null after state validation (session deleted)', () => {
      const mockReq = createMockRequest();
      const state = 'state';
      const codeVerifier = 'verifier';
      
      validator.storeState(mockReq, state, codeVerifier);
      validator.validateState(mockReq, state); // Deletes session
      
      const retrieved = validator.getCodeVerifier(mockReq);
      
      expect(retrieved).toBeNull();
    });

    it('should be called BEFORE validateState to retrieve verifier', () => {
      // Best practice: Get code verifier before validation
      const mockReq = createMockRequest();
      const state = 'state';
      const codeVerifier = 'verifier-123';
      
      validator.storeState(mockReq, state, codeVerifier);
      
      // Get verifier BEFORE validation
      const retrieved = validator.getCodeVerifier(mockReq);
      
      // Then validate (which deletes session)
      validator.validateState(mockReq, state);
      
      expect(retrieved).toBe(codeVerifier);
      expect(mockReq.session.oauth).toBeUndefined();
    });
  });

  describe('clearOAuthSession', () => {
    it('should clear OAuth session data', () => {
      const mockReq = createMockRequest();
      
      validator.storeState(mockReq, 'state', 'verifier');
      expect(mockReq.session.oauth).toBeDefined();
      
      validator.clearOAuthSession(mockReq);
      
      expect(mockReq.session.oauth).toBeUndefined();
    });

    it('should not throw if OAuth session does not exist', () => {
      const mockReq = createMockRequest();
      
      expect(() => {
        validator.clearOAuthSession(mockReq);
      }).not.toThrow();
    });

    it('should not throw if session is null', () => {
      const mockReq = { session: null } as any as OAuthRequest;
      
      expect(() => {
        validator.clearOAuthSession(mockReq);
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string state parameter', () => {
      const mockReq = createMockRequest();
      
      validator.storeState(mockReq, '', 'verifier');
      
      expect(() => {
        validator.validateState(mockReq, 'non-empty');
      }).toThrow('Invalid state parameter');
    });

    it('should handle very long state parameters', () => {
      const mockReq = createMockRequest();
      const longState = 'a'.repeat(1000);
      
      validator.storeState(mockReq, longState, 'verifier');
      
      expect(validator.validateState(mockReq, longState)).toBe(true);
    });

    it('should handle special characters in state', () => {
      const mockReq = createMockRequest();
      const specialState = '!@#$%^&*()_+-={}[]|:;<>?,./';
      
      validator.storeState(mockReq, specialState, 'verifier');
      
      expect(validator.validateState(mockReq, specialState)).toBe(true);
    });

    it('should validate state exactly at expiration boundary', () => {
      const mockReq = createMockRequest();
      const state = 'boundary-state';
      const now = Date.now();
      
      // Create session that expires 1ms in the future (still valid)
      mockReq.session.oauth = {
        state,
        codeVerifier: 'verifier',
        createdAt: now - 10 * 60 * 1000,
        expiresAt: now + 1, // Expires 1ms in future
      };
      
      // Should still be valid (now <= expiresAt)
      expect(validator.validateState(mockReq, state)).toBe(true);
    });

    it('should reject state 1ms after expiration', () => {
      const mockReq = createMockRequest();
      const state = 'expired-boundary-state';
      const now = Date.now();
      
      // Create session that expired 1ms ago
      mockReq.session.oauth = {
        state,
        codeVerifier: 'verifier',
        createdAt: now - 10 * 60 * 1000,
        expiresAt: now - 1, // Expired 1ms ago
      };
      
      // Should be expired (now > expiresAt)
      expect(() => {
        validator.validateState(mockReq, state);
      }).toThrow('State expired');
    });

    it('should handle missing session property gracefully', () => {
      const mockReq = {} as OAuthRequest;
      
      expect(() => {
        validator.validateState(mockReq, 'any-state');
      }).toThrow('State expired or invalid');
    });
  });

  describe('security properties', () => {
    it('should generate cryptographically random states', () => {
      // Test that states have high entropy and are not predictable
      const states: string[] = [];
      
      for (let i = 0; i < 10; i++) {
        states.push(validator.generateState());
      }
      
      // Check all are unique
      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(states.length);
      
      // Check no obvious patterns (all should be different lengths would indicate pattern)
      const lengths = states.map(s => s.length);
      const allSameLength = lengths.every(l => l === lengths[0]);
      expect(allSameLength).toBe(true); // All should be 64 chars
    });

    it('should enforce time-based expiration (10 minutes)', () => {
      const mockReq = createMockRequest();
      const tenMinutesMs = 10 * 60 * 1000;
      
      validator.storeState(mockReq, 'state', 'verifier');
      
      const oauth = mockReq.session.oauth!;
      const actualExpiration = oauth.expiresAt - oauth.createdAt;
      
      expect(actualExpiration).toBe(tenMinutesMs);
    });

    it('should prevent session fixation by tying state to session', () => {
      // Each request has its own session
      const mockReq1 = createMockRequest();
      const mockReq2 = createMockRequest();
      
      const state1 = 'session1-state';
      const state2 = 'session2-state';
      
      validator.storeState(mockReq1, state1, 'verifier1');
      validator.storeState(mockReq2, state2, 'verifier2');
      
      // State from session 1 should not validate in session 2
      expect(() => {
        validator.validateState(mockReq2, state1);
      }).toThrow('Invalid state parameter');
      
      // State from session 2 should validate correctly
      expect(validator.validateState(mockReq2, state2)).toBe(true);
    });
  });
});

/**
 * Helper function to create a mock Express request with session
 */
function createMockRequest(): OAuthRequest {
  return {
    session: {
      oauth: undefined,
    },
    correlationId: undefined,
  } as OAuthRequest;
}
