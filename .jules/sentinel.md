
## 2024-06-17 - [CRITICAL] Replace Weak PRNG with Cryptographically Secure RNG for Tokens
**Vulnerability:** The application used `Math.random().toString(36).substring(2, 15)` to generate tokens for team invitations. This approach is predictable and not cryptographically secure, allowing attackers to potentially guess the token and gain unauthorized access to invitations.
**Learning:** `Math.random()` should never be used for security-sensitive values like authentication tokens, password reset links, or invitation keys. This is a common pattern when developers need a quick random string but don't consider the security implications.
**Prevention:** Always use Node.js's native `crypto.randomBytes(size).toString('hex')` or similar cryptographically secure functions for generating tokens, keys, passwords, and other security-sensitive data.
