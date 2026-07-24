## 2026-07-24 - [Remove Stack Trace Leak in Video Auth]
**Vulnerability:** The error response in `server/video-routes.ts` auth middleware leaked stack traces to clients during unauthorized errors.
**Learning:** Returning `error.stack` in production API responses can expose internals, making the application vulnerable to information disclosure.
**Prevention:** Avoid passing raw `error.stack` to response objects in API endpoints. Use standardized error handlers or check for development environment.
