## 2024-05-31 - [Math.random() replaced with crypto.randomInt() for tokens]
**Vulnerability:** Found `Math.random()` being used to generate random codes for Workspace Invites and Referral Codes. `Math.random()` is not cryptographically secure and tokens could be guessed.
**Learning:** `crypto.randomInt()` is the standard cryptographically secure replacement for integer-based index selection in Node.js, providing the equivalent to `Math.floor(Math.random() * max)`.
**Prevention:** Always use `crypto.randomBytes()` or `crypto.randomInt()` when generating sensitive tokens, codes, or IDs that are used for access control, referrals, or authentication.
