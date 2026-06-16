## Sentinel Journal

## 2025-02-14 - Removed Hardcoded Fallback Secrets
**Vulnerability:** Several sensitive cryptographic operations (session signing, JWT signing, webhook verification) fell back to hardcoded strings like 'development-secret' or 'fallback-secret-for-development' if environment variables were missing. In a misconfigured production environment, this would allow attackers to easily forge tokens or sessions.
**Learning:** Hardcoded fallbacks are convenient for local development but create severe risks if deployed without properly configured environment variables. The lack of a fail-secure mechanism (like throwing an error or generating a random ephemeral secret) makes the system fail open in production.
**Prevention:** Always check `process.env.NODE_ENV === 'production'` when providing fallback secrets. Strictly require real secrets (throw errors or use secure random bytes) in production environments. Never hardcode fallback strings that can be used in a live environment.
