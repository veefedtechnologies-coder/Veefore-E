## 2026-07-30 - Math.random() Usage For Secure Tokens
**Vulnerability:** Found `Math.random()` being used to generate team invitation tokens in `server/controllers/WorkspaceController.ts`.
**Learning:** The application was using weak pseudo-random number generation for sensitive tokens, which could theoretically allow attackers to predict token values.
**Prevention:** Always use cryptographically secure RNGs like `crypto.randomBytes()` from Node.js core for generating tokens, secrets, or identifiers.
