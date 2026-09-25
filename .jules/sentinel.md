## 2025-02-15 - [HIGH] Fix Insecure Random Number Generation for Security Tokens
**Vulnerability:** The codebase was using `Math.random()` to generate sensitive strings like workspace team invitation tokens and user referral codes, which can be predicted or brute-forced due to the lack of a cryptographically secure random number generator (CSPRNG).
**Learning:** `Math.random()` should never be used for security purposes. The application should rely on Node.js native `crypto` module.
**Prevention:** Always use `crypto.randomBytes(size).toString('hex')` or `crypto.randomInt()` when generating tokens, passwords, API keys, or referral codes instead of non-secure pseudorandom APIs.
