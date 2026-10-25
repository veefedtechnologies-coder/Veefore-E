
## 2026-10-25 - Insecure Randomness and Deprecated Ciphers in Security Utils
**Vulnerability:**
The `security.ts` utilities used `Math.random()` to generate passwords and OTPs, and array shuffling was implemented via `sort(() => Math.random() - 0.5)`. Additionally, the encryption utilities used `crypto.createCipher` and `crypto.createDecipher`.
**Learning:**
`Math.random()` is not cryptographically secure, and the v8 `sort()` with `Math.random() - 0.5` is statistically biased, resulting in highly insecure array shuffling for cryptographic purposes. Furthermore, Node.js `crypto.createCipher` and `crypto.createDecipher` are deprecated as they ignore explicit initialization vectors (IVs), utilizing insecure key derivation instead.
**Prevention:**
Always use `crypto.randomInt()` for random selection/generation and implement the Fisher-Yates algorithm for secure shuffling. Ensure `crypto.createCipheriv` and `crypto.createDecipheriv` are used instead of deprecated variants, passing the explicit IV.
