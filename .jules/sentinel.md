## 2024-05-18 - Insecure Randomness in Credential Generation
**Vulnerability:** Found `Math.random()` being used to generate passwords and OTPs in `admin-panel/server/utils/security.ts` and `admin-panel/server/utils/credentialGenerator.ts`.
**Learning:** `Math.random()` is not cryptographically secure and predictable, which can allow attackers to guess generated credentials.
**Prevention:** Always use `crypto.randomInt()` or `crypto.randomBytes()` for generating sensitive data like passwords, tokens, or OTPs.
