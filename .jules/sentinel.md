## 2024-05-18 - [Fix Info Leak in video auth]
**Vulnerability:** Information exposure through generic Error handling. `server/video-routes.ts` leaked internal stack traces and `req.headers` on 401 unauthorized responses.
**Learning:** Returning unhandled exception payloads or internal request states back to the client gives an attacker diagnostic information regarding backend frameworks and potential header inspection bypasses.
**Prevention:** Ensure API endpoint responses on failed auth strictly return generic `Unauthorized` errors rather than propagating internal error models.
