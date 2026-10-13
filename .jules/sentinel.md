
## 2024-05-31 - Replace Math.random with crypto.randomInt
**Vulnerability:** The `admin-panel/server/routes/waitlist.ts` route used `Math.random()` to generate a temporary `firebaseUid` for approved waitlist users (`const tempFirebaseUid = \`temp_approved_${Date.now()}_${Math.floor(Math.random() * 10000)}\`;`).
**Learning:** Even for temporary identifiers that aren't strict cryptographic tokens, using `Math.random()` triggers security warnings (SAST) and is a bad practice when generating IDs or secrets, violating the defense-in-depth philosophy.
**Prevention:** Always use Node.js's built-in `crypto` module (e.g., `crypto.randomInt()`) to generate random identifiers or values on the backend, instead of relying on `Math.random()`.
