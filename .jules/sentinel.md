
## 2024-07-10 - Missing Authentication on Security Operations Dashboard
**Vulnerability:** The entire `server/routes/security.ts` router, which contains sensitive endpoints for threat intelligence, active threats, security metrics, and incident reports, was completely unauthenticated and public.
**Learning:** Even specialized "security" routers can be overlooked for basic authentication middleware, likely because they were added later or created for internal monitoring but exposed to the public API without safeguards.
**Prevention:** Always apply authentication/authorization middleware (`requireAdmin`, etc.) at the router level (using `router.use()`) immediately after initialization for any internal or administrative dashboards.
