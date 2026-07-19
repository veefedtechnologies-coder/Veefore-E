## 2024-05-15 - Insecure Randomness in Token Generation
**Vulnerability:** Found `Math.random()` used to generate workspace invite codes (`WorkspaceRepository.ts`) and user referral codes (`converters.ts`).
**Learning:** `Math.random()` is not cryptographically secure and predictable, which could allow attackers to guess invite/referral codes.
**Prevention:** Always use Node.js `crypto` module (e.g., `crypto.randomInt` or `crypto.randomBytes`) for generating tokens, invite codes, referral codes, or any other sensitive random values.
