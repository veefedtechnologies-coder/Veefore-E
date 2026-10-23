## 2024-05-15 - [Insecure Randomness]
**Vulnerability:** Weak PRNG (Math.random()) used for sensitive credential generation.
**Learning:** Math.random() is predictable and should not be used for security-sensitive operations like password or OTP generation.
**Prevention:** Always use crypto.randomInt() or crypto.randomBytes() for security-related random generation.
