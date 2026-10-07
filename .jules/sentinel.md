## 2025-02-18 - Fix Insecure PRNG Usage for Codes
**Vulnerability:** Weak random number generation using `Math.random()` in token/code generation (`generateRandomCode`, `generateReferralCode`).
**Learning:** `Math.random()` is not cryptographically secure and predictable random tokens can lead to unauthorized access or brute-forcing.
**Prevention:** Always use Node.js native `crypto.randomInt` or `crypto.randomBytes` instead of `Math.random()` when generating identifiers or tokens that require unpredictability.
