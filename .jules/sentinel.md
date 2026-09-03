## 2024-05-15 - [Insecure Team Invitation Token Generation]
**Vulnerability:** The system generated team invitation tokens using `Math.random()`, which is not cryptographically secure and could allow token prediction or brute-forcing by attackers.
**Learning:** The ubiquitous use of `Math.random()` for general IDs in the codebase accidentally leaked into auth-critical functions because the distinction between "random string" and "secure random string" was missed.
**Prevention:** Always use Node's native `crypto` module (`crypto.randomBytes()`) or equivalent for generating any sensitive tokens, session IDs, or passwords.
