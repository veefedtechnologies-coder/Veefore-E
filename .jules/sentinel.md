## 2026-07-01 - Predictable Randomness in Tokens
**Vulnerability:** Weak, predictable token generation using `Math.random()` for secure tokens (e.g., Workspace Invitations).
**Learning:** `Math.random()` is cryptographically insecure and should never be used for security-sensitive values like authentication tokens or invitations.
**Prevention:** Use a Cryptographically Secure Pseudorandom Number Generator (CSPRNG) such as Node.js's native `crypto.randomBytes()` for token generation.
