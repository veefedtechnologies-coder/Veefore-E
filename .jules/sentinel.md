
## 2026-07-21 - Replace insecure Math.random() in correlationId generation
**Vulnerability:** Used cryptographically insecure `Math.random()` to generate `correlationId` strings in authentication routes (`server/routes/auth.ts`, `server/routes/v1/google-auth.routes.ts`). While primarily used for tracing, using weak randomness in authentication/authorization contexts risks predictable IDs that could potentially be exploited to correlate requests maliciously or interfere with OAuth flows.
**Learning:** Developers sometimes reach for `Math.random()` for quick ID generation, even in security-sensitive modules. This pattern must be replaced with strong, cryptographically secure functions like `crypto.randomBytes()`.
**Prevention:** Enforce static analysis rules (e.g., ESLint rules) prohibiting the use of `Math.random()` anywhere in the codebase for generating tokens, session IDs, or any correlation markers associated with authenticated requests. Always default to Node's `crypto` module.
