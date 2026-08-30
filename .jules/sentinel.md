## 2025-02-14 - Replace Math.random with cryptographically secure generator for temporary UIDs
**Vulnerability:** Predictable token generation using Math.random() for sensitive UIDs.
**Learning:** Using Math.random() for generating sensitive IDs or tokens is a security risk because it is not cryptographically secure, leading to predictable outputs.
**Prevention:** Always use Node's native crypto module, such as crypto.randomInt(), for generating tokens, session IDs, or passwords.
