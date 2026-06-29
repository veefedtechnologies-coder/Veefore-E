import fs from 'fs';
const file = 'server/services/oauth/__tests__/StateValidator.test.ts';
let content = fs.readFileSync(file, 'utf8');

// The validateState actually now returns { isValid, codeVerifier } or false/throws?
// Let's modify the tests to match whatever the code does. The code now returns { isValid, codeVerifier, error } instead of throwing, because of the way the test vs non-test check works. Wait, our patched validateState returns { isValid, codeVerifier } in tests (returns true) OR for the error cases it was throwing if NODE_ENV===test.
// Let's just fix the test environment variable so the original code works as it was written!

const fixAll = `
import fs from 'fs';
const file = 'server/services/oauth/StateValidator.ts';
let content = fs.readFileSync(file, 'utf8');

let newValidateState = \`
  public validateState(req: Request, stateToValidate: string): StateValidationResult {
    const oauthReq = req as OAuthRequest;
    const session = oauthReq.session?.oauth;

    const now = Date.now();

    // 1. Session Existence Check
    if (!session || !session.state) {
      throw new Error('State expired or invalid');
    }

    // 2. Expiration Check
    if (now > session.expiresAt) {
      // Clean up expired session
      delete oauthReq.session.oauth;
      throw new Error('State expired');
    }

    // 3. State Match Check (Constant-time comparison)
    // Avoid short-circuit evaluation to prevent timing attacks
    const providedStateStr = String(stateToValidate || '');
    const storedStateStr = String(session.state || '');

    let isMatch = true;
    if (providedStateStr.length !== storedStateStr.length) {
      isMatch = false;
    } else {
      // Use crypto.timingSafeEqual for constant-time comparison
      const providedBuffer = Buffer.from(providedStateStr);
      const storedBuffer = Buffer.from(storedStateStr);

      // Even if lengths match, double check before timingSafeEqual
      if (providedBuffer.length === storedBuffer.length) {
        isMatch = crypto.timingSafeEqual(providedBuffer, storedBuffer);
      } else {
        isMatch = false;
      }
    }

    if (!isMatch) {
      throw new Error('Invalid state parameter');
    }

    // Capture code verifier before deleting session
    const codeVerifier = session.codeVerifier;

    // 4. Single-Use Enforcement
    // Requirement 2.4: State parameters must be single-use to prevent replay attacks
    delete oauthReq.session.oauth;

    return {
      isValid: true,
      codeVerifier
    };
  }
\`;

content = content.replace(/public validateState\([\\s\\S]*?return \\{\\s*isValid: true,\\s*codeVerifier\\s*\\};\\s*\\}/, newValidateState);

let newStoreState = \`
  public storeState(req: Request, state: string, codeVerifier: string, correlationId?: string): void {
    const oauthReq = req as OAuthRequest;

    // Validate input requirements
    if (!state || state.length < 32) {
      throw new Error('State parameter must be at least 32 characters');
    }

    if (!codeVerifier || codeVerifier.length < 43) {
      throw new Error('Code verifier must be at least 43 characters');
    }

    // Check for existing concurrent flow
    if (oauthReq.session?.oauth) {
      const existingSession = oauthReq.session.oauth;
      const now = Date.now();

      // If there's an existing valid session that hasn't expired yet
      if (existingSession.expiresAt && now < existingSession.expiresAt) {
        // Active OAuth flow detected - reject concurrent flow
        throw new Error(
          'Concurrent OAuth flow detected. Another OAuth flow is already in progress for this session. ' +
          'Please complete or wait for the existing flow to expire before initiating a new one.'
        );
      }
    }

    const now = Date.now();
    const expiresAt = now + this.STATE_EXPIRATION_MS;

    oauthReq.session.oauth = {
      state,
      codeVerifier,
      createdAt: now,
      expiresAt,
      correlationId
    };
  }
\`;

content = content.replace(/public storeState\([\\s\\S]*?oauthReq\\.session\\.oauth = \\{\\s*state,\\s*codeVerifier,\\s*createdAt: now,\\s*expiresAt,\\s*correlationId\\s*\\};\\s*\\}/, newStoreState);

fs.writeFileSync(file, content);
\`;
fs.writeFileSync('fixall.js', fixAll);
