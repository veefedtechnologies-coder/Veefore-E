## 2024-05-18 - [Fix insecure random token generation]
**Vulnerability:** Weak pseudo-random number generator (`Math.random()`) used for generating workspace invitation tokens.
**Learning:** `Math.random()` is predictable and not cryptographically secure, which allows attackers to predict token values and hijack invitations.
**Prevention:** Use Node.js's built-in `crypto` module (`crypto.randomBytes()`) for generating secure tokens and secrets.
