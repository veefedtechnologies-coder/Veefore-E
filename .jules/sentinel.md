## 2024-10-27 - Security fixes for Math.random()
**Vulnerability:** Weak random number generation using Math.random() for security purposes (idempotency keys, temp passwords, etc).
**Learning:** Math.random() is predictable and should not be used for security purposes like tokens, keys, passwords.
**Prevention:** Always use cryptographically secure random number generators like crypto.randomBytes() or crypto.randomUUID() for security contexts.
