## 2024-05-17 - Replace Math.random with crypto.randomBytes
**Vulnerability:** Weak random number generation using `Math.random()` for sensitive IDs (like temporary `firebaseUid`s in user approval logic).
**Learning:** `Math.random()` is not cryptographically secure and predictable, which could theoretically allow attackers to guess or collide sensitive IDs generated, although in this case they were temporary.
**Prevention:** Always use Node.js's native `crypto` module (e.g. `crypto.randomBytes()`) for generating any sensitive or unique identifier values that require unpredictability.
