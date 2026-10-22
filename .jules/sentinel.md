## 2023-10-22 - [Insecure Randomness for Code Generation]
**Vulnerability:** Weak PRNG `Math.random()` used for generating sensitive tokens (Workspace Invite Codes, Referral Codes).
**Learning:** These codes are predictable and could be brute-forced or guessed. Node's native `crypto` module provides secure randomness.
**Prevention:** Always use `crypto.randomBytes()` or `crypto.randomInt()` for any sensitive token, ID, or password generation.
