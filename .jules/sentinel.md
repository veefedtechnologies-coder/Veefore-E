## 2024-05-28 - Insecure Randomness in Invitation Tokens
**Vulnerability:** The application was using `Math.random().toString(36).substring(2, 15)` to generate tokens for team workspace invitations. `Math.random()` is not a cryptographically secure pseudorandom number generator (CSPRNG), making the tokens predictable and susceptible to brute-forcing, potentially leading to unauthorized access to workspaces.
**Learning:** Functions like `Math.random()` should never be used for generating sensitive information, such as authentication tokens, passwords, or session IDs.
**Prevention:** Always use a CSPRNG, such as Node.js's native `crypto` module (`crypto.randomBytes()`) for generating secure, unpredictable tokens.
