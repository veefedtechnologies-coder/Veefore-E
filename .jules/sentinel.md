## 2024-05-24 - [Secure Randomness Enhancement]
**Vulnerability:** Used Math.random() to generate sensitive security tokens and unique IDs (e.g., Workspace invitation tokens and Firebase UIDs).
**Learning:** Found usage of Math.random().toString(36).substring() in server/controllers/WorkspaceController.ts and server/mongodb-storage.ts. Math.random() is not a cryptographically secure pseudo-random number generator (CSPRNG). Using it for tokens can lead to predictable token generation, making invitation links guessable.
**Prevention:** Always use Node.js built-in crypto.randomBytes() or other cryptographically secure methods for generating tokens, session IDs, passwords, and sensitive unique identifiers.
