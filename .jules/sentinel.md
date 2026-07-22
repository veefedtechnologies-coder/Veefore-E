## 2024-05-24 - [CRITICAL] Fix insecure random token generation
**Vulnerability:** Found `Math.random()` used to generate sensitive security tokens in multiple places, such as generating team invitation tokens in `WorkspaceController.ts`.
**Learning:** `Math.random()` is not cryptographically secure and the generated values are predictable, allowing an attacker to guess the token or reverse-engineer it to gain unauthorized access to workspaces.
**Prevention:** Always use the built-in `crypto` module (e.g. `crypto.randomBytes(32).toString('hex')`) or a vetted security library for generating any sensitive tokens or random values.
