## 2026-07-08 - Prevent Information Disclosure in Video Auth
**Vulnerability:** The video authentication middleware (`server/video-routes.ts`) was returning raw error messages and full stack traces (`details` and `stack` fields) directly in the JSON response when authentication failed.
**Learning:** Sending raw exception objects or stack traces to the client bypasses general error handling and can leak sensitive server internals, configuration paths, or dependency details to unauthenticated users.
**Prevention:** Ensure custom authentication middleware in Express routes fails securely by returning generic error messages (e.g., `{ error: 'Unauthorized' }`) and logging the detailed stack trace server-side instead of returning it to the user.
