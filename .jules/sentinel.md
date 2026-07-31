## 2025-03-02 - Sentinel Security
**Vulnerability:** Weak random number generation in referral and invite codes, auth tokens.
**Learning:** `Math.random()` is not cryptographically secure and can be guessed, leading to broken access control, insecure randomness, session hijacking, or brute forcing invite codes/referral codes.
**Prevention:** Use Node.js native `crypto.randomBytes` or `crypto.randomInt` when generating random strings meant for authentication, invites, referrals, or tokens.
