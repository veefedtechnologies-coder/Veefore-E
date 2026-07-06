## 2025-03-09 - [Insecure Randomness for Security Tokens]
**Vulnerability:** Found `Math.random().toString(36).substring(...)` being used to generate team invitation tokens in `server/controllers/WorkspaceController.ts`.
**Learning:** `Math.random()` produces predictable values that can be guessed by attackers, leading to privilege escalation (unauthorized users joining workspaces).
**Prevention:** Always use `crypto.randomBytes().toString('hex')` or similar cryptographically secure pseudo-random number generators (CSPRNG) for sensitive tokens.
