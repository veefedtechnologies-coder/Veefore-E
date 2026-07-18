
## 2024-05-31 - Replace Insecure Random Generation with Crypto Module
**Vulnerability:** Found `Math.random()` being used to generate `tempFirebaseUid` (which acts as a temporary identifier/token-like value). Using `Math.random()` for any sensitive, unique, or potentially secure identifiers is a security risk as it is predictable and not cryptographically secure.
**Learning:** Temporary tokens or unique identifiers shouldn't be generated using `Math.random()`, even if they are just placeholders, as they can sometimes become long-lived or expose patterns.
**Prevention:** Always use Node.js `crypto` module (e.g., `crypto.randomBytes()`) for generating secure random strings, tokens, and IDs.
