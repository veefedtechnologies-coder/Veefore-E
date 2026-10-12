## 2024-05-24 - [Insecure Randomness in Team Invitations]
**Vulnerability:** `Math.random()` was used for generating sensitive team invitation tokens, leading to predictable tokens.
**Learning:** `Math.random()` is not cryptographically secure and should never be used for sensitive tokens or IDs.
**Prevention:** Always use `crypto.randomBytes()` or `crypto.randomUUID()` for security-sensitive operations.
