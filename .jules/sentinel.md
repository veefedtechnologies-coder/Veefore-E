## 2024-05-18 - Fix Insecure Randomness in Token/Code Generation
**Vulnerability:** Found `Math.random()` used to generate sensitive tokens and codes (team invitation tokens and referral codes) across various services and controllers. `Math.random()` is not cryptographically secure and can be predictable.
**Learning:** These types of functions must always use cryptographic randomness when generating data that relies on unpredictability to prevent unauthorized access or abuse.
**Prevention:** Always use Node.js's native `crypto` module (e.g., `crypto.randomBytes()` or `crypto.randomInt()`) for generating sensitive or access-granting codes/tokens instead of `Math.random()`.
