## 2026-10-02 - Insecure Random Token Generation Fix
**Vulnerability:** Weak random number generation using `Math.random().toString(36)` for workspace invitation tokens and temporary file upload suffixes.
**Learning:** `Math.random()` is not cryptographically secure and its outputs are predictable. Using it for security-sensitive tokens can allow attackers to predict token values, compromising system integrity (e.g. forging team invitations or predicting file names for subsequent attacks).
**Prevention:** Always use Node's native `crypto.randomBytes()` or `crypto.randomInt()` (or equivalent secure PRNGs) when generating sensitive random data such as tokens, IDs used for auth, or file suffixes where predictability could pose a security risk.
