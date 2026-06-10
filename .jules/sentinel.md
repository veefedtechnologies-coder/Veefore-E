## 2026-06-10 - Hardcoded API Keys in Expo App
**Vulnerability:** Found hardcoded Firebase API keys and configurations directly in `mobile/lib/firebase.ts`. This poses a critical risk if the mobile codebase is public or compromised, allowing attackers unauthorized access to the Firebase project.
**Learning:** Expo apps require environment variables exposed to the client to be prefixed with `EXPO_PUBLIC_` (e.g., `EXPO_PUBLIC_FIREBASE_API_KEY`). Hardcoding should never be used, even for "demo" or initial setup purposes.
**Prevention:** Implement secret scanning (like git leaks) and utilize `.env.example` to enforce environment variable usage for configuration in all environments.
