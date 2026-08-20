## 2025-03-09 - [Cryptographically Insecure Random Generation]
**Vulnerability:** Found multiple instances of `Math.random()` being used to generate sensitive information like passwords, OTPs, and temporary user IDs. This is predictable and can be exploited.
**Learning:** `Math.random()` in JS is not cryptographically secure and should never be used for security-critical contexts like passwords, tokens, or OTPs.
**Prevention:** Use Node.js's native `crypto` module (e.g., `crypto.randomBytes()`, `crypto.randomInt()`) or `crypto.randomUUID()` for all random generation needs in security contexts.
