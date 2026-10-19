## 2024-03-24 - [Insecure Randomness for Token Generation]
**Vulnerability:** Found Math.random() being used to generate team invitation tokens in WorkspaceController.ts.
**Learning:** Generating tokens with Math.random() is cryptographically insecure and vulnerable to prediction.
**Prevention:** Always use Node.js's native crypto module (e.g. crypto.randomBytes()) for generating sensitive values like tokens or passwords.
