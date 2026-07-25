
## 2024-07-25 - Fix insecure random token generation
**Vulnerability:** Found `Math.random()` being used to generate sensitive team invitation tokens, temporary firebase UIDs, and media/job IDs. `Math.random()` is not cryptographically secure, which could allow attackers to predict token values, leading to unauthorized access, brute-forcing, or bypassing intended protections.
**Learning:** Security tokens and IDs that provide access to sensitive functionality or act as authentication mechanisms must use cryptographically secure random number generators (CSPRNG). Relying on native Math.random() is a common but dangerous anti-pattern.
**Prevention:** Enforce the use of the native `crypto` module (e.g., `crypto.randomBytes()`) for generating all security-related tokens, identifiers, and secrets in Node.js applications. Consider implementing ESLint rules like `eslint-plugin-security` to detect and flag `Math.random()` usages for sensitive contexts.
