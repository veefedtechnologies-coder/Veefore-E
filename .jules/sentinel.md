## 2024-05-18 - Math.random() in Referral Code Generation
**Vulnerability:** Weak random number generation (`Math.random()`) used for referral code generation in `server/storage/converters.ts`.
**Learning:** This is not cryptographically secure and could be predictable.
**Prevention:** Use Node.js native `crypto` module (e.g., `crypto.randomInt()`) for secure randomness.
