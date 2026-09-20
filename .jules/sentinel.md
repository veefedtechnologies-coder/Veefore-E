## 2024-09-20 - Insecure Randomness in Admin Credentials
**Vulnerability:** Found `Math.random()` used for generating secure passwords, API keys, and OTPs in `admin-panel/server/utils/security.ts` and `credentialGenerator.ts`.
**Learning:** JavaScript's `Math.random()` is not cryptographically secure and can be predicted, leading to weak or reproducible administrative credentials.
**Prevention:** Always use Node.js `crypto.randomInt` or `crypto.randomBytes` for any security-sensitive randomness generation.
