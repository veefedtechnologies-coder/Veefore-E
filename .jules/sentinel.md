## 2026-10-05 - Insecure Random Number Generation

**Vulnerability:** Found `Math.random().toString(36).substring(2, 9)` used for generating security-sensitive `req.correlationId` in `server/routes/auth.ts`.
**Learning:** Math.random() is statistically predictable and insecure for correlation IDs in an OAuth context, which could potentially expose flows to predictability or replay attacks.
**Prevention:** Use `crypto.randomBytes().toString('hex')` for all security-sensitive values instead of Math.random().
